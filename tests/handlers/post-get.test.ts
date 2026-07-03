import { handler } from '../../src/handlers/post-get';
import type { APIGatewayProxyEvent } from 'aws-lambda';

jest.mock('../../src/utils/dynamodb', () => ({
  ...jest.requireActual('../../src/utils/dynamodb'),
  getPostsByType: jest.fn().mockResolvedValue({ posts: [], lastEvaluatedKey: undefined })
}));

import { getPostsByType } from '../../src/utils/dynamodb';

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

  it('legacyのreactions.likeとlikeSetをマージし、likeSetをレスポンスから除去する', async () => {
    (getPostsByType as jest.Mock).mockResolvedValueOnce({
      posts: [{
        PK: 'POST', SK: 'sk1', postId: 'p1', userId: 'u1', displayName: 'A', text: 'hi',
        createdAt: '2026-01-01T00:00:00.000Z',
        reactions: { like: ['user1'] },
        likeSet: new Set(['user1', 'user2'])
      }],
      lastEvaluatedKey: undefined
    });

    const result = await handler(makeEvent({ type: 'POST' }));
    const body = JSON.parse(result!.body);

    expect(body.posts[0].reactions.like.sort()).toEqual(['user1', 'user2']);
    expect(body.posts[0]).not.toHaveProperty('likeSet');
  });
});
