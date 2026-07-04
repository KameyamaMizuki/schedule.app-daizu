/**
 * チロル/だいずの一言 保存/取得 Lambda
 *
 * GET /chirol/hitokoto?dog=chirol|daizu - 一言を取得
 * POST /chirol/hitokoto - 新しい一言を追加
 * DELETE /chirol/hitokoto - 一言を削除
 */

import { QueryCommand, PutCommand, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { docClient, mergeLikes } from '../utils/dynamodb';
import { withHandler, ok, err } from '../utils/handler';
import { DB_KEYS, TEXT_LIMITS } from '../utils/constants';
import { toggleLike, addComment, deleteComment } from '../utils/reactions';

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
      likes: mergeLikes(item.likes, item.likeSet),
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
      const likes = await toggleLike(TABLE_NAME, key, String(userId));
      return ok({ likes });
    }

    // ── コメント追加 ──
    if (body.action === 'addComment') {
      const { hitokotoId, userId, userName, text } = body;
      if (!hitokotoId || !userId || !text) return err('hitokotoId, userId, text は必須です');
      const key = { PK: pk, SK: `${DB_KEYS.HITOKOTO_PREFIX}${hitokotoId}` };
      const existing = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: key }));
      if (!existing.Item) return err('Hitokoto not found', 404);
      const comment = await addComment(TABLE_NAME, key, { userId: String(userId), userName: String(userName ?? ''), text: String(text) });
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
      try {
        await deleteComment(TABLE_NAME, key, String(commentId));
      } catch (e: any) {
        if (e.message === 'Item not found') return err('Hitokoto not found', 404);
        throw e;
      }
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
