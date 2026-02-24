// =============================================================
// config.js — 読み取り専用設定定数（変更禁止）
// Step 1: localStorage キー / タイミング / スケジュール / ゲーム / 画像圧縮
// =============================================================
const AppConfig = Object.freeze({

  /** localStorage キー */
  STORAGE: {
    CURRENT_USER_ID:  'currentUserId',
    CUSTOM_PHOTOS:    'customPhotos',
    CUSTOM_AVATARS:   'customAvatars',
    CUSTOM_NAMES:     'customNames',
    FAMILY_BIRTHDAYS: 'familyBirthdays',
    WANSTA_LIKES:     'wanstaLikes',
    WANSTA_COMMENTS:  'wanstaComments',
  },

  /** タイムアウト・遅延 (ms) */
  TIMING: {
    MSG_DISPLAY: 3000,  // 結果画面の最小表示時間
    DOG_FADE:     500,  // 犬画像フェードアウト
    DOG_CHANGE:   600,  // 犬画像切り替え待機
    INTERVAL:    1000,  // ゲームタイマー刻み
  },

  /** なでなでゲーム設定 */
  WANNADE: {
    GAME_SECONDS:       10,  // 1プレイ秒数
    PHOTO_CHANGE_EVERY: 20,  // タップ何回ごとに画像切替
    RANKING_TOP:         3,  // 表示ランキング件数
  },

  /** スケジュール時間帯（schedule.js / schedule-calendar.js / home.js 共通） */
  SCHEDULE: {
    SLOTS:     ['allday', '09', '17', '21', '24'],
    LABELS:    ['終日', '9時', '17時', '21時', '24時'],
    DAYS:      ['日', '月', '火', '水', '木', '金', '土'],
    LABEL_MAP: { allday: '終日', '09': '9時', '17': '17時', '21': '21時', '24': '24時' },
  },

  /** デフォルト一言テキスト（home.js / wansta.js 共通） */
  CHIROL_HITOKOTO_TEXTS: [
    'オレはチロル！好きなことはクン活だ！',
    '食べたいものは変わるけど…大目に見ろよ！',
    'みんなの笑顔が大好きなんだぜ！',
    'オレは優しいから、みんなのそばにいるぞ！',
    '小さい頃のことは…聞かないでくれよな…',
    '広島出身、東京在住だ！すげーだろ！',
    'ささみと芋、イチゴが最高なんだぞ～',
  ],
  DAIZU_HITOKOTO_TEXTS: [
    'わたしはだいずです、よろしくね！',
    'おさんぽ大好き！',
    'チロルお兄ちゃんが大好きなの',
    'ごはんの時間が待ち遠しいな～',
    'みんなに会えてうれしいです！',
  ],

  /** API パス（${API_BASE_URL} に付加する文字列） */
  API: {
    CHIROL_IMAGES:   '/chirol/images',
    CHIROL_HITOKOTO: '/chirol/hitokoto',
    SCHEDULE_WEEK:   '/schedule/week',
    SCHEDULE_SUBMIT: '/schedule/submit',
    POSTS:           '/posts',
    CHIROL_UPLOAD_URL: '/chirol/upload-url',
    WANNADE:         '/wannade',
  },

  /** 画像圧縮プリセット */
  IMAGE: {
    DIARY_PHOTO:   { maxWidth: 1200, quality: 0.80 },
    DIARY_CATCH:   { maxWidth:  600, quality: 0.75 },
    WANSTA_UPLOAD: { maxWidth:  800, quality: 0.85 },
    AVATAR_PHOTO:  { maxWidth:  200, quality: 0.80 },
    CROP_RESULT:   { maxWidth:  400, quality: 0.90 },
  },

  /** だいず占い グラデーション・色（home.uranau.js） */
  FORTUNE: {
    /** 運勢7段階の結果カード背景グラデーション */
    BG: {
      '大吉': 'linear-gradient(135deg,#ffd700,#ffeb3b)',
      '中吉': 'linear-gradient(135deg,#ff9800,#ffb74d)',
      '吉':   'linear-gradient(135deg,#4caf50,#81c784)',
      '小吉': 'linear-gradient(135deg,#8bc34a,#aed581)',
      '末吉': 'linear-gradient(135deg,#9e9e9e,#bdbdbd)',
      '凶':   'linear-gradient(135deg,#9c27b0,#ba68c8)',
      '大凶': 'linear-gradient(135deg,#673ab7,#9575cd)',
    },
    /** ローディングカード背景 */
    LOADING_BG:  'linear-gradient(135deg,#fce4ec,#f8bbd9)',
    /** ローディングプログレスバー */
    LOADING_BAR: 'linear-gradient(90deg,#e91e63,#ad1457)',
  },

  /** カレンダー色（schedule-calendar.js） */
  CALENDAR_COLORS: {
    PRIMARY:        '#e91e8c',  // ナビゲーションボタン・選択日・ヘッダーボーダー
    SUNDAY:         '#dc3545',  // 日曜文字色
    SATURDAY:       '#0d6efd',  // 土曜文字色
    WEEKDAY:        '#6c757d',  // 平日文字色
    TODAY_BG:       '#fff3cd',  // 今日背景色
    STATUS_ALL:     '#28a745',  // 全員予定ありインジケーター
    STATUS_PARTIAL: '#0d6efd',  // 一部予定ありインジケーター
    STATUS_SELF:    '#ffc107',  // 自分のみインジケーター
    STATUS_NONE:    '#dc3545',  // 予定なしインジケーター
  },
});
