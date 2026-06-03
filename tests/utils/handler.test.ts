import { withHandler, ok, CORS_HEADERS } from '../../src/utils/handler';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const makeEvent = (method: string): APIGatewayProxyEvent =>
  ({ httpMethod: method, headers: {}, body: null, queryStringParameters: null, pathParameters: null } as any);

describe('CORS headers', () => {
  it('Access-Control-Allow-Origin が * でない', () => {
    expect(CORS_HEADERS['Access-Control-Allow-Origin']).not.toBe('*');
  });

  it('Access-Control-Allow-Origin が S3 ドメインを含む', () => {
    expect(CORS_HEADERS['Access-Control-Allow-Origin']).toContain('amazonaws.com');
  });

  it('OPTIONS プリフライトが 200 と CORS ヘッダーを返す', async () => {
    const handler = withHandler(async () => ok({ test: true }));
    const result = await handler(makeEvent('OPTIONS'));
    expect(result?.statusCode).toBe(200);
    expect(result?.headers?.['Access-Control-Allow-Origin']).not.toBe('*');
  });

  it('通常レスポンスにも CORS ヘッダーが付く', async () => {
    const handler = withHandler(async () => ok({ test: true }));
    const result = await handler(makeEvent('GET'));
    expect(result?.headers?.['Access-Control-Allow-Origin']).not.toBe('*');
  });
});
