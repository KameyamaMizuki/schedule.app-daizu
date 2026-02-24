/**
 * Lambda ハンドラー共通ミドルウェア
 *
 * - OPTIONS プリフライト処理
 * - 全レスポンスへの CORS ヘッダー自動付与
 * - 一貫したエラーレスポンス (500)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

type HandlerFn = (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;

/**
 * CORS + エラーハンドリングを付与するミドルウェアラッパー
 */
export function withHandler(fn: HandlerFn) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers: CORS_HEADERS, body: '' };
    }

    try {
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
