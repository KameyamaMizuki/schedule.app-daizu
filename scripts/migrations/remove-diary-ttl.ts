/**
 * DIARY/YOUSU アイテムの TTL 属性を削除するマイグレーションスクリプト
 *
 * 背景: createPost() のバグにより、全タイプに 30日 TTL が付与されていた。
 * このスクリプトで DynamoDB 上の既存 DIARY/YOUSU アイテムから ttl 属性を削除し、永続化する。
 *
 * 実行方法:
 *   npx ts-node scripts/remove-diary-ttl.ts
 *   （AWS プロファイルは環境変数 AWS_PROFILE または --profile で指定）
 *
 * 実行前に AWS SSO ログインを済ませること:
 *   aws sso login --profile c3test
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

// AWS プロファイルを環境変数または引数から取得
const args = process.argv.slice(2);
const profileIdx = args.indexOf('--profile');
if (profileIdx !== -1 && args[profileIdx + 1]) {
  process.env.AWS_PROFILE = args[profileIdx + 1];
}

const client = new DynamoDBClient({ region: 'ap-northeast-1' });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_FAMILY_POSTS || 'FamilyPosts-kame';

async function removeTtlForType(type: 'DIARY' | 'YOUSU'): Promise<number> {
  let count = 0;
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': type },
      ProjectionExpression: 'PK, SK, #t',
      ExpressionAttributeNames: { '#t': 'ttl' },
      ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {})
    }));

    const items = result.Items || [];
    console.log(`[${type}] ${items.length} 件を取得`);

    for (const item of items) {
      if (item.ttl === undefined) {
        console.log(`  スキップ (TTLなし): ${item.SK}`);
        continue;
      }

      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: item.PK, SK: item.SK },
        UpdateExpression: 'REMOVE #t',
        ExpressionAttributeNames: { '#t': 'ttl' }
      }));

      console.log(`  ✅ TTL削除: ${item.SK} (TTL was: ${item.ttl})`);
      count++;
    }

    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  return count;
}

async function main() {
  console.log('=== DIARY/YOUSU TTL削除マイグレーション ===');
  console.log(`テーブル: ${TABLE_NAME}`);
  console.log('');

  try {
    const diaryCount = await removeTtlForType('DIARY');
    console.log(`\n[DIARY] ${diaryCount} 件の TTL を削除しました`);

    const yousuCount = await removeTtlForType('YOUSU');
    console.log(`[YOUSU] ${yousuCount} 件の TTL を削除しました`);

    console.log('\n✅ マイグレーション完了');
  } catch (error) {
    console.error('❌ エラー:', error);
    process.exit(1);
  }
}

main();
