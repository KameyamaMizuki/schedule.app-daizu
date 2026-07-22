// =============================================================
// config.js — 読み取り専用設定定数（変更禁止）
// Step 1: localStorage キー / タイミング / スケジュール / ゲーム / 画像圧縮
// =============================================================
const AppConfig = Object.freeze({

  /** localStorage キー */
  STORAGE: {
    AUTH_SESSION: 'authSession',
    FAMILY_BIRTHDAYS: 'familyBirthdays',
  },

  /** タイムアウト・遅延 (ms) */
  TIMING: {
    MSG_DISPLAY: 3000,  // 結果画面・吹き出し一言の最小表示時間
    DOG_FADE:     500,  // 犬画像フェードアウト
    DOG_CHANGE:   600,  // 犬画像切り替え待機
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
    ACCOUNT:         '/account',
  },

  /** 画像圧縮プリセット */
  IMAGE: {
    DIARY_PHOTO:   { maxWidth: 1200, quality: 0.80 },
    DIARY_CATCH:   { maxWidth:  600, quality: 0.75 },
    WANSTA_UPLOAD: { maxWidth:  800, quality: 0.85 },
    AVATAR_PHOTO:  { maxWidth:  200, quality: 0.80 },
    CROP_RESULT:   { maxWidth:  400, quality: 0.90 },
  },

  /** 犬画像パス（wansta.js / wansta-social.js / home.js 共通） */
  DOG_IMAGES: {
    CHIROL_AVATAR: 'images/dog/chirol/normal/IMG_3707.webp',
    DAIZU_AVATAR:  'images/dog/daizu/normal/IMG_0734.jpg',
  },

  /** おさんぽ日和(Open-Meteo) — 東京都江東区東雲1丁目 */
  WALK: {
    LAT: 35.638, LON: 139.801,
    HOT_LIMIT: 28,      // これ以上の気温は散歩非推奨(°C)
    RAIN_LIMIT: 50,     // 降水確率しきい値(%)
    CACHE_MIN: 60,      // キャッシュ分
    PLACE_NAME: '東雲', // 詳細パネルに表示する地点名(Task32)
  },

  /** カレンダー色（schedule-calendar.js） */
  CALENDAR_COLORS: {
    PRIMARY:        '#3F6E5B',  // ナビゲーションボタン・選択日・ヘッダーボーダー
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
