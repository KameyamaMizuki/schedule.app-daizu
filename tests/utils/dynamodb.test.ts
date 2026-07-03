import { docClient, togglePostLike } from '../../src/utils/dynamodb';
import type { PostType } from '../../src/types';

describe('togglePostLike', () => {
  let sendSpy: jest.SpyInstance;

  beforeEach(() => {
    sendSpy = jest.spyOn(docClient, 'send' as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('liked でないとき likeSet に ADD して true を返す（legacyなし・移行なし）', async () => {
    sendSpy
      .mockResolvedValueOnce({ Item: { PK: 'POST', SK: 'sk1', likeSet: new Set(['user1']) } })
      .mockResolvedValueOnce({});

    const result = await togglePostLike('POST' as PostType, 'sk1', 'user2');

    expect(result).toBe(true);
    expect(sendSpy).toHaveBeenCalledTimes(2); // getPost + ADD likeSet（移行なし）
    const updateInput = (sendSpy.mock.calls[1][0] as any).input;
    expect(updateInput.UpdateExpression).toBe('ADD likeSet :u');
    expect(Array.from(updateInput.ExpressionAttributeValues[':u'])).toEqual(['user2']);
  });

  it('liked のとき likeSet から DELETE して false を返す', async () => {
    sendSpy
      .mockResolvedValueOnce({ Item: { PK: 'POST', SK: 'sk1', likeSet: new Set(['user1', 'user2']) } })
      .mockResolvedValueOnce({});

    const result = await togglePostLike('POST' as PostType, 'sk1', 'user1');

    expect(result).toBe(false);
    const updateInput = (sendSpy.mock.calls[1][0] as any).input;
    expect(updateInput.UpdateExpression).toBe('DELETE likeSet :u');
    expect(Array.from(updateInput.ExpressionAttributeValues[':u'])).toEqual(['user1']);
  });

  it('旧リスト形式(reactions.like)が残っている場合は likeSet へ移行してからADDする', async () => {
    sendSpy
      .mockResolvedValueOnce({ Item: { PK: 'POST', SK: 'sk1', reactions: { like: ['user1'] } } })
      .mockResolvedValueOnce({}) // 移行
      .mockResolvedValueOnce({}); // ADD

    const result = await togglePostLike('POST' as PostType, 'sk1', 'user2');

    expect(result).toBe(true);
    expect(sendSpy).toHaveBeenCalledTimes(3); // getPost + 移行 + ADD
    const migrateInput = (sendSpy.mock.calls[1][0] as any).input;
    expect(migrateInput.UpdateExpression).toBe('SET reactions = :r ADD likeSet :all');
    expect(migrateInput.ExpressionAttributeValues[':r']).toEqual({ like: [] });
    expect(Array.from(migrateInput.ExpressionAttributeValues[':all'])).toEqual(['user1']);
    const toggleInput = (sendSpy.mock.calls[2][0] as any).input;
    expect(toggleInput.UpdateExpression).toBe('ADD likeSet :u');
  });

  it('reactions も likeSet も存在しない投稿（レガシー）でも動作する', async () => {
    sendSpy
      .mockResolvedValueOnce({ Item: { PK: 'POST', SK: 'sk1' } }) // reactions/likeSet なし
      .mockResolvedValueOnce({});

    const result = await togglePostLike('POST' as PostType, 'sk1', 'user1');
    expect(result).toBe(true);
    expect(sendSpy).toHaveBeenCalledTimes(2); // 移行不要
  });

  it('Post が見つからない場合 throw する', async () => {
    sendSpy.mockResolvedValueOnce({ Item: undefined });

    await expect(togglePostLike('POST' as PostType, 'sk1', 'user1'))
      .rejects.toThrow('Post not found');
  });
});
