/**
 * わんなでランキング管理 (refactored: shared docClient + middleware + Zod)
 * GET /wannade - ランキング取得
 * POST /wannade - スコア保存（上位3名のみ）
 */

import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { docClient } from '../utils/dynamodb';
import { withHandler, ok, err } from '../utils/handler';

const TABLE_NAME = process.env.TABLE_WANNADE_RANKING || 'WannadeRanking-kame';

interface RankingEntry {
  userId: string;
  displayName: string;
  score: number;
  recordedAt: string;
}

const PostSchema = z.object({
  userId: z.string().min(1, 'userId は必須です'),
  displayName: z.string().min(1, 'displayName は必須です'),
  score: z.number().int().nonnegative('スコアは0以上の整数です')
});

export const handler = withHandler(async (event) => {
  // GET /wannade - ランキング取得
  if (event.httpMethod === 'GET') {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: 'RANKING', SK: 'TOP3' }
    }));

    const rankings: RankingEntry[] = (result.Item as any)?.rankings || [];
    return ok({ rankings });
  }

  // POST /wannade - スコア保存
  if (event.httpMethod === 'POST') {
    const parsed = PostSchema.safeParse(JSON.parse(event.body || '{}'));
    if (!parsed.success) return err(parsed.error.issues[0].message);

    const { userId, displayName, score } = parsed.data;

    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: 'RANKING', SK: 'TOP3' }
    }));

    let rankings: RankingEntry[] = (result.Item as any)?.rankings || [];

    // 同ユーザーの既存エントリーを削除し、新スコアで追加
    rankings = rankings.filter(r => r.userId !== userId);
    rankings.push({ userId, displayName, score, recordedAt: new Date().toISOString() });
    rankings.sort((a, b) => b.score - a.score);
    rankings = rankings.slice(0, 3);

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: { PK: 'RANKING', SK: 'TOP3', rankings, updatedAt: new Date().toISOString() }
    }));

    const rank = rankings.findIndex(r => r.userId === userId) + 1;
    return ok({ isInTop3: rank > 0, rank, rankings });
  }

  return err('Not found', 404);
});
