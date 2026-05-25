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
  text: z.string().min(1, '本文は必須です'),
  imageUrl: z.string().url().optional()
}).superRefine((data, ctx) => {
  const limit = data.type === 'DIARY' ? TEXT_LIMITS.DIARY : (data.type === 'YOUSU' ? TEXT_LIMITS.YOUSU : TEXT_LIMITS.POST);
  if (data.text.length > limit) {
    ctx.addIssue({
      code: z.ZodIssueCode.too_big,
      maximum: limit,
      type: 'string',
      inclusive: true,
      message: data.type === 'DIARY' ? 'データサイズが大きすぎます' : `${limit}文字以内で入力してください`,
      path: ['text']
    });
  }
});

const UpdateSchema = z.object({
  text: z.string().min(1),
  type: PostTypeSchema,
  sk: z.string().min(1, 'sk は必須です'),
  displayName: z.string().optional()  // LINE更新通知用
}).superRefine((data, ctx) => {
  const limit = data.type === 'DIARY' ? TEXT_LIMITS.DIARY : (data.type === 'YOUSU' ? TEXT_LIMITS.YOUSU : TEXT_LIMITS.POST);
  if (data.text.length > limit) {
    ctx.addIssue({
      code: z.ZodIssueCode.too_big,
      maximum: limit,
      type: 'string',
      inclusive: true,
      message: 'テキストが長すぎます',
      path: ['text']
    });
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
      // DIARY・YOUSU は永続保存（TTLなし）。POST（つぶやき）のみ30日で自動削除
      ...(type === 'POST' ? { ttl: getTTLFromNow(TTL_POST_DAYS) } : {})
    };
    if (imageUrl) post.imageUrl = imageUrl;

    await createPost(post);

    // 日記投稿時のLINE通知（ベストエフォート）
    if (type === 'DIARY') {
      try {
        const credentials = await getLineCredentials();
        const config = await getSystemConfig();
        if (config?.groupId) {
          // base64画像データ・タグを除去してプレビュー生成
          const cleanText = text
            .replace(/\[CATCH_IMG:[^\]]*\]/g, '')
            .replace(/\[DATE:[^\]]*\]/g, '')
            .replace(/\[TITLE:[^\]]*\]/g, '')
            .replace(/\[PHOTO_POS:[^\]]*\]/g, '')
            .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '')
            .replace(/<[^>]*>/g, '')
            .trim();
          const preview = cleanText.length > 50 ? cleanText.substring(0, 50) + '...' : cleanText;

          const flex = buildFlexBubble(
            '📔 ダイ日記が投稿されました',
            FLEX_COLORS.DIARY,
            [`${displayName}さんが日記を書きました`, preview || '(写真付き)'],
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
          const preview = text.length > 50 ? text.substring(0, 50) + '...' : text;
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

    const { text, type, sk, displayName: updaterName } = parsed.data;
    await updatePostText(type, sk, text.trim());

    // DIARY/YOUSU 更新時のLINE通知（ベストエフォート）
    if ((type === 'DIARY' || type === 'YOUSU') && updaterName) {
      try {
        const credentials = await getLineCredentials();
        const config = await getSystemConfig();
        if (config?.groupId) {
          const label = type === 'DIARY' ? 'ダイ日記' : '様子';
          const tabName = type === 'DIARY' ? 'diary' : 'yousu';
          const color = type === 'DIARY' ? FLEX_COLORS.DIARY : FLEX_COLORS.DAIZU;
          const icon = type === 'DIARY' ? '📔' : '🐕';
          // base64・HTMLタグを除去してプレビュー生成
          const cleanText = text
            .replace(/\[CATCH_IMG:[^\]]*\]/g, '')
            .replace(/\[DATE:[^\]]*\]/g, '')
            .replace(/\[TITLE:[^\]]*\]/g, '')
            .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '')
            .replace(/<[^>]*>/g, '')
            .trim();
          const preview = cleanText.length > 50 ? cleanText.substring(0, 50) + '...' : cleanText;
          const flex = buildFlexBubble(
            `${icon} ${label}が更新されました`,
            color,
            [`${updaterName}さんが${label}を更新しました`, preview || '(内容あり)'],
            [{ label: '詳細をアプリで確認', uri: `${getDashboardUrl()}?tab=${tabName}` }]
          );
          const quickReply = getCommonQuickReply(getDashboardUrl(), getHomeUrl(), credentials.liffUrl);
          await pushFlexMessage(config.groupId, `${label}が更新されました`, flex, credentials.channelAccessToken, quickReply);
        }
      } catch (notifyError) {
        console.error('Update notification failed (update succeeded):', notifyError);
      }
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
