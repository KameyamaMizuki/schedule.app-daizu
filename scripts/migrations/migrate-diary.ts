/**
 * DIARY 旧形式 → 新形式マイグレーション
 *
 * 旧形式: text = "[DATE:...][TITLE:...][CATCH_IMG:data:...]<html>"
 * 新形式: body / title / date / catchImageUrl が独立したフィールド
 *
 * 実行方法:
 *   npx ts-node scripts/migrate-diary.ts --profile c3test
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const REGION = 'ap-northeast-1';
const TABLE_NAME = process.env.TABLE_FAMILY_POSTS || 'FamilyPosts-kame';
const BUCKET = process.env.CHIROL_IMAGE_BUCKET || 'family-schedule-web-kame-982312822872';

const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client);
const s3Client = new S3Client({ region: REGION });

async function uploadBase64ToS3(base64: string, label: string): Promise<string> {
  const imageId = `img_migrate_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const s3Key = `chirol-images/diary/${imageId}.jpg`;
  const data = base64.split(',')[1];
  const buffer = Buffer.from(data, 'base64');

  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    Body: buffer,
    ContentType: 'image/jpeg',
    CacheControl: 'max-age=31536000'
  }));

  const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${s3Key}`;
  console.log(`  [S3] ${label} → ${url}`);
  return url;
}

async function main() {
  console.log(`テーブル: ${TABLE_NAME}`);

  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': 'DIARY' }
  }));

  const posts = result.Items || [];
  console.log(`DIARY 件数: ${posts.length}\n`);

  let migrated = 0;
  let skipped = 0;

  for (const post of posts) {
    // 既に新形式なら skip
    if (post.body !== undefined) {
      console.log(`[SKIP] ${post.postId} — 既に新形式`);
      skipped++;
      continue;
    }

    console.log(`[処理中] ${post.postId}`);

    let text = post.text || '';
    let title = '';
    let date = '';
    let catchImageUrl: string | undefined;

    // DATE 抽出
    const dateMatch = text.match(/^\[DATE:(\d{4}-\d{2}-\d{2})\]/);
    if (dateMatch) {
      date = dateMatch[1];
      text = text.replace(dateMatch[0], '');
    } else {
      date = (post.createdAt as string).substring(0, 10);
    }

    // TITLE 抽出
    const titleMatch = text.match(/^\[TITLE:([^\]]+)\]/);
    if (titleMatch) {
      title = titleMatch[1];
      text = text.replace(titleMatch[0], '');
    }

    // PHOTO_POS 削除（後方互換タグ）
    const posMatch = text.match(/^\[PHOTO_POS:(top|middle|bottom)\]/);
    if (posMatch) text = text.replace(posMatch[0], '');

    // CATCH_IMG: base64 → S3
    const catchMatch = text.match(/^\[CATCH_IMG:(data:[^\]]+)\]/);
    if (catchMatch) {
      catchImageUrl = await uploadBase64ToS3(catchMatch[1], 'キャッチ画像');
      text = text.replace(catchMatch[0], '');
    }

    // 本文中のインライン base64 画像 → S3
    const imgMatches = [...text.matchAll(/src="(data:image\/[^"]+)"/g)];
    for (let i = 0; i < imgMatches.length; i++) {
      const url = await uploadBase64ToS3(imgMatches[i][1], `インライン画像 ${i + 1}`);
      text = text.replace(imgMatches[i][1], url);
    }

    // DynamoDB 更新
    const sets = ['body = :body', 'title = :title', '#date = :date', '#text = :text'];
    const names: Record<string, string> = { '#date': 'date', '#text': 'text' };
    const values: Record<string, unknown> = {
      ':body': text,
      ':title': title,
      ':date': date,
      ':text': text   // text も body と同じ値にして後方互換を維持
    };

    if (catchImageUrl) {
      sets.push('catchImageUrl = :catchImageUrl');
      values[':catchImageUrl'] = catchImageUrl;
    }

    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: post.PK, SK: post.SK },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values
    }));

    console.log(`  [OK] title="${title}", date="${date}"\n`);
    migrated++;
  }

  console.log(`\n完了: ${migrated} 件移行, ${skipped} 件スキップ`);
}

main().catch(err => { console.error(err); process.exit(1); });
