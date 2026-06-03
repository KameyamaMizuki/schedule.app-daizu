import { handler } from '../../src/handlers/post-get';
import type { APIGatewayProxyEvent } from 'aws-lambda';

jest.mock('../../src/utils/dynamodb', () => ({
  getPostsByType: jest.fn().mockResolvedValue({ posts: [], lastEvaluatedKey: undefined })
}));

const makeEvent = (params: Record<string, string> = {}): APIGatewayProxyEvent =>
  ({
    httpMethod: 'GET',
    queryStringParameters: params,
    headers: {},
    body: null,
    pathParameters: null
  } as any);

describe('GET /posts', () => {
  it('無効な type パラメータで 400 を返す', async () => {
    const result = await handler(makeEvent({ type: 'INVALID' }));
    expect(result?.statusCode).toBe(400);
  });

  it('type=POST で 200 を返す', async () => {
    const result = await handler(makeEvent({ type: 'POST' }));
    expect(result?.statusCode).toBe(200);
  });

  it('type=DIARY で 200 を返す', async () => {
    const result = await handler(makeEvent({ type: 'DIARY' }));
    expect(result?.statusCode).toBe(200);
  });

  it('type=YOUSU で 200 を返す', async () => {
    const result = await handler(makeEvent({ type: 'YOUSU' }));
    expect(result?.statusCode).toBe(200);
  });

  it('type 未指定のとき POST がデフォルトになり 200 を返す', async () => {
    const result = await handler(makeEvent());
    expect(result?.statusCode).toBe(200);
  });
});
