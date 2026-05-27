/**
 * Phase 2 新規DynamoDBテーブル作成スクリプト
 *
 * 作成するテーブル:
 * - FamilyPosts-kame: つぶやき + ダイ日記用（TTL 30日）
 * - WannadeRanking-kame: わんなでランキング用（上位3名のみ保存）
 */

import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  UpdateTimeToLiveCommand
} from '@aws-sdk/client-dynamodb';
import { fromSSO } from '@aws-sdk/credential-providers';

const client = new DynamoDBClient({
  region: 'ap-northeast-1',
  credentials: fromSSO({ profile: process.env.AWS_PROFILE || 'c3test' })
});

async function createFamilyPostsTable() {
  const TABLE_NAME = 'FamilyPosts-kame';
  console.log(`\n=== ${TABLE_NAME} テーブル作成 ===\n`);

  // 既存テーブル確認
  try {
    const describeResult = await client.send(new DescribeTableCommand({
      TableName: TABLE_NAME
    }));
    console.log('テーブルは既に存在します:', describeResult.Table?.TableStatus);
    return;
  } catch (error: any) {
    if (error.name !== 'ResourceNotFoundException') {
      throw error;
    }
    console.log('テーブルが存在しないため作成します...');
  }

  // テーブル作成
  await client.send(new CreateTableCommand({
    TableName: TABLE_NAME,
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },   // POST | DIARY
      { AttributeName: 'SK', KeyType: 'RANGE' }   // timestamp#id
    ],
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  }));

  console.log('✓ テーブル作成完了');

  // TTL設定（30日）
  console.log('TTL設定を有効化（テーブル作成待ち中...）');
  await new Promise(resolve => setTimeout(resolve, 15000)); // テーブル作成待ち（15秒）

  await client.send(new UpdateTimeToLiveCommand({
    TableName: TABLE_NAME,
    TimeToLiveSpecification: {
      Enabled: true,
      AttributeName: 'ttl'
    }
  }));

  console.log('✓ TTL設定完了（30日後に自動削除）');
  console.log('\nテーブル構造:');
  console.log('  PK: "POST" (つぶやき) | "DIARY" (ダイ日記)');
  console.log('  SK: "YYYY-MM-DDTHH:mm:ss#<postId>"');
  console.log('\nつぶやきデータ:');
  console.log('  { PK, SK, postId, userId, displayName, text, createdAt, reactions, comments, ttl }');
  console.log('\nダイ日記データ:');
  console.log('  { PK, SK, postId, userId, displayName, text, imageUrl?, createdAt, ttl }');
}

async function createWannadeRankingTable() {
  const TABLE_NAME = 'WannadeRanking-kame';
  console.log(`\n=== ${TABLE_NAME} テーブル作成 ===\n`);

  // 既存テーブル確認
  try {
    const describeResult = await client.send(new DescribeTableCommand({
      TableName: TABLE_NAME
    }));
    console.log('テーブルは既に存在します:', describeResult.Table?.TableStatus);
    return;
  } catch (error: any) {
    if (error.name !== 'ResourceNotFoundException') {
      throw error;
    }
    console.log('テーブルが存在しないため作成します...');
  }

  // テーブル作成
  await client.send(new CreateTableCommand({
    TableName: TABLE_NAME,
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },   // RANKING
      { AttributeName: 'SK', KeyType: 'RANGE' }   // 1 | 2 | 3 (rank)
    ],
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  }));

  console.log('✓ テーブル作成完了');
  console.log('\nテーブル構造:');
  console.log('  PK: "RANKING"');
  console.log('  SK: "1" | "2" | "3" (ランク順位)');
  console.log('\nランキングデータ:');
  console.log('  { PK, SK, userId, displayName, score, achievedAt }');
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  Phase 2 DynamoDBテーブル作成スクリプト  ║');
  console.log('╚════════════════════════════════════════╝');

  try {
    await createFamilyPostsTable();
    await createWannadeRankingTable();

    console.log('\n========================================');
    console.log('✓ 全テーブル作成完了');
    console.log('========================================\n');
  } catch (error) {
    console.error('エラー:', error);
    process.exit(1);
  }
}

main();
