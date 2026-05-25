/**
 * Secrets Manager から秘匿情報を取得
 * 環境変数からフォールバック可能（開発環境用）
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsManager = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });

interface LineCredentials {
  channelId: string;
  channelSecret: string;
  channelAccessToken: string;
  liffUrl: string;
  adminUserId: string;
}

let cachedCredentials: LineCredentials | null = null;

export async function getLineCredentials(): Promise<LineCredentials> {
  // キャッシュがあれば返す（Lambda実行環境の再利用）
  if (cachedCredentials) {
    return cachedCredentials;
  }

  const secretName = process.env.LINE_SECRET_NAME || 'line/credentials';

  try {
    const response = await secretsManager.send(
      new GetSecretValueCommand({ SecretId: secretName })
    );

    if (!response.SecretString) {
      throw new Error('Secret value is empty');
    }

    const secret = JSON.parse(response.SecretString);

    cachedCredentials = {
      channelId: secret.CHANNEL_ID,
      channelSecret: secret.CHANNEL_SECRET,
      channelAccessToken: secret.CHANNEL_ACCESS_TOKEN_LONG,
      liffUrl: secret.LIFF_URL,
      adminUserId: secret.ADMIN_USER_ID
    };

    return cachedCredentials;
  } catch (error) {
    // 開発環境では環境変数からフォールバック
    if (process.env.NODE_ENV === 'development') {
      console.warn('Using credentials from environment variables (development mode)');
      cachedCredentials = {
        channelId: process.env.CHANNEL_ID || '',
        channelSecret: process.env.CHANNEL_SECRET || '',
        channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN_LONG || '',
        liffUrl: process.env.LIFF_URL || '',
        adminUserId: process.env.ADMIN_USER_ID || ''
      };
      return cachedCredentials;
    }

    console.error('Failed to retrieve secrets:', error);
    throw new Error('Failed to retrieve LINE credentials');
  }
}
