/**
 * GET  /account                — 全家族メンバーの設定を一括取得
 * PUT  /account                — 自分の設定を更新（name/avatar/birthday）
 * POST /account/auth           — PIN照合（PC用）
 * PUT  /account/pin            — PIN設定・変更
 * POST /account/auth/line-token — LINEトークン検証（自動ログイン用）
 */

import bcrypt from 'bcryptjs';
import { createHmac } from 'crypto';
import { z } from 'zod';
import { AccountSettings } from '../types';
import { getAllAccountSettings, getAccountSettings, saveAccountSettings } from '../utils/dynamodb';
import { getLineCredentials } from '../utils/secrets';
import { withHandler, ok, err } from '../utils/handler';

/** webhook.ts の generateLoginToken と対になる検証関数 */
function verifyLoginToken(token: string, secret: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [tsB36, userId, hmac] = parts;
  const created = parseInt(tsB36, 36) * 1000;
  if (isNaN(created) || Date.now() - created > 10 * 60 * 1000) return null;
  const expected = createHmac('sha256', secret).update(`${tsB36}.${userId}`).digest('hex').slice(0, 16);
  if (hmac !== expected) return null;
  return userId;
}

const FAMILY_USER_IDS = [
  'U687f86855c46490c030499f5393c8a7e',
  'U4b13048aa2906b929c3139c4f3dfdd7c',
  'Ua8420309a164fffdbdd7f300f4c1cc94'
];

const UpdateProfileSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1).max(20),
  avatarType: z.enum(['photo', 'emoji']),
  avatarUrl: z.string().url().optional().or(z.literal('')),
  avatarEmoji: z.string().optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal(''))
});

const SetPinSchema = z.object({
  userId: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/, 'PINは4桁の数字です')
});

const AuthPinSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, 'PINは4桁の数字です')
});

export const handler = withHandler(async (event) => {
  const method = event.httpMethod;
  const path = event.path;

  // GET /account — 全員の設定を返す（pinHashは除外）
  if (method === 'GET' && path.endsWith('/account')) {
    const accounts = await getAllAccountSettings();
    const safe = accounts.map(({ pinHash: _, ...rest }) => rest);
    return ok({ accounts: safe });
  }

  // PUT /account — プロフィール更新
  if (method === 'PUT' && path.endsWith('/account')) {
    const body = UpdateProfileSchema.safeParse(JSON.parse(event.body || '{}'));
    if (!body.success) return err(body.error.message);
    if (!FAMILY_USER_IDS.includes(body.data.userId)) return err('不正なユーザーです', 403);

    const existing = await getAccountSettings(body.data.userId);
    const updated: AccountSettings = {
      userId: body.data.userId,
      displayName: body.data.displayName,
      avatarType: body.data.avatarType,
      avatarUrl: body.data.avatarUrl || undefined,
      avatarEmoji: body.data.avatarEmoji || undefined,
      birthday: body.data.birthday || undefined,
      pinHash: existing?.pinHash,
      updatedAt: new Date().toISOString()
    };
    await saveAccountSettings(updated);
    const { pinHash: _, ...safe } = updated;
    return ok(safe);
  }

  // POST /account/auth/line-token — LINEトークン検証（自動ログイン）
  if (method === 'POST' && path.endsWith('/line-token')) {
    const { token } = JSON.parse(event.body || '{}');
    if (!token) return ok({ success: false });
    const credentials = await getLineCredentials();
    const userId = verifyLoginToken(token, credentials.channelSecret);
    if (!userId) return ok({ success: false });
    const account = await getAccountSettings(userId);
    if (!account) return ok({ success: false });
    const { pinHash: _, ...safe } = account;
    return ok({ success: true, account: safe });
  }

  // POST /account/auth — PIN照合
  if (method === 'POST' && path.endsWith('/auth')) {
    const body = AuthPinSchema.safeParse(JSON.parse(event.body || '{}'));
    if (!body.success) return err(body.error.message);

    const all = await getAllAccountSettings();
    for (const account of all) {
      if (!account.pinHash) continue;
      const match = await bcrypt.compare(body.data.pin, account.pinHash);
      if (match) {
        const { pinHash: _, ...safe } = account;
        return ok({ success: true, account: safe });
      }
    }
    return ok({ success: false });
  }

  // PUT /account/pin — PIN設定・変更
  if (method === 'PUT' && path.endsWith('/pin')) {
    const body = SetPinSchema.safeParse(JSON.parse(event.body || '{}'));
    if (!body.success) return err(body.error.message);
    if (!FAMILY_USER_IDS.includes(body.data.userId)) return err('不正なユーザーです', 403);

    const existing = await getAccountSettings(body.data.userId);
    if (!existing) return err('アカウントが見つかりません', 404);

    const pinHash = await bcrypt.hash(body.data.pin, 10);
    await saveAccountSettings({ ...existing, pinHash, updatedAt: new Date().toISOString() });
    return ok({ success: true });
  }

  return err('Not found', 404);
});
