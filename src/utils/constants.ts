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
  /** タブ内での初期アクション（例: 'new' で日記タブの新規投稿画面を自動表示） */
  action?: string;
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
    token: params.token,
    action: params.action
  })}`;
}

/**
 * ホームURL生成。
 * home.html はリダイレクトスタブ化したため、直接 dashboard.html（デフォルトタブ=ホーム）に誘導する。
 * getDashboardUrl() とパラメータなしで同一。互換のため関数は残す。
 */
export function getHomeUrl(): string {
  return getDashboardUrl();
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
// web UI と同一の識別色（深緑#3F6E5B / アクセント橙#E8A13A / 茶橙#B0713A /
// 淡緑#6FA08B / 本文インク#2F3B33 / 補足グレー#97A09D）に統一。

export const FLEX_COLORS = {
  /** スケジュール・メニューヘッダー、今日の予定の在宅時間文字色 */
  SCHEDULE: '#3F6E5B',
  /** リマインダーヘッダー */
  REMINDER: '#E8A13A',
  /** だいずステータスヘッダー */
  DAIZU: '#6FA08B',
  /** 成功（送信完了など） */
  SUCCESS: '#3F6E5B',
  /** エラー */
  ERROR: '#C96A5A',
  /** ユーザーID表示・案内系ヘッダー */
  INFO: '#97A09D',
  /** 管理者メニュー */
  ADMIN: '#2F3B33',
  /** 日記通知ヘッダー */
  DIARY: '#B0713A',
  /** サイトボタン（CTA強調） */
  SITE_BUTTON: '#E8A13A',
  /** 本文テキスト */
  BODY_TEXT: '#2F3B33',
  /** 補足・お休み・プレビュー等の淡色テキスト */
  MUTED: '#97A09D',
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
