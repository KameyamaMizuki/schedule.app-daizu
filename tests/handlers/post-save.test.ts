import { handler } from '../../src/handlers/post-save';
import type { APIGatewayProxyEvent } from 'aws-lambda';

jest.mock('../../src/utils/dynamodb', () => ({
  ...jest.requireActual('../../src/utils/dynamodb'),
  createPost: jest.fn().mockResolvedValue(undefined),
  updatePost: jest.fn().mockResolvedValue(undefined),
  getPost: jest.fn().mockResolvedValue(null),
  deletePost: jest.fn().mockResolvedValue(undefined),
  togglePostLike: jest.fn().mockResolvedValue(false),
  addPostComment: jest.fn().mockResolvedValue(undefined),
  getSystemConfig: jest.fn().mockResolvedValue({ groupId: 'G123' })
}));

jest.mock('../../src/utils/secrets', () => ({
  getLineCredentials: jest.fn().mockResolvedValue({
    channelId: 'ch123',
    channelSecret: 'secret',
    channelAccessToken: 'token',
    liffUrl: 'https://liff.example.com',
    adminUserId: 'admin'
  })
}));

jest.mock('../../src/utils/line', () => ({
  ...jest.requireActual('../../src/utils/line'),
  pushFlexMessage: jest.fn().mockResolvedValue(undefined),
  buildNotifyFlexBubble: jest.fn().mockReturnValue({}),
  getCommonQuickReply: jest.fn().mockReturnValue(null)
}));

jest.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: jest.fn(),
  InvokeCommand: jest.fn()
}));

import { createPost } from '../../src/utils/dynamodb';

const makeEvent = (body: Record<string, any>, method: string = 'POST', path: string = '/posts'): APIGatewayProxyEvent =>
  ({
    httpMethod: method,
    path,
    body: JSON.stringify(body),
    headers: {},
    queryStringParameters: null,
    pathParameters: null
  } as any);

describe('POST /posts - 新規投稿', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('catchImageUrl が空文字の場合、POST が成功する（Invalid url エラーは出ない）', async () => {
    const result = await handler(makeEvent({
      type: 'DIARY',
      userId: 'u1',
      displayName: 'テストユーザー',
      body: 'これはテスト日記です',
      title: 'テスト',
      date: '2026-07-19',
      catchImageUrl: ''
    }));

    expect(result?.statusCode).toBe(201);
    expect(createPost).toHaveBeenCalled();
  });

  it('catchImageUrl が指定されている場合、その値で投稿される', async () => {
    const result = await handler(makeEvent({
      type: 'DIARY',
      userId: 'u1',
      displayName: 'テストユーザー',
      body: 'これはテスト日記です',
      title: 'テスト',
      date: '2026-07-19',
      catchImageUrl: 'https://example.com/image.jpg'
    }));

    expect(result?.statusCode).toBe(201);
    expect(createPost).toHaveBeenCalled();
    const call = (createPost as jest.Mock).mock.calls[0][0];
    expect(call.catchImageUrl).toBe('https://example.com/image.jpg');
  });

  it('catchImageUrl が無効な URL の場合、400 を返す', async () => {
    const result = await handler(makeEvent({
      type: 'DIARY',
      userId: 'u1',
      displayName: 'テストユーザー',
      body: 'これはテスト日記です',
      title: 'テスト',
      date: '2026-07-19',
      catchImageUrl: 'not-a-valid-url'
    }));

    expect(result?.statusCode).toBe(400);
  });

  it('imageUrl が空文字の場合、POST が成功する', async () => {
    const result = await handler(makeEvent({
      type: 'POST',
      userId: 'u1',
      displayName: 'テストユーザー',
      text: 'つぶやきテスト',
      imageUrl: ''
    }));

    expect(result?.statusCode).toBe(201);
    expect(createPost).toHaveBeenCalled();
  });

  it('imageUrl が無効な URL の場合、400 を返す', async () => {
    const result = await handler(makeEvent({
      type: 'POST',
      userId: 'u1',
      displayName: 'テストユーザー',
      text: 'つぶやきテスト',
      imageUrl: 'not-a-url'
    }));

    expect(result?.statusCode).toBe(400);
  });

  it('本文が空の場合、400 を返す', async () => {
    const result = await handler(makeEvent({
      type: 'DIARY',
      userId: 'u1',
      displayName: 'テストユーザー',
      title: 'テスト',
      date: '2026-07-19'
    }));

    expect(result?.statusCode).toBe(400);
  });

  it('YOUSU 投稿が成功する', async () => {
    const result = await handler(makeEvent({
      type: 'YOUSU',
      userId: 'u1',
      displayName: 'テストユーザー',
      text: 'だいずの様子'
    }));

    expect(result?.statusCode).toBe(201);
    expect(createPost).toHaveBeenCalled();
  });
});
