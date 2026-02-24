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
      CacheControl: 'max-age=31536000'
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
      ExpressionAttributeValues: { ':pk': 'CHIROL', ':prefix': 'IMAGE#' },
      ...(tag ? {
        FilterExpression: 'tag = :tag',
        ExpressionAttributeValues: { ':pk': 'CHIROL', ':prefix': 'IMAGE#', ':tag': tag }
      } : {})
    }));

    const items = (result.Items || []).map(item => ({
      id: item.imageId,
      url: item.imageUrl,
      tag: item.tag,
      createdAt: item.createdAt
    })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return ok({ images: items });
  }

  // POST /chirol/images - S3アップロード後のメタデータ保存
  if (event.httpMethod === 'POST') {
    const parsed = SaveMetaSchema.safeParse(JSON.parse(event.body || '{}'));
    if (!parsed.success) return err(parsed.error.issues[0].message);

    const { s3Key, tag } = parsed.data;
    const imageId = s3Key.split('/').pop()?.replace(/\.\w+$/, '') || `img_${Date.now()}`;
    const imageUrl = `https://${BUCKET_NAME}.s3.ap-northeast-1.amazonaws.com/${s3Key}`;
    const now = new Date().toISOString();

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: { PK: 'CHIROL', SK: `IMAGE#${imageId}`, imageId, imageUrl, s3Key, tag, createdAt: now }
    }));

    return ok({ success: true, imageId, imageUrl, message: '追加したぜ。' });
  }

  // DELETE /chirol/images - 画像削除
  if (event.httpMethod === 'DELETE') {
    const parsed = DeleteSchema.safeParse(JSON.parse(event.body || '{}'));
    if (!parsed.success) return err(parsed.error.issues[0].message);

    const { imageId } = parsed.data;

    // ScanCommand → GetCommand に変更（直接キーで取得）
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: 'CHIROL', SK: `IMAGE#${imageId}` }
    }));

    if (!result.Item) {
      return err('Image not found', 404);
    }

    if (result.Item.s3Key) {
      await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: result.Item.s3Key }));
    }

    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: 'CHIROL', SK: `IMAGE#${imageId}` }
    }));

    return ok({ success: true });
  }

  return err('Method not allowed', 405);
});
