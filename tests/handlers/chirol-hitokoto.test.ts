import { handler } from '../../src/handlers/chirol-hitokoto';
import type { APIGatewayProxyEvent } from 'aws-lambda';

jest.mock('../../src/utils/dynamodb', () => ({
  ...jest.requireActual('../../src/utils/dynamodb'),
  docClient: {
    send: jest.fn()
  }
}));

import { docClient } from '../../src/utils/dynamodb';

const makeEvent = (method: string, queryStringParameters?: Record<string, string>, body?: any): APIGatewayProxyEvent =>
  ({
    httpMethod: method,
    queryStringParameters: queryStringParameters || null,
    headers: {},
    body: body ? JSON.stringify(body) : null,
    pathParameters: null
  } as any);

describe('チロル/だいず 一言 ハンドラー', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /chirol/hitokoto', () => {
    it('legacyのlikesと likeSet をマージし、likeSetをレスポンスから除去する', async () => {
      (docClient.send as jest.Mock).mockResolvedValueOnce({
        Items: [{
          hitokotoId: 'h1',
          text: 'テスト一言',
          createdAt: '2026-01-01T00:00:00.000Z',
          likes: ['a'],
          likeSet: new Set(['b']),
          comments: []
        }]
      });

      const result = await handler(makeEvent('GET', { dog: 'chirol' }));
      expect(result?.statusCode).toBe(200);

      const body = JSON.parse(result!.body);
      expect(body.hitokotoList[0].likes.sort()).toEqual(['a', 'b']);
      expect(body.hitokotoList[0]).not.toHaveProperty('likeSet');
    });
  });
});
