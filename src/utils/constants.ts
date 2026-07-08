/**
 * アプリケーション全体で使用する定数
 */

// =============================================================
// アプリのリンク生成（ここが唯一の窓口）
// -------------------------------------------------------------
// ボットが送る全リンクはこの区画の関数だけで生成する。
// 各ハンドラー側で "?tab=..." などを文字列連結しないこと。
// パラメータを増やす／appv の付け方を変える等は、ここだけ直せばよい。
// =============================================================

/**
 * S3静的ウェブサイトのベースURL
 */
export const S3_BASE_URL =
  process.env.S3_BASE_URL ||
  'https://family-schedule-web-kame-982312822872.s3.ap-northeast-1.amazonaws.com';

/**
 * アプリのバージョン。ビルド時に esbuild が git SHA を注入（ローカルは 'dev'）。
 * 全リンクに ?appv= として付与し、デプロイごとにURL文字列を変える。
 * これで LINE内蔵ブラウザ等がURL単位でキャッシュしても、必ず最新を取り直す。
 */
export const APP_VERSION = process.env.APP_VERSION || 'dev';

/** dashboard.html のリンクに付けられるパラメータ */
export interface DashboardLinkParams {
  weekId?: string;
  tab?: 'schedule' | 'yousu' | 'diary' | 'wansta';
  subTab?: string;
  token?: string;
}

/**
 * クエリ文字列を組み立てる。appv は常に最後に付与。
 * URLSearchParams なので "?" は1つだけ・値は自動エンコードされる。
 */
function buildQuery(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, v);
  }
  q.set('appv', APP_VERSION);
  return q.toString();
}

/**
 * ダッシュボードURL生成（全パラメータをここで受ける）。
 * 例: getDashboardUrl({ tab: 'diary' }) / getDashboardUrl({ weekId }) / getDashboardUrl()
 */
export function getDashboardUrl(params: DashboardLinkParams = {}): string {
  return `${S3_BASE_URL}/dashboard.html?${buildQuery({
    weekId: params.weekId,
    tab: params.tab,
    subTab: params.subTab,
    token: params.token
  })}`;
}

/**
 * ホームURL生成
 */
export function getHomeUrl(): string {
  return `${S3_BASE_URL}/home.html?${buildQuery({})}`;
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
