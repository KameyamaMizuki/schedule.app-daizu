/**
 * LINE Webhook Handler
 * 署名検証、groupId保存、コマンド処理（Flex Message対応）
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { createHmac } from 'crypto';
import { validateSignature } from '../utils/signature';
import { getLineCredentials, LineCredentials } from '../utils/secrets';
import { getSystemConfig, saveSystemConfig, getAllScheduleInputs, getScheduleInput } from '../utils/dynamodb';
import { pushMessage, replyFlexMessage, buildFlexBubble, buildMenuFlexBubble, buildTodayScheduleFlexBubble, getCommonQuickReply, ScheduleRow } from '../utils/line';
import { getCurrentWeekId, getDayOfWeekJa } from '../utils/weekId';
import { getDashboardUrl, getHomeUrl, FLEX_COLORS, TIME_SLOT_LABELS, TIME_SLOTS, DB_KEYS } from '../utils/constants';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

interface LineWebhookEvent {
  type: string;
  source: {
    type: string;
    groupId?: string;
    userId?: string;
  };
  message?: {
    type: string;
    text?: string;
  };
  replyToken?: string;
}

interface LineWebhookBody {
  events: LineWebhookEvent[];
  destination: string;
}

// TIME_SLOT_LABELS は constants.ts からインポート

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    // 署名検証
    const signature = event.headers['x-line-signature'] || event.headers['X-Line-Signature'] || '';
    const body = event.body || '';

    const credentials = await getLineCredentials();

    if (!validateSignature(body, signature, credentials.channelSecret)) {
      console.error('Invalid signature');
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid signature' })
      };
    }

    const webhookBody: LineWebhookBody = JSON.parse(body);

    for (const webhookEvent of webhookBody.events) {
      await handleEvent(webhookEvent, credentials);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'OK' })
    };
  } catch (error) {
    console.error('Webhook handler error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

async function handleEvent(
  webhookEvent: LineWebhookEvent,
  credentials: LineCredentials
): Promise<void> {
  // groupId保存（初回のみ）
  if (webhookEvent.source.type === 'group' && webhookEvent.source.groupId) {
    const config = await getSystemConfig();
    if (!config || !config.groupId) {
      await saveSystemConfig({
        groupId: webhookEvent.source.groupId,
        adminUserId: credentials.adminUserId,
        timezone: 'Asia/Tokyo'
      });
      console.log('Group ID saved:', webhookEvent.source.groupId);
    }
  }

  // メッセージイベント処理
  if (webhookEvent.type === 'message' && webhookEvent.message?.type === 'text') {
    const text = webhookEvent.message.text?.trim() || '';
    const userId = webhookEvent.source.userId || '';
    const dashboardUrl = getDashboardUrl();
    const homeUrl = getHomeUrl();
    const quickReply = getCommonQuickReply(dashboardUrl, homeUrl, credentials.liffUrl);

    // 「ログイン」コマンド：10分有効なトークン付きログインURLを返信
    if (text === 'ログイン' && webhookEvent.replyToken && userId) {
      const tsB36 = Math.floor(Date.now() / 1000).toString(36);
      const hmac = createHmac('sha256', credentials.channelSecret)
        .update(`${tsB36}.${userId}`)
        .digest('hex')
        .slice(0, 16);
      const token = `${tsB36}.${userId}.${hmac}`;
      const loginUrl = getDashboardUrl({ token });
      await replyFlexMessage(
        webhookEvent.replyToken,
        'ログインリンク',
        buildFlexBubble('🔓 ログイン', FLEX_COLORS.INFO,
          ['10分間有効なログインリンクです。', 'タップしてアプリを開いてください。'],
          [{ label: 'アプリを開く', uri: loginUrl }]
        ),
        credentials.channelAccessToken
      );
      return;
    }

    // 「ID」コマンド：ユーザーID返信
    if (text === 'ID' && webhookEvent.replyToken) {
      await replyFlexMessage(
        webhookEvent.replyToken,
        'ユーザーID',
        buildFlexBubble('🔑 ユーザーID', FLEX_COLORS.INFO, [userId], []),
        credentials.channelAccessToken
      );
      return;
    }

    // 「修正」コマンド：管理者のみLIFFリンク返却
    if (text === '修正' && userId === credentials.adminUserId) {
      if (webhookEvent.replyToken) {
        await replyFlexMessage(
          webhookEvent.replyToken,
          '修正用リンク',
          buildFlexBubble('🔧 管理者メニュー', FLEX_COLORS.ADMIN, ['修正用リンクです'], [
            { label: '管理ページを開く', uri: `${credentials.liffUrl}?mode=admin` }
          ]),
          credentials.channelAccessToken,
          quickReply
        );
      }
      return;
    }

    // 「メニュー」コマンド：リッチメニュー風Flexカード
    if (text === 'メニュー' && webhookEvent.replyToken) {
      await replyFlexMessage(
        webhookEvent.replyToken,
        'メニュー',
        buildMenuFlexBubble(getHomeUrl(), dashboardUrl, credentials.liffUrl),
        credentials.channelAccessToken,
        quickReply
      );
      return;
    }

    // 「今日」コマンド：今日のスケジュールをFlex Messageで返信
    if (text === '今日' && webhookEvent.replyToken) {
      const flex = await buildTodayScheduleFlex();
      await replyFlexMessage(
        webhookEvent.replyToken,
        '今日の予定',
        flex,
        credentials.channelAccessToken,
        quickReply
      );
      return;
    }

    // 「だいず」コマンド：現在の様子を表示 + LIFF入力ボタン
    if (text === 'だいず' && webhookEvent.replyToken) {
      const now = new Date();
      const jstNow = toZonedTime(now, 'Asia/Tokyo');
      const todayStr = format(jstNow, 'yyyy-MM-dd');
      const weekId = getCurrentWeekId(now);
      const daizuData = await getScheduleInput(weekId, DB_KEYS.DAIZU_STATUS_USER);
      const note = daizuData?.notes?.[todayStr];
      const dayOfWeek = getDayOfWeekJa(todayStr);
      const month = jstNow.getMonth() + 1;
      const day = jstNow.getDate();

      const bodyTexts = note
        ? [`${month}/${day}(${dayOfWeek})の記録:`, note]
        : [`${month}/${day}(${dayOfWeek})の記録はまだありません。`];

      const flex = buildFlexBubble(
        `🐕 だいずの様子`,
        FLEX_COLORS.DAIZU,
        bodyTexts,
        [{ label: '様子を入力する', uri: `${credentials.liffUrl}?mode=daizu` }]
      );
      await replyFlexMessage(
        webhookEvent.replyToken,
        'だいずの様子',
        flex,
        credentials.channelAccessToken,
        quickReply
      );
      return;
    }

    // 1対1チャットからグループへ転送（テキストのまま）
    if (webhookEvent.source.type === 'user' && text) {
      const config = await getSystemConfig();
      if (config?.groupId) {
        await pushMessage(config.groupId, text, credentials.channelAccessToken);
        if (webhookEvent.replyToken) {
          await replyFlexMessage(
            webhookEvent.replyToken,
            '送信完了',
            buildFlexBubble('✅ 送信完了', FLEX_COLORS.SUCCESS, ['グループに送信しました'], []),
            credentials.channelAccessToken,
            quickReply
          );
        }
      } else {
        if (webhookEvent.replyToken) {
          await replyFlexMessage(
            webhookEvent.replyToken,
            'エラー',
            buildFlexBubble('⚠️ グループ未設定', FLEX_COLORS.ERROR, ['先にスケ助をグループに追加してください。'], []),
            credentials.channelAccessToken
          );
        }
      }
      return;
    }

    // その他のメッセージは無視（静かな運用）
  }
}

/**
 * 今日のスケジュール Flex Message を生成
 */
async function buildTodayScheduleFlex(): Promise<Record<string, unknown>> {
  const now = new Date();
  const jstNow = toZonedTime(now, 'Asia/Tokyo');
  const todayStr = format(jstNow, 'yyyy-MM-dd');
  const weekId = getCurrentWeekId(now);
  const dayOfWeek = getDayOfWeekJa(todayStr);
  const month = jstNow.getMonth() + 1;
  const day = jstNow.getDate();
  const dashboardUrl = getDashboardUrl({ weekId });
  const dateLabel = `${month}/${day}(${dayOfWeek})`;

  const inputs = await getAllScheduleInputs(weekId);
  const memberInputs = inputs.filter(i => i.userId !== DB_KEYS.DAIZU_STATUS_USER);

  if (memberInputs.length === 0) {
    return buildTodayScheduleFlexBubble(dateLabel, [], [{ label: '予定を登録する', uri: dashboardUrl }]);
  }

  const rows: ScheduleRow[] = memberInputs.map(input => {
    const slots = input.slots || {};
    const timeSlots = TIME_SLOTS;
    const isAllDay = !!slots[`${todayStr}:allday`];
    const activeSlots = timeSlots.filter(s => s !== 'allday' && slots[`${todayStr}:${s}`]);

    let timeLabel: string;
    let isOff: boolean;
    if (isAllDay) {
      timeLabel = '終日';
      isOff = false;
    } else if (activeSlots.length > 0) {
      timeLabel = activeSlots.map(s => TIME_SLOT_LABELS[s]).join('・');
      isOff = false;
    } else {
      timeLabel = 'お休み';
      isOff = true;
    }

    const note = input.notes?.[todayStr];
    return { name: input.displayName, timeLabel, isOff, ...(note ? { note } : {}) };
  });

  return buildTodayScheduleFlexBubble(dateLabel, rows, [{ label: '詳細を見る', uri: dashboardUrl }]);
}

