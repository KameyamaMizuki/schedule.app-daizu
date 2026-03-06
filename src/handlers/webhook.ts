/**
 * LINE Webhook Handler
 * 署名検証、groupId保存、コマンド処理
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { validateSignature } from '../utils/signature';
import { getLineCredentials } from '../utils/secrets';
import { getSystemConfig, saveSystemConfig, getAllScheduleInputs, getScheduleInput } from '../utils/dynamodb';
import { pushMessage } from '../utils/line';
import { getCurrentWeekId, getDayOfWeekJa } from '../utils/weekId';
import { getDashboardUrl } from '../utils/constants';
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

const TIME_SLOT_LABELS: Record<string, string> = {
  allday: '終日',
  '09': '9時〜',
  '17': '17時〜',
  '21': '21時〜',
  '24': '24時〜'
};

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
  credentials: { adminUserId: string; channelAccessToken: string; liffUrl: string }
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

    // 一時的にユーザーIDを返信（設定後は削除）
    if (text === 'ID' && webhookEvent.replyToken) {
      await replyMessage(
        webhookEvent.replyToken,
        `あなたのユーザーID:\n${userId}`,
        credentials.channelAccessToken
      );
      return;
    }

    // 「修正」コマンド：管理者のみLIFFリンク返却
    if (text === '修正' && userId === credentials.adminUserId) {
      if (webhookEvent.replyToken) {
        await replyMessage(
          webhookEvent.replyToken,
          `修正用リンクです：\n${credentials.liffUrl}?mode=admin`,
          credentials.channelAccessToken
        );
      }
      return;
    }

    // 「今日」コマンド：今日のスケジュールを返信
    if (text === '今日' && webhookEvent.replyToken) {
      const message = await buildTodayScheduleMessage();
      await replyMessage(webhookEvent.replyToken, message, credentials.channelAccessToken);
      return;
    }

    // 「だいず」コマンド：だいずの様子を返信
    if (text === 'だいず' && webhookEvent.replyToken) {
      const message = await buildDaizuStatusMessage();
      await replyMessage(webhookEvent.replyToken, message, credentials.channelAccessToken);
      return;
    }

    // 1対1チャットからグループへ転送
    if (webhookEvent.source.type === 'user' && text) {
      const config = await getSystemConfig();
      if (config?.groupId) {
        await pushMessage(config.groupId, text, credentials.channelAccessToken);
        // 送信完了を通知
        if (webhookEvent.replyToken) {
          await replyMessage(
            webhookEvent.replyToken,
            'グループに送信しました ✓',
            credentials.channelAccessToken
          );
        }
      } else {
        // グループ未設定の場合
        if (webhookEvent.replyToken) {
          await replyMessage(
            webhookEvent.replyToken,
            'グループが未設定です。先にスケ助をグループに追加してください。',
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
 * 今日のスケジュールメッセージを生成
 */
async function buildTodayScheduleMessage(): Promise<string> {
  const now = new Date();
  const jstNow = toZonedTime(now, 'Asia/Tokyo');
  const todayStr = format(jstNow, 'yyyy-MM-dd');
  const weekId = getCurrentWeekId(now);
  const dayOfWeek = getDayOfWeekJa(todayStr);
  const month = jstNow.getMonth() + 1;
  const day = jstNow.getDate();

  const inputs = await getAllScheduleInputs(weekId);
  // daizu-status を除外
  const memberInputs = inputs.filter(i => i.userId !== 'daizu-status');

  if (memberInputs.length === 0) {
    return `📅 今日 (${month}/${day} ${dayOfWeek}) の予定\n\nまだ予定が登録されていません。\n\n▼登録はこちら\n${getDashboardUrl(weekId)}`;
  }

  let message = `📅 今日 (${month}/${day} ${dayOfWeek}) の予定\n`;

  for (const input of memberInputs) {
    const slots = input.slots || {};
    const timeSlots = ['allday', '09', '17', '21', '24'];

    // 終日チェック
    const isAllDay = slots[`${todayStr}:allday`];
    const activeSlots = timeSlots.filter(s => s !== 'allday' && slots[`${todayStr}:${s}`]);

    if (isAllDay) {
      message += `\n◯ ${input.displayName}: 終日`;
    } else if (activeSlots.length > 0) {
      const labels = activeSlots.map(s => TIME_SLOT_LABELS[s]);
      message += `\n◯ ${input.displayName}: ${labels.join(', ')}`;
    } else {
      message += `\n✕ ${input.displayName}: お休み`;
    }

    // 備考があれば追加
    if (input.notes?.[todayStr]) {
      message += ` (${input.notes[todayStr]})`;
    }
  }

  message += `\n\n▼詳細はこちら\n${getDashboardUrl(weekId)}`;
  return message;
}

/**
 * だいずの様子メッセージを生成
 */
async function buildDaizuStatusMessage(): Promise<string> {
  const now = new Date();
  const jstNow = toZonedTime(now, 'Asia/Tokyo');
  const todayStr = format(jstNow, 'yyyy-MM-dd');
  const weekId = getCurrentWeekId(now);
  const dayOfWeek = getDayOfWeekJa(todayStr);
  const month = jstNow.getMonth() + 1;
  const day = jstNow.getDate();

  const daizuData = await getScheduleInput(weekId, 'daizu-status');
  const note = daizuData?.notes?.[todayStr];

  if (note) {
    return `🐕 だいずの様子 (${month}/${day} ${dayOfWeek})\n\n${note}`;
  }

  return `🐕 だいずの様子 (${month}/${day} ${dayOfWeek})\n\n今日の記録はまだありません。\nカレンダーから入力してね！`;
}

async function replyMessage(
  replyToken: string,
  text: string,
  channelAccessToken: string
): Promise<void> {
  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelAccessToken}`
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }]
    })
  });

  if (!response.ok) {
    console.error('Failed to reply message:', await response.text());
  }
}
