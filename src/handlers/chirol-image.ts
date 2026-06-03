/**
 * チロルの画像 Lambda
 *
 * GET /chirol/images?tag=... - 画像一覧取得
 * GET /chirol/upload-url?tag=...&contentType=... - S3 Presigned URL 取得
 * POST /chirol/images - 画像メタデータ保存（S3アップロード後）
 * DELETE /chirol/images - 画像削除
 *
 * 画像はフロントエンド→S3へ直接アップロード（Presigned URL）
 * メタデータのみDynamoDBに保存
 */

import { QueryCommand, PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { z } from 'zod';
import { docClient } from '../utils/dynamodb';
import { withHandler, ok, err } from '../utils/handler';
import { DB_KEYS } from '../utils/constants';
import { toggleLike, addComment, deleteComment } from '../utils/reactions';

const s3Client = new S3Client({});

const TABLE_NAME = process.env.TABLE_CHIROL_DATA || 'ChirolData-kame';
const BUCKET_NAME = process.env.CHIROL_IMAGE_BUCKET || 'family-schedule-web-kame-982312822872';
const IMAGE_PREFIX = 'chirol-images/';
const PRESIGNED_URL_EXPIRES = 300; // 5分

const IMAGE_TAGS = ['normal', 'happy', 'thinking', 'sad', 'diary', 'wansta-daizu'] as const;
type ImageTag = typeof IMAGE_TAGS[number];

const TagSchema = z.enum(IMAGE_TAGS);

const SaveMetaSchema = z.object({
  s3Key: z.string().min(1, 's3Key は必須です'),
  tag: TagSchema
});

const DeleteSchema = z.object({
  imageId: z.string().min(1, 'imageId は必須です')
});

export const handler = withHandler(async (event) => {
  const path = event.path;

  // GET /chirol/upload-url - Presigned URL 発行
  if (event.httpMethod === 'GET' && path.endsWith('/upload-url')) {
    const tag = event.queryStringParameters?.tag;
    const contentType = event.queryStringParameters?.contentType || 'image/jpeg';

    const tagParsed = TagSchema.safeParse(tag);
    if (!tagParsed.success) {
      return err(`tag は ${IMAGE_TAGS.join('/')} のいずれかを指定してください`);
    }

    const imageId = `img_${Date.now()}`;
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const s3Key = `${IMAGE_PREFIX}${tagParsed.data}/${imageId}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: PRESIGNED_URL_EXPIRES });
    const imageUrl = `https://${BUCKET_NAME}.s3.ap-northeast-1.amazonaws.com/${s3Key}`;

    return ok({ uploadUrl, s3Key, imageId, imageUrl });
  }

  // GET /chirol/images - 画像一覧
  if (event.httpMethod === 'GET') {
    const tag = event.queryStringParameters?.tag as ImageTag | undefined;

    // ScanCommand → QueryCommand に変更（効率化）
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': DB_KEYS.CHIROL, ':prefix': DB_KEYS.IMAGE_PREFIX },
      ...(tag ? {
        FilterExpression: 'tag = :tag',
        ExpressionAttributeValues: { ':pk': DB_KEYS.CHIROL, ':prefix': DB_KEYS.IMAGE_PREFIX, ':tag': tag }
      } : {})
    }));

    const items = (result.Items || []).map(item => ({
      id: item.imageId,
      url: item.imageUrl,
      tag: item.tag,
      createdAt: item.createdAt,
      likes: item.likes || [],
      comments: item.comments || []
    })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return ok({ images: items });
  }

  // POST /chirol/images - メタデータ保存 / いいねトグル / コメント追加
  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');

    // ── いいねトグル ──
    if (body.action === 'like') {
      const { imageId, userId } = body;
      if (!imageId || !userId) return err('imageId と userId は必須です');
      const key = { PK: DB_KEYS.CHIROL, SK: `${DB_KEYS.IMAGE_PREFIX}${imageId}` };
      const existing = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: key }));
      if (!existing.Item) return err('Image not found', 404);
      const likes = await toggleLike(TABLE_NAME, key, String(userId));
      return ok({ likes });
    }

    // ── コメント追加 ──
    if (body.action === 'addComment') {
      const { imageId, userId, userName, text } = body;
      if (!imageId || !userId || !text) return err('imageId, userId, text は必須です');
      const key = { PK: DB_KEYS.CHIROL, SK: `${DB_KEYS.IMAGE_PREFIX}${imageId}` };
      const existing = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: key }));
      if (!existing.Item) return err('Image not found', 404);
      const comment = await addComment(TABLE_NAME, key, { userId: String(userId), userName: String(userName ?? ''), text: String(text) });
      return ok({ comment });
    }

    // ── 既存: メタデータ保存 ──
    const parsed = SaveMetaSchema.safeParse(body);
    if (!parsed.success) return err(parsed.error.issues[0].message);

    const { s3Key, tag } = parsed.data;
    const imageId = s3Key.split('/').pop()?.replace(/\.\w+$/, '') || `img_${Date.now()}`;
    const imageUrl = `https://${BUCKET_NAME}.s3.ap-northeast-1.amazonaws.com/${s3Key}`;
    const now = new Date().toISOString();

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: { PK: DB_KEYS.CHIROL, SK: `${DB_KEYS.IMAGE_PREFIX}${imageId}`, imageId, imageUrl, s3Key, tag, createdAt: now }
    }));

    return ok({ success: true, imageId, imageUrl, message: '追加したぜ。' });
  }

  // DELETE /chirol/images - 画像削除 / コメント削除
  if (event.httpMethod === 'DELETE') {
    const body = JSON.parse(event.body || '{}');

    // ── コメント削除 ──
    if (body.commentId) {
      const { imageId, commentId } = body;
      if (!imageId) return err('imageId は必須です');
      const key = { PK: DB_KEYS.CHIROL, SK: `${DB_KEYS.IMAGE_PREFIX}${imageId}` };
      try {
        await deleteComment(TABLE_NAME, key, String(commentId));
      } catch {
        return err('Image not found', 404);
      }
      return ok({ success: true });
    }

    // ── 既存: 画像削除 ──
    const parsed = DeleteSchema.safeParse(body);
    if (!parsed.success) return err(parsed.error.issues[0].message);

    const { imageId } = parsed.data;

    // ScanCommand → GetCommand に変更（直接キーで取得）
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: DB_KEYS.CHIROL, SK: `${DB_KEYS.IMAGE_PREFIX}${imageId}` }
    }));

    if (!result.Item) {
      return err('Image not found', 404);
    }

    if (result.Item.s3Key) {
      await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: result.Item.s3Key }));
    }

    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: DB_KEYS.CHIROL, SK: `${DB_KEYS.IMAGE_PREFIX}${imageId}` }
    }));

    return ok({ success: true });
  }

  return err('Method not allowed', 405);
});
