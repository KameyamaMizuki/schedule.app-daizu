import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './dynamodb';

export interface ChirolComment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
}

/**
 * like をトグルし、更新後の likes 配列を返す。楽観的ロック付き（最大 3 回リトライ）。
 */
export async function toggleLike(
  tableName: string,
  key: Record<string, unknown>,
  userId: string
): Promise<string[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await docClient.send(new GetCommand({ TableName: tableName, Key: key }));
    if (!result.Item) throw new Error('Item not found');

    const currentLikes: string[] = result.Item.likes ?? [];
    const isLiked = currentLikes.includes(userId);
    const newLikes = isLiked
      ? currentLikes.filter(id => id !== userId)
      : [...currentLikes, userId];

    try {
      await docClient.send(new UpdateCommand({
        TableName: tableName,
        Key: key,
        UpdateExpression: 'SET likes = :newLikes',
        ConditionExpression: 'likes = :currentLikes OR attribute_not_exists(likes)',
        ExpressionAttributeValues: { ':newLikes': newLikes, ':currentLikes': currentLikes }
      }));
      return newLikes;
    } catch (e: any) {
      if (e.name !== 'ConditionalCheckFailedException') throw e;
      if (attempt >= 2) throw new Error('Failed to toggle like after 3 retries');
    }
  }
  throw new Error('Failed to toggle like after 3 retries');
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
