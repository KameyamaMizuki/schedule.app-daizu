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
  updatePost,
  deletePost,
  togglePostLike,
  addPostComment,
  getSystemConfig
} from '../utils/dynamodb';
import { getLineCredentials } from '../utils/secrets';
import { pushFlexMessage, buildFlexBubble, getCommonQuickReply } from '../utils/line';
import { withHandler, ok, err } from '../utils/handler';
import { TEXT_LIMITS, TTL_POST_DAYS, getTTLFromNow, getDashboardUrl, getHomeUrl, FLEX_COLORS } from '../utils/constants';

function generatePostId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
}

const PostTypeSchema = z.enum(['POST', 'DIARY', 'YOUSU']).default('POST');

const CreateSchema = z.object({
  type: PostTypeSchema,
  userId: z.string().min(1),
  displayName: z.string().min(1),
  // POST / YOUSU / 旧DIARY形式
  text: z.string().optional(),
  // DIARY 新形式（body が存在すれば新形式）
  body: z.string().max(TEXT_LIMITS.DIARY).optional(),
  title: z.string().max(200).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  catchImageUrl: z.string().url().optional(),
  imageUrl: z.string().url().optional()
}).superRefine((data, ctx) => {
  const isDiary = data.type === 'DIARY';
  const hasContent = (data.text && data.text.length > 0) || (data.body && data.body.length > 0);
  if (!hasContent) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '本文は必須です', path: ['text'] });
    return;
  }
  if (!isDiary && data.text && data.text.length > TEXT_LIMITS.POST) {
    ctx.addIssue({ code: z.ZodIssueCode.too_big, maximum: TEXT_LIMITS.POST, type: 'string', inclusive: true, message: `${TEXT_LIMITS.POST}文字以内で入力してください`, path: ['text'] });
  }
  if (data.type === 'YOUSU' && data.text && data.text.length > TEXT_LIMITS.YOUSU) {
    ctx.addIssue({ code: z.ZodIssueCode.too_big, maximum: TEXT_LIMITS.YOUSU, type: 'string', inclusive: true, message: `${TEXT_LIMITS.YOUSU}文字以内で入力してください`, path: ['text'] });
  }
});

const UpdateSchema = z.object({
  type: PostTypeSchema,
  sk: z.string().min(1, 'sk は必須です'),
  displayName: z.string().optional(),
  // POST / YOUSU / 旧DIARY形式
  text: z.string().optional(),
  // DIARY 新形式
  body: z.string().max(200000).optional(),
  title: z.string().max(200).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  catchImageUrl: z.string().optional()
}).superRefine((data, ctx) => {
  const hasContent = (data.text && data.text.length > 0) || (data.body !== undefined);
  if (!hasContent) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '本文は必須です', path: ['text'] });
  }
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
  text: z.string().min(1).max(TEXT_LIMITS.COMMENT),
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

    const { type, userId, displayName, text, body, title, date, catchImageUrl, imageUrl } = parsed.data;
    const postId = generatePostId();
    const createdAt = new Date().toISOString();
    const sk = `${createdAt}#${postId}`;
    const isNewDiary = type === 'DIARY' && body !== undefined;

    const post: FamilyPost = {
      PK: type,
      SK: sk,
      postId,
      userId,
      displayName,
      text: isNewDiary ? '' : (text || ''),  // 新形式 DIARY は body に移行
      createdAt,
      reactions: { like: [] },
      comments: [],
      // DIARY・YOUSU は永続保存（TTLなし）。POST（つぶやき）のみ30日で自動削除
      ...(type === 'POST' ? { ttl: getTTLFromNow(TTL_POST_DAYS) } : {})
    };
    if (imageUrl) post.imageUrl = imageUrl;
    // 新形式 DIARY の追加フィールドを保存
    if (isNewDiary) {
      post.body = body;
      if (title) post.title = title;
      if (date) post.date = date;
      if (catchImageUrl) post.catchImageUrl = catchImageUrl;
    }

    await createPost(post);

    // 日記投稿時のLINE通知（ベストエフォート）
    if (type === 'DIARY') {
      try {
        const credentials = await getLineCredentials();
        const config = await getSystemConfig();
        if (config?.groupId) {
          // 新形式: title フィールドを使用。旧形式: text から抽出
          const notifyTitle = title || text?.match(/\[TITLE:([^\]]+)\]/)?.[1] || '(タイトルなし)';
          const preview = notifyTitle;

          const flex = buildFlexBubble(
            '📔 ダイ日記が投稿されました',
            FLEX_COLORS.DIARY,
            [`${displayName}さんが日記を書きました`, preview],
            [{ label: '詳細をアプリで確認', uri: `${getDashboardUrl()}?tab=diary` }]
          );
          const quickReply = getCommonQuickReply(getDashboardUrl(), getHomeUrl(), credentials.liffUrl);
          await pushFlexMessage(config.groupId, 'ダイ日記が投稿されました', flex, credentials.channelAccessToken, quickReply);
        }
      } catch (notifyError) {
        console.error('Diary notification failed (save succeeded):', notifyError);
      }
    }

    // 様子投稿時のLINE通知（ベストエフォート）
    if (type === 'YOUSU') {
      try {
        const credentials = await getLineCredentials();
        const config = await getSystemConfig();
        if (config?.groupId) {
          const src = text || '';
          const preview = src.length > 50 ? src.substring(0, 50) + '...' : src;
          const flex = buildFlexBubble(
            '🐕 だいずの様子が更新されました',
            FLEX_COLORS.DAIZU,
            [`${displayName}さんが様子を記録しました`, preview],
            [{ label: '詳細をアプリで確認', uri: `${getDashboardUrl()}?tab=yousu` }]
          );
          const quickReply = getCommonQuickReply(getDashboardUrl(), getHomeUrl(), credentials.liffUrl);
          await pushFlexMessage(config.groupId, '様子が更新されました', flex, credentials.channelAccessToken, quickReply);
        }
      } catch (notifyError) {
        console.error('Yousu notification failed (save succeeded):', notifyError);
      }
    }

    return ok({ postId, sk }, 201);
  }

  // PUT /posts/:postId - 編集
  if (method === 'PUT' && path.startsWith('/posts/')) {
    const parsed = UpdateSchema.safeParse(JSON.parse(event.body || '{}'));
    if (!parsed.success) return err(parsed.error.issues[0].message);

    const { text, body, type, sk, displayName: updaterName, title, date, catchImageUrl } = parsed.data;
    const isNewDiary = type === 'DIARY' && body !== undefined;

    if (isNewDiary) {
      await updatePost(type, sk, {
        text: body || '',
        body: body || '',
        title: title ?? '',
        date,
        catchImageUrl: catchImageUrl ?? ''
      });
    } else {
      await updatePost(type, sk, { text: (text || '').trim() });
    }

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
    try {
      const liked = await togglePostLike(type, sk, userId);
      return ok({ liked });
    } catch (e: any) {
      if (e.message === 'Post not found') return err('Post not found', 404);
      throw e;
    }
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
