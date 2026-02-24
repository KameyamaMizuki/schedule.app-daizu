/**
 * DynamoDB操作ユーティリティ
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand
} from '@aws-sdk/lib-dynamodb';
import {
  ScheduleInput,
  SystemConfig,
  FamilyPost,
  PostType
} from '../types';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });
export const docClient = DynamoDBDocumentClient.from(client);

const TABLES = {
  scheduleInputs: process.env.TABLE_SCHEDULE_INPUTS || 'ScheduleInputs',
  systemConfig: process.env.TABLE_SYSTEM_CONFIG || 'SystemConfig',
  familyPosts: process.env.TABLE_FAMILY_POSTS || 'FamilyPosts-kame'
};

// TTL: 12週間後
const getTTL = () => Math.floor(Date.now() / 1000) + (12 * 7 * 24 * 60 * 60);

/**
 * ScheduleInputs操作
 */
export async function saveScheduleInput(input: ScheduleInput): Promise<void> {
  await docClient.send(new PutCommand({
    TableName: TABLES.scheduleInputs,
    Item: {
      ...input,
      ttl: getTTL()
    }
  }));
}

export async function getScheduleInput(weekId: string, userId: string): Promise<ScheduleInput | null> {
  const result = await docClient.send(new GetCommand({
    TableName: TABLES.scheduleInputs,
    Key: { weekId, userId }
  }));

  return result.Item as ScheduleInput || null;
}

export async function getAllScheduleInputs(weekId: string): Promise<ScheduleInput[]> {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.scheduleInputs,
    KeyConditionExpression: 'weekId = :weekId',
    ExpressionAttributeValues: { ':weekId': weekId },
    ConsistentRead: true
  }));

  return (result.Items as ScheduleInput[]) || [];
}

/**
 * SystemConfig操作
 */
export async function getSystemConfig(): Promise<SystemConfig | null> {
  const result = await docClient.send(new GetCommand({
    TableName: TABLES.systemConfig,
    Key: { PK: 'CONFIG', SK: 'MAIN' }
  }));

  return result.Item as SystemConfig || null;
}

export async function saveSystemConfig(config: SystemConfig): Promise<void> {
  await docClient.send(new PutCommand({
    TableName: TABLES.systemConfig,
    Item: {
      PK: 'CONFIG',
      SK: 'MAIN',
      ...config
    }
  }));
}

/**
 * FamilyPosts操作（つぶやき・ダイ日記）
 */

// TTL: 30日後
const getPostTTL = () => Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);

export async function createPost(post: FamilyPost): Promise<void> {
  await docClient.send(new PutCommand({
    TableName: TABLES.familyPosts,
    Item: {
      ...post,
      ttl: getPostTTL()
    }
  }));
}

export async function getPostsByType(type: PostType, limit: number = 50): Promise<FamilyPost[]> {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.familyPosts,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': type },
    ScanIndexForward: false, // 新しい順
    Limit: limit
  }));

  return (result.Items as FamilyPost[]) || [];
}

export async function getPost(type: PostType, sk: string): Promise<FamilyPost | null> {
  const result = await docClient.send(new GetCommand({
    TableName: TABLES.familyPosts,
    Key: { PK: type, SK: sk }
  }));

  return result.Item as FamilyPost || null;
}

export async function updatePostText(type: PostType, sk: string, text: string): Promise<void> {
  await docClient.send(new UpdateCommand({
    TableName: TABLES.familyPosts,
    Key: { PK: type, SK: sk },
    UpdateExpression: 'SET #text = :text',
    ExpressionAttributeNames: { '#text': 'text' },
    ExpressionAttributeValues: { ':text': text }
  }));
}

export async function deletePost(type: PostType, sk: string): Promise<void> {
  await docClient.send(new DeleteCommand({
    TableName: TABLES.familyPosts,
    Key: { PK: type, SK: sk }
  }));
}

export async function addPostReaction(type: PostType, sk: string, userId: string): Promise<void> {
  await docClient.send(new UpdateCommand({
    TableName: TABLES.familyPosts,
    Key: { PK: type, SK: sk },
    UpdateExpression: 'SET reactions.#like = list_append(if_not_exists(reactions.#like, :empty), :user)',
    ExpressionAttributeNames: { '#like': 'like' },
    ExpressionAttributeValues: {
      ':user': [userId],
      ':empty': []
    }
  }));
}

export async function removePostReaction(type: PostType, sk: string, userId: string): Promise<void> {
  // まず現在のリアクションを取得
  const post = await getPost(type, sk);
  if (!post?.reactions?.like) return;

  const newLikes = post.reactions.like.filter(id => id !== userId);
  await docClient.send(new UpdateCommand({
    TableName: TABLES.familyPosts,
    Key: { PK: type, SK: sk },
    UpdateExpression: 'SET reactions.#like = :likes',
    ExpressionAttributeNames: { '#like': 'like' },
    ExpressionAttributeValues: { ':likes': newLikes }
  }));
}

export async function addPostComment(
  type: PostType,
  sk: string,
  comment: { userId: string; displayName: string; text: string; createdAt: string }
): Promise<void> {
  await docClient.send(new UpdateCommand({
    TableName: TABLES.familyPosts,
    Key: { PK: type, SK: sk },
    UpdateExpression: 'SET comments = list_append(if_not_exists(comments, :empty), :comment)',
    ExpressionAttributeValues: {
      ':comment': [comment],
      ':empty': []
    }
  }));
}
