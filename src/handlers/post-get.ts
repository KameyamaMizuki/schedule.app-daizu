/**
 * GET /posts - つぶやき・ダイ日記の取得
 */

import { PostType } from '../types';
import { getPostsByType } from '../utils/dynamodb';
import { withHandler, ok } from '../utils/handler';

export const handler = withHandler(async (event) => {
  const params = event.queryStringParameters || {};
  const type: PostType = (params.type as PostType) || 'POST';
  const limit = Math.min(parseInt(params.limit || '50', 10), 100);

  const posts = await getPostsByType(type, limit);
  return ok({ posts });
});
