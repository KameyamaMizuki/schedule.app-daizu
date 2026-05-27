/**
 * チロル/だいずの一言 保存/取得 Lambda
 *
 * GET /chirol/hitokoto?dog=chirol|daizu - 一言を取得
 * POST /chirol/hitokoto - 新しい一言を追加
 * DELETE /chirol/hitokoto - 一言を削除
 */

import { QueryCommand, PutCommand, DeleteCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { docClient } from '../utils/dynamodb';
import { withHandler, ok, err } from '../utils/handler';
import { DB_KEYS, TEXT_LIMITS } from '../utils/constants';

const TABLE_NAME = process.env.TABLE_CHIROL_DATA || 'ChirolData-kame';

const DogSchema = z.enum(['chirol', 'daizu']).default('chirol');

const PostSchema = z.object({
  text: z.string().min(1, 'テキストは必須です').max(TEXT_LIMITS.HITOKOTO, `${TEXT_LIMITS.HITOKOTO}文字以内で入力してください`),
  dog: DogSchema
});

const DeleteSchema = z.object({
  hitokotoId: z.string().min(1, 'hitokotoId は必須です'),
  dog: DogSchema
});

export const handler = withHandler(async (event) => {
  if (event.httpMethod === 'GET') {
    const dog = event.queryStringParameters?.dog || 'chirol';
    const pk = dog === 'daizu' ? DB_KEYS.DAIZU : DB_KEYS.CHIROL;

    // ScanCommand → QueryCommand に変更（効率化）
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': pk, ':prefix': DB_KEYS.HITOKOTO_PREFIX }
    }));

    const items = (result.Items || []).map(item => ({
      id: item.hitokotoId,
      text: item.text,
      createdAt: item.createdAt,
      likes: item.likes || [],
      comments: item.comments || []
    })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return ok({ hitokotoList: items, dog });
  }

  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');
    const dog = body.dog || 'chirol';
    const pk = dog === 'daizu' ? DB_KEYS.DAIZU : DB_KEYS.CHIROL;

    // ── いいねトグル ──
    if (body.action === 'like') {
      const { hitokotoId, userId } = body;
      if (!hitokotoId || !userId) return err('hitokotoId と userId は必須です');
      const key = { PK: pk, SK: `${DB_KEYS.HITOKOTO_PREFIX}${hitokotoId}` };
      const existing = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: key }));
      if (!existing.Item) return err('Hitokoto not found', 404);
      const likes: string[] = existing.Item.likes || [];
      const idx = likes.indexOf(userId);
      if (idx === -1) likes.push(userId); else likes.splice(idx, 1);
      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME, Key: key,
        UpdateExpression: 'SET likes = :likes',
        ExpressionAttributeValues: { ':likes': likes }
      }));
      return ok({ likes });
    }

    // ── コメント追加 ──
    if (body.action === 'addComment') {
      const { hitokotoId, userId, userName, text } = body;
      if (!hitokotoId || !userId || !text) return err('hitokotoId, userId, text は必須です');
      const commentId = `c_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const comment = { id: commentId, userId, userName: userName || '', text: String(text).trim(), createdAt: new Date().toISOString() };
      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk, SK: `${DB_KEYS.HITOKOTO_PREFIX}${hitokotoId}` },
        UpdateExpression: 'SET comments = list_append(if_not_exists(comments, :empty), :c)',
        ExpressionAttributeValues: { ':c': [comment], ':empty': [] }
      }));
      return ok({ comment });
    }

    // ── 既存: 一言追加 ──
    const parsed = PostSchema.safeParse(body);
    if (!parsed.success) return err(parsed.error.issues[0].message);

    const { text } = parsed.data;
    const hitokotoId = `hitokoto_${Date.now()}`;
    const now = new Date().toISOString();

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: { PK: pk, SK: `${DB_KEYS.HITOKOTO_PREFIX}${hitokotoId}`, hitokotoId, text: text.trim(), dog, createdAt: now }
    }));

    return ok({ success: true, hitokotoId, message: dog === 'daizu' ? '追加しました！' : '追加したぜ。' });
  }

  if (event.httpMethod === 'DELETE') {
    const body = JSON.parse(event.body || '{}');
    const dog = body.dog || 'chirol';
    const pk = dog === 'daizu' ? DB_KEYS.DAIZU : DB_KEYS.CHIROL;

    // ── コメント削除 ──
    if (body.commentId) {
      const { hitokotoId, commentId } = body;
      if (!hitokotoId) return err('hitokotoId は必須です');
      const key = { PK: pk, SK: `${DB_KEYS.HITOKOTO_PREFIX}${hitokotoId}` };
      const existing = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: key }));
      if (!existing.Item) return err('Hitokoto not found', 404);
      const comments = (existing.Item.comments || []).filter((c: { id: string }) => c.id !== commentId);
      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME, Key: key,
        UpdateExpression: 'SET comments = :comments',
        ExpressionAttributeValues: { ':comments': comments }
      }));
      return ok({ success: true });
    }

    // ── 既存: 一言削除 ──
    const parsed = DeleteSchema.safeParse(body);
    if (!parsed.success) return err(parsed.error.issues[0].message);

    const { hitokotoId } = parsed.data;

    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk, SK: `${DB_KEYS.HITOKOTO_PREFIX}${hitokotoId}` }
    }));

    return ok({ success: true });
  }

  return err('Method not allowed', 405);
});
