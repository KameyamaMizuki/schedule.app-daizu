/**
 * LINE API共通ユーティリティ
 */

import { FLEX_COLORS } from './constants';

export interface QuickReplyItem {
  type: 'action';
  action:
    | { type: 'message'; label: string; text: string }
    | { type: 'uri'; label: string; uri: string };
}

/** 共通Quick Replyボタン（全Flex応答の下に表示） */
export function getCommonQuickReply(dashboardUrl: string, homeUrl?: string, liffUrl?: string): { items: QuickReplyItem[] } {
  const daizuAction: QuickReplyItem = liffUrl
    ? { type: 'action', action: { type: 'uri', label: '🐕 だいず', uri: `${liffUrl}?mode=daizu` } }
    : { type: 'action', action: { type: 'message', label: '🐕 だいず', text: 'だいず' } };

  return {
    items: [
      { type: 'action', action: { type: 'message', label: '📅 今日の予定', text: '今日' } },
      daizuAction,
      { type: 'action', action: { type: 'message', label: '📋 メニュー', text: 'メニュー' } },
      { type: 'action', action: { type: 'uri', label: '🏠 サイト', uri: homeUrl || dashboardUrl } }
    ]
  };
}

// ========== Flex Message ビルダー ==========

export interface FlexButton {
  label: string;
  uri?: string;
  text?: string;
}

/** 「今日の予定」1メンバー分の行データ */
export interface ScheduleRow {
  /** 表示名 */
  name: string;
  /** 在宅時間ラベル（「終日」「9時〜・17時〜」等）。isOff=true のときは無視され「お休み」表示になる */
  timeLabel: string;
  /** true のとき「お休み」をグレーで表示する */
  isOff: boolean;
  /** 備考（あれば行の下にxsグレー・折返しで表示） */
  note?: string;
}

/** ヘッダー（タイトル1行・背景色つき）を生成する共通ヘルパー */
function buildHeaderBox(title: string, headerColor: string): Record<string, unknown> {
  return {
    type: 'box',
    layout: 'vertical',
    contents: [{ type: 'text', text: title, color: '#ffffff', weight: 'bold', size: 'md' }],
    backgroundColor: headerColor,
    paddingAll: '14px'
  };
}

/**
 * ボタン配列からフッターBoxを生成する共通ヘルパー。
 * ボタンが1つも無い場合は undefined を返す（contentsが空のBoxはLINE Flex仕様上不正なため）。
 * ボタンがある場合は先頭に separator を挟んでから並べる。
 */
function buildFooterBox(buttons: FlexButton[], headerColor: string): Record<string, unknown> | undefined {
  if (buttons.length === 0) return undefined;

  const buttonContents = buttons.map(btn => {
    if (btn.uri) {
      return {
        type: 'button',
        action: { type: 'uri', label: btn.label, uri: btn.uri },
        style: 'primary',
        color: headerColor,
        height: 'sm'
      };
    }
    return {
      type: 'button',
      action: { type: 'message', label: btn.label, text: btn.text || btn.label },
      style: 'secondary',
      height: 'sm'
    };
  });

  return {
    type: 'box',
    layout: 'vertical',
    contents: [{ type: 'separator', margin: 'md' }, ...buttonContents],
    spacing: 'sm',
    paddingAll: '12px'
  };
}

/** Flex Bubble を生成（ヘッダー + 本文（プレーンな行の並び） + ボタン） */
export function buildFlexBubble(
  title: string,
  headerColor: string,
  bodyTexts: string[],
  buttons: FlexButton[]
): Record<string, unknown> {
  const bodyContents = bodyTexts.map(t => ({
    type: 'text',
    text: t,
    size: 'sm',
    color: FLEX_COLORS.BODY_TEXT,
    wrap: true
  }));

  const footer = buildFooterBox(buttons, headerColor);

  return {
    type: 'bubble',
    header: buildHeaderBox(title, headerColor),
    body: {
      type: 'box',
      layout: 'vertical',
      contents: bodyContents,
      spacing: 'sm',
      paddingAll: '16px'
    },
    ...(footer ? { footer } : {})
  };
}

/**
 * 通知系Flex Bubble を生成（1行目=誰が何をした(太字md)、2行目=プレビュー(灰色sm・任意)）。
 * 日記/様子/スケジュール更新の通知で使用。区切り線付きフッター。
 */
export function buildNotifyFlexBubble(
  title: string,
  headerColor: string,
  headline: string,
  preview: string | undefined,
  buttons: FlexButton[]
): Record<string, unknown> {
  const bodyContents: Record<string, unknown>[] = [
    { type: 'text', text: headline, weight: 'bold', size: 'md', color: FLEX_COLORS.BODY_TEXT, wrap: true }
  ];
  if (preview) {
    bodyContents.push({ type: 'text', text: preview, size: 'sm', color: FLEX_COLORS.MUTED, wrap: true, margin: 'sm' });
  }

  const footer = buildFooterBox(buttons, headerColor);

  return {
    type: 'bubble',
    header: buildHeaderBox(title, headerColor),
    body: {
      type: 'box',
      layout: 'vertical',
      contents: bodyContents,
      spacing: 'sm',
      paddingAll: '16px'
    },
    ...(footer ? { footer } : {})
  };
}

/** 「今日の予定」1メンバー分の行Boxを生成（baseline: 名前bold flex2 / 時間右寄せflex3、備考は下にxs） */
function buildScheduleRowBox(row: ScheduleRow): Record<string, unknown> {
  const nameText = {
    type: 'text',
    text: row.name,
    weight: 'bold',
    size: 'sm',
    color: FLEX_COLORS.BODY_TEXT,
    flex: 2
  };

  const timeText: Record<string, unknown> = {
    type: 'text',
    text: row.isOff ? 'お休み' : row.timeLabel,
    size: 'sm',
    color: row.isOff ? FLEX_COLORS.MUTED : FLEX_COLORS.SCHEDULE,
    align: 'end',
    flex: 3
  };
  if (!row.isOff) {
    timeText.weight = 'bold';
  }

  const rowContents: Record<string, unknown>[] = [
    { type: 'box', layout: 'baseline', contents: [nameText, timeText], spacing: 'sm' }
  ];
  if (row.note) {
    rowContents.push({ type: 'text', text: row.note, size: 'xs', color: FLEX_COLORS.MUTED, wrap: true, margin: 'xs' });
  }

  return { type: 'box', layout: 'vertical', contents: rowContents };
}

/**
 * 「今日の予定」Flex Bubble を生成。日付を大きくヘッダーに表示し、
 * メンバーごとに1行（baseline: 名前bold / 在宅時間 or お休み）で並べる。
 * rows が空のときは案内メッセージのみ表示する。
 */
export function buildTodayScheduleFlexBubble(
  dateLabel: string,
  rows: ScheduleRow[],
  buttons: FlexButton[],
  emptyMessage = 'まだ予定が登録されていません。'
): Record<string, unknown> {
  const bodyContents: Record<string, unknown>[] = rows.length === 0
    ? [{ type: 'text', text: emptyMessage, size: 'sm', color: FLEX_COLORS.MUTED, wrap: true }]
    : rows.map(buildScheduleRowBox);

  const footer = buildFooterBox(buttons, FLEX_COLORS.SCHEDULE);

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: dateLabel, color: '#ffffff', weight: 'bold', size: 'xl' },
        { type: 'text', text: '今日の予定', color: '#ffffff', size: 'sm' }
      ],
      backgroundColor: FLEX_COLORS.SCHEDULE,
      paddingAll: '16px',
      spacing: 'xs'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: bodyContents,
      spacing: rows.length === 0 ? 'sm' : 'md',
      paddingAll: '16px'
    },
    ...(footer ? { footer } : {})
  };
}

/**
 * 週次リマインダー用 Flex Bubble を生成。週範囲を見出しに大きく表示し、
 * 案内文を1行目太字・2行目以降グレーで短く階層化する。
 */
export function buildReminderFlexBubble(
  weekRangeLabel: string,
  guidanceLines: string[],
  buttons: FlexButton[]
): Record<string, unknown> {
  const bodyContents = guidanceLines.map((line, idx) => {
    const t: Record<string, unknown> = {
      type: 'text',
      text: line,
      size: idx === 0 ? 'md' : 'sm',
      color: idx === 0 ? FLEX_COLORS.BODY_TEXT : FLEX_COLORS.MUTED,
      wrap: true
    };
    if (idx === 0) {
      t.weight = 'bold';
    } else {
      t.margin = 'xs';
    }
    return t;
  });

  const footer = buildFooterBox(buttons, FLEX_COLORS.REMINDER);

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: '🔔 来週の予定入力', color: '#ffffff', size: 'sm' },
        { type: 'text', text: weekRangeLabel, color: '#ffffff', weight: 'bold', size: 'xl', wrap: true }
      ],
      backgroundColor: FLEX_COLORS.REMINDER,
      paddingAll: '16px',
      spacing: 'xs'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: bodyContents,
      spacing: 'sm',
      paddingAll: '16px'
    },
    ...(footer ? { footer } : {})
  };
}

/** メニュー用 Flex Bubble（リッチメニュー代わり）。ボタン構成は維持しつつ視覚階層を整理 */
export function buildMenuFlexBubble(homeUrl: string, dashboardUrl: string, liffUrl: string): Record<string, unknown> {
  return {
    type: 'bubble',
    header: buildHeaderBox('📋 メニュー', FLEX_COLORS.SCHEDULE),
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: '使いたい機能を選んでね', size: 'sm', color: FLEX_COLORS.MUTED, wrap: true },
        {
          type: 'button',
          action: { type: 'message', label: '📅 今日の予定', text: '今日' },
          style: 'secondary',
          height: 'sm'
        },
        {
          type: 'button',
          action: { type: 'uri', label: '🐕 だいずの様子', uri: `${liffUrl}?mode=daizu` },
          style: 'secondary',
          height: 'sm'
        },
        {
          type: 'button',
          action: { type: 'uri', label: '📝 日記を入力', uri: `${dashboardUrl}?tab=diary&action=new` },
          style: 'secondary',
          height: 'sm'
        },
        { type: 'separator', margin: 'md' },
        {
          type: 'button',
          action: { type: 'uri', label: '🏠 サイトを開く', uri: homeUrl },
          style: 'primary',
          color: FLEX_COLORS.SITE_BUTTON,
          height: 'sm'
        }
      ],
      spacing: 'sm',
      paddingAll: '16px'
    }
  };
}

// ========== 送信関数 ==========

/**
 * テキストメッセージをプッシュ送信
 */
export async function pushMessage(
  groupId: string,
  text: string,
  channelAccessToken: string,
  quickReply?: { items: QuickReplyItem[] }
): Promise<void> {
  const message: Record<string, unknown> = { type: 'text', text };
  if (quickReply) {
    message.quickReply = quickReply;
  }
  await sendPush(groupId, [message], channelAccessToken);
}

/**
 * Flex Messageをプッシュ送信
 */
export async function pushFlexMessage(
  groupId: string,
  altText: string,
  flexContent: Record<string, unknown>,
  channelAccessToken: string,
  quickReply?: { items: QuickReplyItem[] }
): Promise<void> {
  const message: Record<string, unknown> = {
    type: 'flex',
    altText,
    contents: flexContent
  };
  if (quickReply) {
    message.quickReply = quickReply;
  }
  await sendPush(groupId, [message], channelAccessToken);
}

/**
 * Flex Messageをリプライ送信
 */
export async function replyFlexMessage(
  replyToken: string,
  altText: string,
  flexContent: Record<string, unknown>,
  channelAccessToken: string,
  quickReply?: { items: QuickReplyItem[] }
): Promise<void> {
  const message: Record<string, unknown> = {
    type: 'flex',
    altText,
    contents: flexContent
  };
  if (quickReply) {
    message.quickReply = quickReply;
  }
  await sendReply(replyToken, [message], channelAccessToken);
}

/** Push API 共通 */
async function sendPush(to: string, messages: Record<string, unknown>[], channelAccessToken: string): Promise<void> {
  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelAccessToken}`
    },
    body: JSON.stringify({ to, messages })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to push message:', errorText);
    throw new Error(`Push message failed: ${errorText}`);
  }
}

/** Reply API 共通 */
async function sendReply(replyToken: string, messages: Record<string, unknown>[], channelAccessToken: string): Promise<void> {
  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelAccessToken}`
    },
    body: JSON.stringify({ replyToken, messages })
  });

  if (!response.ok) {
    console.error('Failed to reply message:', await response.text());
  }
}
