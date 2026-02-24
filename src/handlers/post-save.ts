/**
 * POST /posts - つぶやき・ダイ日記の投稿
 * PUT /posts/:postId - 投稿の編集
 * DELETE /posts/:postId - 投稿の削除
 * POST /posts/:postId/reaction - リアクション追加/削除
 * POST /posts/:postId/comment - コメント追加
 */

import { z } from 'zod';
import { FamilyPost, PostType } from '../types';
import {
  createPost,
  getPost,
  updatePostText,
  deletePost,
  addPostReaction,
  removePostReaction,
  addPostComment
} from '../utils/dynamodb';
import { withHandler, ok, err } from '../utils/handler';

function generatePostId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
}

const PostTypeSchema = z.enum(['POST', 'DIARY']).default('POST');

const CreateSchema = z.object({
  type: PostTypeSchema,
  userId: z.string().min(1),
  displayName: z.string().min(1),
  text: z.string().min(1, '本文は必須です').max(500, '500文字以内で入力してください'),
  imageUrl: z.string().url().optional()
});

const UpdateSchema = z.object({
  text: z.string().min(1).max(500),
  type: PostTypeSchema,
  sk: z.string().min(1, 'sk は必須です')
});

const DeleteQuerySchema = z.object({
  sk: z.string().min(1, 'sk は必須です'),
  type: PostTypeSchema
});

const ReactionSchema = z.object({
  userId: z.string().min(1),
  action: z.string(),
  type: PostTypeSchema,
  sk: z.string().min(1)
});

const CommentSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1),
  text: z.string().min(1).max(200),
  type: PostTypeSchema,
  sk: z.string().min(1)
});

export const handler = withHandler(async (event) => {
  const path = event.path;
  const method = event.httpMethod;

  // POST /posts - 新規投稿
  if (method === 'POST' && path === '/posts') {
    const parsed = CreateSchema.safeParse(JSON.parse(event.body || '{}'));
    if (!parsed.success) return err(parsed.error.issues[0].message);

    const { type, userId, displayName, text, imageUrl } = parsed.data;
    const postId = generatePostId();
    const createdAt = new Date().toISOString();
    const sk = `${createdAt}#${postId}`;

    const post: FamilyPost = {
      PK: type,
      SK: sk,
      postId,
      userId,
      displayName,
      text,
      createdAt,
      reactions: { like: [] },
      comments: [],
      ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
    };
    if (imageUrl) post.imageUrl = imageUrl;

    await createPost(post);
    return ok({ postId, sk }, 201);
  }

  // PUT /posts/:postId - 編集
  if (method === 'PUT' && path.startsWith('/posts/')) {
    const parsed = UpdateSchema.safeParse(JSON.parse(event.body || '{}'));
    if (!parsed.success) return err(parsed.error.issues[0].message);

    const { text, type, sk } = parsed.data;
    await updatePostText(type, sk, text.trim());
    return ok({ message: 'Updated' });
  }

  // DELETE /posts/:postId - 削除
  if (method === 'DELETE' && path.startsWith('/posts/')) {
    const parsed = DeleteQuerySchema.safeParse(event.queryStringParameters || {});
    if (!parsed.success) return err(parsed.error.issues[0].message);

    await deletePost(parsed.data.type, parsed.data.sk);
    return ok({ message: 'Deleted' });
  }

  // POST /posts/:postId/reaction - リアクション（トグル）
  if (method === 'POST' && path.includes('/reaction')) {
    const parsed = ReactionSchema.safeParse(JSON.parse(event.body || '{}'));
    if (!parsed.success) return err(parsed.error.issues[0].message);

    const { userId, type, sk } = parsed.data;
    const post = await getPost(type, sk);
    if (!post) return err('Post not found', 404);

    const isLiked = post.reactions?.like?.includes(userId);
    if (isLiked) {
      await removePostReaction(type, sk, userId);
    } else {
      await addPostReaction(type, sk, userId);
    }
    return ok({ liked: !isLiked });
  }

  // POST /posts/:postId/comment - コメント追加
  if (method === 'POST' && path.includes('/comment')) {
    const parsed = CommentSchema.safeParse(JSON.parse(event.body || '{}'));
    if (!parsed.success) return err(parsed.error.issues[0].message);

    const { userId, displayName, text, type, sk } = parsed.data;
    await addPostComment(type, sk, { userId, displayName, text: text.trim(), createdAt: new Date().toISOString() });
    return ok({ message: 'Comment added' }, 201);
  }

  return err('Not found', 404);
});
