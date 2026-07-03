import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, mergeLikes } from './dynamodb';

export interface ChirolComment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
}

/**
 * like をトグル。旧リスト形式(likes)は likeSet(SS) に移行してから ADD/DELETE で原子的に更新し、
 * 更新後の likes 配列(マージ済み)を返す。
 */
export async function toggleLike(
  tableName: string,
  key: Record<string, unknown>,
  userId: string
): Promise<string[]> {
  const result = await docClient.send(new GetCommand({ TableName: tableName, Key: key }));
  if (!result.Item) throw new Error('Item not found');

  const legacy: string[] = result.Item.likes ?? [];
  const current = mergeLikes(legacy, result.Item.likeSet as Set<string> | string[] | undefined);
  const isLiked = current.includes(userId);

  // 旧リストに値が残っていたら likeSet へ一度だけ移行
  if (legacy.length > 0) {
    await docClient.send(new UpdateCommand({
      TableName: tableName, Key: key,
      UpdateExpression: 'SET likes = :empty ADD likeSet :all',
      ExpressionAttributeValues: { ':empty': [], ':all': new Set(legacy) }
    }));
  }
  await docClient.send(new UpdateCommand({
    TableName: tableName, Key: key,
    UpdateExpression: isLiked ? 'DELETE likeSet :u' : 'ADD likeSet :u',
    ExpressionAttributeValues: { ':u': new Set([userId]) }
  }));

  return isLiked ? current.filter(id => id !== userId) : [...current, userId];
}

/**
 * コメントを追加して新 comment オブジェクトを返す。
 * userName はトリムして最大 50 文字に制限する。
 */
export async function addComment(
  tableName: string,
  key: Record<string, unknown>,
  params: { userId: string; userName: string; text: string }
): Promise<ChirolComment> {
  const comment: ChirolComment = {
    id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId: params.userId,
    userName: String(params.userName ?? '').trim().slice(0, 50),
    text: String(params.text).trim(),
    createdAt: new Date().toISOString()
  };

  await docClient.send(new UpdateCommand({
    TableName: tableName,
    Key: key,
    UpdateExpression: 'SET comments = list_append(if_not_exists(comments, :empty), :c)',
    ExpressionAttributeValues: { ':c': [comment], ':empty': [] }
  }));

  return comment;
}

/**
 * 指定 commentId のコメントを削除する。
 */
export async function deleteComment(
  tableName: string,
  key: Record<string, unknown>,
  commentId: string
): Promise<void> {
  const result = await docClient.send(new GetCommand({ TableName: tableName, Key: key }));
  if (!result.Item) throw new Error('Item not found');

  const comments = (result.Item.comments ?? []).filter(
    (c: { id: string }) => c.id !== commentId
  );

  await docClient.send(new UpdateCommand({
    TableName: tableName,
    Key: key,
    UpdateExpression: 'SET comments = :comments',
    ExpressionAttributeValues: { ':comments': comments }
  }));
}
