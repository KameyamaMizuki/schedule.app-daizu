import { docClient } from '../../src/utils/dynamodb';
import { toggleLike, addComment, deleteComment } from '../../src/utils/reactions';

describe('reactions utility', () => {
  let sendSpy: jest.SpyInstance;

  beforeEach(() => {
    sendSpy = jest.spyOn(docClient, 'send' as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── toggleLike ──

  it('toggleLike: 旧リスト(likes)が残っている場合は likeSet へ移行してからADDし、マージ後の配列を返す', async () => {
    sendSpy
      .mockResolvedValueOnce({ Item: { likes: ['user1'] } })
      .mockResolvedValueOnce({}) // 移行
      .mockResolvedValueOnce({}); // ADD

    const result = await toggleLike('Table', { PK: 'pk', SK: 'sk' }, 'user2');

    expect(result).toContain('user2');
    expect(result).toContain('user1');
    expect(sendSpy).toHaveBeenCalledTimes(3);
    const migrateInput = (sendSpy.mock.calls[1][0] as any).input;
    expect(migrateInput.UpdateExpression).toBe('SET likes = :empty ADD likeSet :all');
    const toggleInput = (sendSpy.mock.calls[2][0] as any).input;
    expect(toggleInput.UpdateExpression).toBe('ADD likeSet :u');
  });

  it('toggleLike: likeSet に登録済みのとき DELETE して残りの配列を返す（移行なし）', async () => {
    sendSpy
      .mockResolvedValueOnce({ Item: { likeSet: new Set(['user1', 'user2']) } })
      .mockResolvedValueOnce({});

    const result = await toggleLike('Table', { PK: 'pk', SK: 'sk' }, 'user1');

    expect(result).toEqual(['user2']);
    expect(sendSpy).toHaveBeenCalledTimes(2); // 移行なし
    const toggleInput = (sendSpy.mock.calls[1][0] as any).input;
    expect(toggleInput.UpdateExpression).toBe('DELETE likeSet :u');
  });

  it('toggleLike: likes も likeSet も存在しない場合も動作する', async () => {
    sendSpy
      .mockResolvedValueOnce({ Item: {} })
      .mockResolvedValueOnce({});

    const result = await toggleLike('Table', { PK: 'pk', SK: 'sk' }, 'user1');

    expect(result).toEqual(['user1']);
  });

  it('toggleLike: Item が見つからない場合 throw する', async () => {
    sendSpy.mockResolvedValueOnce({ Item: undefined });

    await expect(toggleLike('Table', { PK: 'pk', SK: 'sk' }, 'u1'))
      .rejects.toThrow('Item not found');
  });

  // ── addComment ──

  it('addComment: コメントを追加して comment オブジェクトを返す', async () => {
    sendSpy.mockResolvedValueOnce({});

    const result = await addComment('Table', { PK: 'pk', SK: 'sk' }, {
      userId: 'u1',
      userName: '  Alice  ',
      text: 'hello'
    });

    expect(result.id).toMatch(/^c_/);
    expect(result.userId).toBe('u1');
    expect(result.userName).toBe('Alice'); // トリム済み
    expect(result.text).toBe('hello');
    expect(result.createdAt).toBeTruthy();
  });

  it('addComment: userName が 50 文字を超える場合は切り詰める', async () => {
    sendSpy.mockResolvedValueOnce({});

    const longName = 'A'.repeat(100);
    const result = await addComment('Table', { PK: 'pk', SK: 'sk' }, {
      userId: 'u1',
      userName: longName,
      text: 'hi'
    });

    expect(result.userName.length).toBeLessThanOrEqual(50);
  });

  it('addComment: userName が未指定でも空文字として保存される', async () => {
    sendSpy.mockResolvedValueOnce({});

    const result = await addComment('Table', { PK: 'pk', SK: 'sk' }, {
      userId: 'u1',
      userName: '',
      text: 'hi'
    });

    expect(result.userName).toBe('');
  });

  // ── deleteComment ──

  it('deleteComment: 指定 commentId を持つコメントを削除する', async () => {
    sendSpy
      .mockResolvedValueOnce({
        Item: {
          comments: [
            { id: 'c_1', text: 'first' },
            { id: 'c_2', text: 'second' }
          ]
        }
      })
      .mockResolvedValueOnce({});

    await deleteComment('Table', { PK: 'pk', SK: 'sk' }, 'c_1');

    const updateInput = (sendSpy.mock.calls[1][0] as any).input;
    expect(updateInput.ExpressionAttributeValues[':comments']).toEqual([
      { id: 'c_2', text: 'second' }
    ]);
  });
});
