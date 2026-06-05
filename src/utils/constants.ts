/**
 * アプリケーション全体で使用する定数
 */

/**
 * S3静的ウェブサイトのベースURL
 */
export const S3_BASE_URL =
  process.env.S3_BASE_URL ||
  'https://family-schedule-web-kame-982312822872.s3.ap-northeast-1.amazonaws.com';

/**
 * ダッシュボードURL生成
 */
export function getDashboardUrl(weekId?: string): string {
  return weekId
    ? `${S3_BASE_URL}/dashboard.html?weekId=${weekId}`
    : `${S3_BASE_URL}/dashboard.html`;
}

/**
 * ホームURL生成
 */
export function getHomeUrl(): string {
  return `${S3_BASE_URL}/home.html`;
}

// ========== DynamoDB キー ==========

/** SystemConfig テーブルのキー */
export const DB_KEYS = {
  CONFIG_PK: 'CONFIG',
  CONFIG_SK: 'MAIN',
  /** ChirolData テーブルの PK */
  CHIROL: 'CHIROL',
  DAIZU: 'DAIZU',
  /** SK プレフィックス */
  HITOKOTO_PREFIX: 'HITOKOTO#',
  IMAGE_PREFIX: 'IMAGE#',
  /** WannadeRanking テーブルのキー */
  RANKING_PK: 'RANKING',
  RANKING_SK: 'TOP3',
  /** だいずステータス用の仮想ユーザーID */
  DAIZU_STATUS_USER: 'daizu-status',
} as const;

// ========== DynamoDB テーブル名 ==========

export const TABLE_ACCOUNT_SETTINGS = process.env.TABLE_ACCOUNT_SETTINGS || 'AccountSettings-kame';

// ========== TTL ==========

/** スケジュールデータの TTL（秒） — 12週間 */
export const TTL_SCHEDULE_WEEKS = 12 * 7 * 24 * 60 * 60;

/** 投稿データの TTL（秒） — 30日 */
export const TTL_POST_DAYS = 30 * 24 * 60 * 60;

/** getTTL ヘルパー（現在時刻 + offset秒） */
export function getTTLFromNow(offsetSeconds: number): number {
  return Math.floor(Date.now() / 1000) + offsetSeconds;
}

// ========== テキスト制限 ==========

export const TEXT_LIMITS = {
  /** つぶやき本文 */
  POST: 500,
  /** ダイ日記本文（画像は S3 URL 化済みのため HTML テキストのみ） */
  DIARY: 200000,
  /** だいずの様子 */
  YOUSU: 200,
  /** コメント */
  COMMENT: 200,
  /** 一言 */
  HITOKOTO: 200,
} as const;

// ========== Flex Message カラー ==========

export const FLEX_COLORS = {
  /** スケジュール・メニューヘッダー */
  SCHEDULE: '#667eea',
  /** リマインダーヘッダー */
  REMINDER: '#ff9800',
  /** だいずステータスヘッダー */
  DAIZU: '#f57f17',
  /** 成功（送信完了など） */
  SUCCESS: '#28a745',
  /** エラー */
  ERROR: '#dc3545',
  /** ユーザーID表示 */
  INFO: '#6c757d',
  /** 管理者メニュー */
  ADMIN: '#495057',
  /** 日記通知ヘッダー */
  DIARY: '#8d6e63',
  /** サイトボタン */
  SITE_BUTTON: '#81c784',
  /** 本文テキスト */
  BODY_TEXT: '#555555',
} as const;

// ========== スケジュール時間帯 ==========

export const TIME_SLOT_LABELS: Record<string, string> = {
  allday: '終日',
  '09': '9時〜',
  '17': '17時〜',
  '21': '21時〜',
  '24': '24時〜',
};

export const TIME_SLOTS = ['allday', '09', '17', '21', '24'] as const;
