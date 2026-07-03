/**
 * GET /posts - つぶやき・ダイ日記の取得
 * クエリパラメータ:
 *   type: 'POST' | 'DIARY' | 'YOUSU' (default: 'POST')
 *   limit: 取得件数 (default: 50, max: 100)
 *   lastKey: ページネーションキー（前回レスポンスの lastEvaluatedKey を JSON エンコードして渡す）
 */

import { z } from 'zod';
import type { PostType } from '../types';
import { getPostsByType, mergeLikes } from '../utils/dynamodb';
import { withHandler, ok, err } from '../utils/handler';

const TypeSchema = z.enum(['POST', 'DIARY', 'YOUSU']);

export const handler = withHandler(async (event) => {
  const params = event.queryStringParameters || {};

  const rawType = params.type ?? 'POST';
  const typeParsed = TypeSchema.safeParse(rawType);
  if (!typeParsed.success) {
    return err('type は POST/DIARY/YOUSU のいずれかを指定してください');
  }
  const type: PostType = typeParsed.data;

  const limit = Math.min(parseInt(params.limit || '50', 10), 100);

  // ページネーションキーのデコード（あれば）
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  if (params.lastKey) {
    try {
      lastEvaluatedKey = JSON.parse(decodeURIComponent(params.lastKey));
    } catch {
      // 不正なキーは無視して先頭から取得
    }
  }

  const { posts: rawPosts, lastEvaluatedKey: nextKey } = await getPostsByType(type, limit, lastEvaluatedKey);

  // 古い投稿に reactions/comments がない場合のデフォルト値を補完
  // likeSet(DynamoDB String Set) は内部実装のためレスポンスから除去し、legacyとマージした配列を返す
  const posts = rawPosts.map(post => {
    const { likeSet, ...rest } = post as typeof post & { likeSet?: Set<string> | string[] };
    return {
      ...rest,
      reactions: { like: mergeLikes(post.reactions?.like, likeSet) },
      comments: post.comments || []
    };
  });

  return ok({
    posts,
    // 次のページが存在する場合のみ返す
    ...(nextKey ? { lastEvaluatedKey: encodeURIComponent(JSON.stringify(nextKey)) } : {})
  });
});
