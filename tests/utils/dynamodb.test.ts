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

  it('liked でないとき userId を likes に追加して true を返す', async () => {
    sendSpy
      .mockResolvedValueOnce({ Item: { PK: 'POST', SK: 'sk1', reactions: { like: ['user1'] } } })
      .mockResolvedValueOnce({});

    const result = await togglePostLike('POST' as PostType, 'sk1', 'user2');

    expect(result).toBe(true);
    expect(sendSpy).toHaveBeenCalledTimes(2);
    const updateInput = (sendSpy.mock.calls[1][0] as any).input;
    expect(updateInput.ExpressionAttributeValues[':newLikes']).toContain('user2');
    expect(updateInput.ExpressionAttributeValues[':newLikes']).toContain('user1');
  });

  it('liked のとき userId を likes から削除して false を返す', async () => {
    sendSpy
      .mockResolvedValueOnce({ Item: { PK: 'POST', SK: 'sk1', reactions: { like: ['user1', 'user2'] } } })
      .mockResolvedValueOnce({});

    const result = await togglePostLike('POST' as PostType, 'sk1', 'user1');

    expect(result).toBe(false);
    const updateInput = (sendSpy.mock.calls[1][0] as any).input;
    expect(updateInput.ExpressionAttributeValues[':newLikes']).toEqual(['user2']);
  });

  it('ConditionalCheckFailedException でリトライして成功する', async () => {
    const conditionError = Object.assign(new Error('Condition failed'), {
      name: 'ConditionalCheckFailedException'
    });
    const mockPost = { Item: { PK: 'POST', SK: 'sk1', reactions: { like: [] } } };

    sendSpy
      .mockResolvedValueOnce(mockPost)       // attempt 1: getPost
      .mockRejectedValueOnce(conditionError) // attempt 1: UpdateCommand 失敗
      .mockResolvedValueOnce(mockPost)       // attempt 2: getPost
      .mockResolvedValueOnce({});            // attempt 2: UpdateCommand 成功

    await expect(togglePostLike('POST' as PostType, 'sk1', 'user1')).resolves.toBe(true);
    expect(sendSpy).toHaveBeenCalledTimes(4);
  });

  it('3回リトライ失敗後に throw する', async () => {
    const conditionError = Object.assign(new Error(), {
      name: 'ConditionalCheckFailedException'
    });
    const mockPost = { Item: { PK: 'POST', SK: 'sk1', reactions: { like: [] } } };

    sendSpy
      .mockResolvedValueOnce(mockPost).mockRejectedValueOnce(conditionError)
      .mockResolvedValueOnce(mockPost).mockRejectedValueOnce(conditionError)
      .mockResolvedValueOnce(mockPost).mockRejectedValueOnce(conditionError);

    await expect(togglePostLike('POST' as PostType, 'sk1', 'user1'))
      .rejects.toThrow('Failed to toggle like after 3 retries');
  });

  it('reactions が存在しない投稿（レガシー）でも動作する', async () => {
    sendSpy
      .mockResolvedValueOnce({ Item: { PK: 'POST', SK: 'sk1' } }) // reactions なし
      .mockResolvedValueOnce({});

    const result = await togglePostLike('POST' as PostType, 'sk1', 'user1');
    expect(result).toBe(true);
  });
});
