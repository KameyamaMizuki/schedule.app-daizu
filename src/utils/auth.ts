/**
 * API認証ユーティリティ
 * セッショントークン形式: st.<発行秒b36>.<userId>.<HMAC-SHA256先頭32hex>
 */
import { createHmac } from 'crypto';

export const FAMILY_USER_IDS = [
  'U687f86855c46490c030499f5393c8a7e',
  'U4b13048aa2906b929c3139c4f3dfdd7c',
  'Ua8420309a164fffdbdd7f300f4c1cc94'
];

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30日

function sign(tsB36: string, userId: string, secret: string): string {
  return createHmac('sha256', secret).update(`st:${tsB36}.${userId}`).digest('hex').slice(0, 32);
}

export function generateSessionToken(userId: string, secret: string, now: number = Date.now()): string {
  const tsB36 = Math.floor(now / 1000).toString(36);
  return `st.${tsB36}.${userId}.${sign(tsB36, userId, secret)}`;
}

export function verifySessionToken(token: string, secret: string, now: number = Date.now()): string | null {
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'st') return null;
  const [, tsB36, userId, hmac] = parts;
  const created = parseInt(tsB36, 36) * 1000;
  if (isNaN(created) || now - created > SESSION_TTL_MS) return null;
  if (hmac !== sign(tsB36, userId, secret)) return null;
  if (!FAMILY_USER_IDS.includes(userId)) return null;
  return userId;
}

/** LINEのIDトークンを検証しuserId(家族のみ)を返す。POST /account/auth/liff 用 */
export async function verifyLiffIdToken(idToken: string, channelId: string): Promise<string | null> {
  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId })
  });
  if (!res.ok) return null;
  const data = await res.json() as { sub?: string };
  return data.sub && FAMILY_USER_IDS.includes(data.sub) ? data.sub : null;
}

export function extractBearer(event: { headers: Record<string, string | undefined> }): string | null {
  const h = event.headers?.Authorization || event.headers?.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  return h.slice(7);
}
