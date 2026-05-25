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

interface FlexButton {
  label: string;
  uri?: string;
  text?: string;
}

/** Flex Bubble を生成（ヘッダー + 本文 + ボタン） */
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

  const footerContents = buttons.map(btn => {
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
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [{ type: 'text', text: title, color: '#ffffff', weight: 'bold', size: 'md' }],
      backgroundColor: headerColor,
      paddingAll: '14px'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: bodyContents,
      spacing: 'sm',
      paddingAll: '16px'
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: footerContents,
      spacing: 'sm',
      paddingAll: '12px'
    }
  };
}

/** メニュー用 Flex Bubble（リッチメニュー代わり） */
export function buildMenuFlexBubble(homeUrl: string, dashboardUrl: string, liffUrl: string): Record<string, unknown> {
  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [{ type: 'text', text: '📋 メニュー', color: '#ffffff', weight: 'bold', size: 'md' }],
      backgroundColor: FLEX_COLORS.SCHEDULE,
      paddingAll: '14px'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
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
        {
          type: 'button',
          action: { type: 'uri', label: '🏠 サイトを開く', uri: homeUrl },
          style: 'primary',
          color: FLEX_COLORS.SITE_BUTTON,
          height: 'sm'
        }
      ],
      spacing: 'sm',
      paddingAll: '12px'
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
