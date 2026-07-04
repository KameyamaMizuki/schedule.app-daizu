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
  DeleteCommand,
  ScanCommand
} from '@aws-sdk/lib-dynamodb';
import {
  ScheduleInput,
  SystemConfig,
  FamilyPost,
  PostType,
  AccountSettings
} from '../types';
import { DB_KEYS, TTL_SCHEDULE_WEEKS, getTTLFromNow, TABLE_ACCOUNT_SETTINGS } from './constants';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });
export const docClient = DynamoDBDocumentClient.from(client);

const TABLES = {
  scheduleInputs: process.env.TABLE_SCHEDULE_INPUTS || 'ScheduleInputs',
  systemConfig: process.env.TABLE_SYSTEM_CONFIG || 'SystemConfig',
  familyPosts: process.env.TABLE_FAMILY_POSTS || 'FamilyPosts-kame'
};

const getTTL = () => getTTLFromNow(TTL_SCHEDULE_WEEKS);

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
    ExpressionAttributeValues: { ':weekId': weekId }
  }));

  return (result.Items as ScheduleInput[]) || [];
}

/**
 * SystemConfig操作
 */
export async function getSystemConfig(): Promise<SystemConfig | null> {
  const result = await docClient.send(new GetCommand({
    TableName: TABLES.systemConfig,
    Key: { PK: DB_KEYS.CONFIG_PK, SK: DB_KEYS.CONFIG_SK }
  }));

  return result.Item as SystemConfig || null;
}

export async function saveSystemConfig(config: SystemConfig): Promise<void> {
  await docClient.send(new PutCommand({
    TableName: TABLES.systemConfig,
    Item: {
      PK: DB_KEYS.CONFIG_PK,
      SK: DB_KEYS.CONFIG_SK,
      ...config
    }
  }));
}

/**
 * FamilyPosts操作（つぶやき・ダイ日記）
 */

export async function createPost(post: FamilyPost): Promise<void> {
  // TTL は post-save.ts 側で制御済み（DIARY: TTLなし永続, YOUSU: TTLなし永続, POST: 30日TTL）
  // ここで上書きしないことで DIARY/YOUSU の永続保存を保証
  await docClient.send(new PutCommand({
    TableName: TABLES.familyPosts,
    Item: post
  }));
}

export async function getPostsByType(
  type: PostType,
  limit: number = 50,
  lastEvaluatedKey?: Record<string, unknown>
): Promise<{ posts: FamilyPost[]; lastEvaluatedKey?: Record<string, unknown> }> {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.familyPosts,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': type },
    ScanIndexForward: false, // 新しい順
    Limit: limit,
    ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {})
  }));

  return {
    posts: (result.Items as FamilyPost[]) || [],
    lastEvaluatedKey: result.LastEvaluatedKey as Record<string, unknown> | undefined
  };
}

export async function getPost(type: PostType, sk: string): Promise<FamilyPost | null> {
  const result = await docClient.send(new GetCommand({
    TableName: TABLES.familyPosts,
    Key: { PK: type, SK: sk }
  }));

  return result.Item as FamilyPost || null;
}

/** 指定フィールドのみ更新（DIARY新形式対応） */
export async function updatePost(
  type: PostType,
  sk: string,
  fields: { text?: string; body?: string; title?: string; date?: string; catchImageUrl?: string }
): Promise<void> {
  const sets: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  if (fields.text !== undefined) {
    sets.push('#text = :text');
    names['#text'] = 'text';
    values[':text'] = fields.text;
  }
  if (fields.body !== undefined) {
    sets.push('body = :body');
    values[':body'] = fields.body;
  }
  if (fields.title !== undefined) {
    sets.push('title = :title');
    values[':title'] = fields.title;
  }
  if (fields.date !== undefined) {
    sets.push('#date = :date');
    names['#date'] = 'date';
    values[':date'] = fields.date;
  }
  if (fields.catchImageUrl !== undefined) {
    sets.push('catchImageUrl = :catchImageUrl');
    values[':catchImageUrl'] = fields.catchImageUrl;
  }

  if (sets.length === 0) return;

  await docClient.send(new UpdateCommand({
    TableName: TABLES.familyPosts,
    Key: { PK: type, SK: sk },
    UpdateExpression: `SET ${sets.join(', ')}`,
    ...(Object.keys(names).length > 0 ? { ExpressionAttributeNames: names } : {}),
    ExpressionAttributeValues: values
  }));
}

export async function deletePost(type: PostType, sk: string): Promise<void> {
  await docClient.send(new DeleteCommand({
    TableName: TABLES.familyPosts,
    Key: { PK: type, SK: sk }
  }));
}

/** legacy(リスト)と likeSet(Set|配列) をユニーク配列にマージする */
export function mergeLikes(legacy?: string[], likeSet?: Set<string> | string[]): string[] {
  const set = likeSet ? Array.from(likeSet) : [];
  return Array.from(new Set([...(legacy || []), ...set]));
}

/** like をトグル。旧リスト形式は likeSet(SS) に移行してから ADD/DELETE で原子的に更新 */
export async function togglePostLike(type: PostType, sk: string, userId: string): Promise<boolean> {
  const post = await getPost(type, sk);
  if (!post) throw new Error('Post not found');
  const legacy = post.reactions?.like ?? [];
  const current = mergeLikes(legacy, (post as { likeSet?: Set<string> | string[] }).likeSet);
  const isLiked = current.includes(userId);
  const key = { PK: type, SK: sk };

  // 旧リストに値が残っていたら likeSet へ一度だけ移行(ADD + reactionsクリアは別属性なので同一式でOK)
  if (legacy.length > 0) {
    await docClient.send(new UpdateCommand({
      TableName: TABLES.familyPosts, Key: key,
      UpdateExpression: 'SET reactions = :r ADD likeSet :all',
      ExpressionAttributeValues: { ':r': { like: [] }, ':all': new Set(legacy) }
    }));
  }
  await docClient.send(new UpdateCommand({
    TableName: TABLES.familyPosts, Key: key,
    UpdateExpression: isLiked ? 'DELETE likeSet :u' : 'ADD likeSet :u',
    ExpressionAttributeValues: { ':u': new Set([userId]) }
  }));
  return !isLiked;
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

/** 全家族メンバーのAccountSettingsを取得 */
export async function getAllAccountSettings(): Promise<AccountSettings[]> {
  const result = await docClient.send(new ScanCommand({
    TableName: TABLE_ACCOUNT_SETTINGS
  }));
  return (result.Items || []) as AccountSettings[];
}

/** 特定ユーザーのAccountSettingsを取得 */
export async function getAccountSettings(userId: string): Promise<AccountSettings | null> {
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_ACCOUNT_SETTINGS,
    Key: { userId }
  }));
  return result.Item as AccountSettings || null;
}

/** AccountSettingsを保存・更新 */
export async function saveAccountSettings(settings: AccountSettings): Promise<void> {
  await docClient.send(new PutCommand({
    TableName: TABLE_ACCOUNT_SETTINGS,
    Item: settings
  }));
}
