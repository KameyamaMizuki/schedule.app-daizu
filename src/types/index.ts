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

export const TIME_SLOTS = ['allday', '09', '17', '21', '24'] as const;
export type TimeSlot = typeof TIME_SLOTS[number];

export const DAYS_OF_WEEK = ['月', '火', '水', '木', '金', '土', '日'] as const;

// つぶやき・ダイ日記用
export type PostType = 'POST' | 'DIARY';

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
  text: string;
  imageUrl?: string;
  createdAt: string;
  reactions?: PostReactions;
  comments?: PostComment[];
  ttl: number;
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
