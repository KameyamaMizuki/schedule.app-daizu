/**
 * チロル/だいずの一言 保存/取得 Lambda
 *
 * GET /chirol/hitokoto?dog=chirol|daizu - 一言を取得
 * POST /chirol/hitokoto - 新しい一言を追加
 * DELETE /chirol/hitokoto - 一言を削除
 */

import { QueryCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { docClient } from '../utils/dynamodb';
import { withHandler, ok, err } from '../utils/handler';

const TABLE_NAME = process.env.TABLE_CHIROL_DATA || 'ChirolData-kame';

const DogSchema = z.enum(['chirol', 'daizu']).default('chirol');

const PostSchema = z.object({
  text: z.string().min(1, 'テキストは必須です').max(200, '200文字以内で入力してください'),
  dog: DogSchema
});

const DeleteSchema = z.object({
  hitokotoId: z.string().min(1, 'hitokotoId は必須です'),
  dog: DogSchema
});

export const handler = withHandler(async (event) => {
  if (event.httpMethod === 'GET') {
    const dog = event.queryStringParameters?.dog || 'chirol';
    const pk = dog === 'daizu' ? 'DAIZU' : 'CHIROL';

    // ScanCommand → QueryCommand に変更（効率化）
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': pk, ':prefix': 'HITOKOTO#' }
    }));

    const items = (result.Items || []).map(item => ({
      id: item.hitokotoId,
      text: item.text,
      createdAt: item.createdAt
    })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return ok({ hitokotoList: items, dog });
  }

  if (event.httpMethod === 'POST') {
    const parsed = PostSchema.safeParse(JSON.parse(event.body || '{}'));
    if (!parsed.success) return err(parsed.error.issues[0].message);

    const { text, dog } = parsed.data;
    const pk = dog === 'daizu' ? 'DAIZU' : 'CHIROL';
    const hitokotoId = `hitokoto_${Date.now()}`;
    const now = new Date().toISOString();

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: { PK: pk, SK: `HITOKOTO#${hitokotoId}`, hitokotoId, text: text.trim(), dog, createdAt: now }
    }));

    return ok({
      success: true,
      hitokotoId,
      message: dog === 'daizu' ? '追加しました！' : '追加したぜ。'
    });
  }

  if (event.httpMethod === 'DELETE') {
    const parsed = DeleteSchema.safeParse(JSON.parse(event.body || '{}'));
    if (!parsed.success) return err(parsed.error.issues[0].message);

    const { hitokotoId, dog } = parsed.data;
    const pk = dog === 'daizu' ? 'DAIZU' : 'CHIROL';

    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk, SK: `HITOKOTO#${hitokotoId}` }
    }));

    return ok({ success: true });
  }

  return err('Method not allowed', 405);
});
