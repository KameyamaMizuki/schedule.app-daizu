/**
 * 共通型定義
 */

export interface ScheduleSlots {
  [slotKey: string]: boolean; // "2025-01-06:allday", "2025-01-06:09" etc.
}

export interface NotesByDate {
  [dateStr: string]: string; // "2025-01-06": "備考内容"
}

export interface ScheduleInput {
  weekId: string;
  userId: string;
  displayName: string;
  slots: ScheduleSlots;
  notes?: NotesByDate;
  submittedAt: string;
  isLocked: boolean;
  ttl?: number;
}

export interface SystemConfig {
  groupId: string;
  adminUserId: string;
  timezone: string;
}

export interface ScheduleSubmitRequest {
  weekId: string;
  userId: string;
  slots: ScheduleSlots;
  notes?: NotesByDate;
  displayName: string;
}

export interface ScheduleGetResponse {
  weekId: string;
  startDate: string;
  endDate: string;
  deadline: string;
  isLocked: boolean;
  slots: ScheduleSlots;
  notes?: NotesByDate;
  isAdmin: boolean;
}

export const DAYS_OF_WEEK = ['月', '火', '水', '木', '金', '土', '日'] as const;

// つぶやき・ダイ日記用
export type PostType = 'POST' | 'DIARY' | 'YOUSU';

export interface PostComment {
  userId: string;
  displayName: string;
  text: string;
  createdAt: string;
}

export interface PostReactions {
  like?: string[]; // userIdの配列
}

export interface FamilyPost {
  PK: PostType;
  SK: string; // timestamp#postId
  postId: string;
  userId: string;
  displayName: string;
  text: string;          // POST/YOUSU の本文。DIARY は body フィールドが優先（後方互換のため残す）
  imageUrl?: string;
  createdAt: string;
  reactions?: PostReactions;
  comments?: PostComment[];
  ttl?: number;
  // ── 日記 v2 フィールド（body が存在すれば新形式） ──
  body?: string;          // 日記本文 HTML（インライン画像は S3 URL）
  title?: string;         // 日記タイトル
  date?: string;          // 日付 YYYY-MM-DD
  catchImageUrl?: string; // キャッチ画像 S3 URL
}

export interface CreatePostRequest {
  type: PostType;
  userId: string;
  displayName: string;
  text: string;
  imageUrl?: string;
}

export interface PostReactionRequest {
  userId: string;
  action: 'like';
}

export interface PostCommentRequest {
  userId: string;
  displayName: string;
  text: string;
}

export interface AccountSettings {
  userId: string;
  displayName: string;
  avatarType: 'photo' | 'emoji';
  avatarUrl?: string;
  avatarEmoji?: string;
  birthday?: string;
  pinHash?: string;
  updatedAt: string;
}
