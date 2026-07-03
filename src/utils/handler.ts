/**
 * Lambda ハンドラー共通ミドルウェア
 *
 * - OPTIONS プリフライト処理
 * - 全レスポンスへの CORS ヘッダー自動付与
 * - 一貫したエラーレスポンス (500)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { verifySessionToken, extractBearer } from './auth';
import { getLineCredentials } from './secrets';

const ALLOWED_ORIGIN =
  process.env.ALLOWED_ORIGIN ||
  'https://family-schedule-web-kame-982312822872.s3.ap-northeast-1.amazonaws.com';

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

type HandlerFn = (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;

/** withHandler が認証成功時に authUserId を付与したイベント */
export type AuthedEvent = APIGatewayProxyEvent & { authUserId?: string };

type HandlerOpts = { noAuthPaths?: string[] };

/**
 * CORS + エラーハンドリング + 認証(AUTH_MODE)を付与するミドルウェアラッパー
 *
 * AUTH_MODE: 'off'(既定・認証なし) / 'log'(検証のみ・失敗時もログ出力して通す) / 'enforce'(失敗時401)
 */
export function withHandler(fn: HandlerFn, opts: HandlerOpts = {}) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers: CORS_HEADERS, body: '' };
    }

    try {
      const mode = process.env.AUTH_MODE || 'off';
      const isNoAuth = (opts.noAuthPaths || []).some(p => event.path.startsWith(p));
      if (mode !== 'off' && !isNoAuth) {
        const token = extractBearer(event);
        const credentials = await getLineCredentials();
        const userId = token ? verifySessionToken(token, credentials.channelSecret) : null;
        if (userId) {
          (event as AuthedEvent).authUserId = userId;
        } else if (mode === 'enforce') {
          return err('認証が必要です', 401);
        } else {
          console.warn(`AUTH_LOG: unauthenticated ${event.httpMethod} ${event.path}`);
        }
      }
      const result = await fn(event);
      return {
        ...result,
        headers: { ...CORS_HEADERS, ...result.headers }
      };
    } catch (error) {
      console.error('Handler error:', error);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Internal server error' })
      };
    }
  };
}

/** 成功レスポンスのショートハンド */
export function ok(body: unknown, status = 200): APIGatewayProxyResult {
  return { statusCode: status, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

/** エラーレスポンスのショートハンド */
export function err(message: string, status = 400): APIGatewayProxyResult {
  return { statusCode: status, headers: CORS_HEADERS, body: JSON.stringify({ error: message }) };
}
