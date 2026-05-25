/**
 * GET /posts - つぶやき・ダイ日記の取得
 * クエリパラメータ:
 *   type: 'POST' | 'DIARY' | 'YOUSU' (default: 'POST')
 *   limit: 取得件数 (default: 50, max: 100)
 *   lastKey: ページネーションキー（前回レスポンスの lastEvaluatedKey を JSON エンコードして渡す）
 */

import { PostType } from '../types';
import { getPostsByType } from '../utils/dynamodb';
import { withHandler, ok } from '../utils/handler';

export const handler = withHandler(async (event) => {
  const params = event.queryStringParameters || {};
  const type: PostType = (params.type as PostType) || 'POST';
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
  const posts = rawPosts.map(post => ({
    ...post,
    reactions: post.reactions || { like: [] },
    comments: post.comments || []
  }));

  return ok({
    posts,
    // 次のページが存在する場合のみ返す
    ...(nextKey ? { lastEvaluatedKey: encodeURIComponent(JSON.stringify(nextKey)) } : {})
  });
});
