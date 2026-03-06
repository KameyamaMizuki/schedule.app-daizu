/**
 * LINE API共通ユーティリティ
 */

export interface QuickReplyItem {
  type: 'action';
  action:
    | { type: 'message'; label: string; text: string }
    | { type: 'uri'; label: string; uri: string };
}

/**
 * LINEグループにメッセージをプッシュ送信
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

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelAccessToken}`
    },
    body: JSON.stringify({
      to: groupId,
      messages: [message]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to push message:', errorText);
    throw new Error(`Push message failed: ${errorText}`);
  }
}
