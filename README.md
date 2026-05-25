# 家族スケジュール管理 + わんこキャラクター LINEボット

家族の週次スケジュール管理と、愛犬キャラクター（チロル＆だいず）機能を、LINEボット＋LIFF画面で実現するシステムです。

## 目次

- [システム概要](#システム概要)
- [アーキテクチャ](#アーキテクチャ)
- [主な機能](#主な機能)
- [デプロイ](#デプロイ)
- [API仕様](#api仕様)
- [データベース設計](#データベース設計)
- [プロジェクト構造](#プロジェクト構造)
- [変更履歴](#変更履歴)

## システム概要

### 主な特徴

- **週次スケジュール管理**: 月曜～日曜の1週間単位で管理
- **LINE連携**: LINEボットとLIFF画面で簡単入力
- **2キャラクター対応**: チロル＆だいずの一言・画像管理
- **つぶやき・ダイ日記**: 家族間の投稿・リアクション・コメント機能
- **WANsta（わんなで）**: 犬なでなでタップゲーム＆ランキング
- **占い**: 日替わり占い機能
- **自動リマインド**: 毎週金曜10:00に翌週の予定入力リマインド送信
- **GitHub Actions自動デプロイ**: mainブランチへのpushで自動デプロイ

## アーキテクチャ

### システム構成図

```
┌─────────────────────────────────────────────────────────┐
│                    LINE Platform                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐      │
│  │ Messaging│  │  Webhook │  │   LIFF App       │      │
│  │   API    │  │          │  │ (静的Webページ)   │      │
│  └─────┬────┘  └────┬─────┘  └────────┬─────────┘      │
└────────┼────────────┼─────────────────┼─────────────────┘
         │            │                 │
    ┌────▼────────────▼─────────────────▼─────┐
    │         API Gateway (REST API)           │
    │         prod stage / CORS有効            │
    └────┬────────────────────────────────┬────┘
         │                                │
    ┌────▼─────────────────┐    ┌────────▼───────┐
    │  Lambda Functions    │    │   S3 Bucket    │
    │  (10関数)            │    │                │
    │                      │    │  ├─ home.html  │
    │  スケジュール系       │    │  ├─ dashboard  │
    │  ├─ webhook          │    │  │   .html     │
    │  ├─ schedule-get     │    │  ├─ scripts/   │
    │  ├─ schedule-submit  │    │  ├─ styles/    │
    │  ├─ schedule-week-get│    │  └─ images/    │
    │  └─ weekly-reminder  │    │     dog/       │
    │                      │    │     ├─chirol/  │
    │  キャラクター系       │    │     └─daizu/   │
    │  ├─ chirol-hitokoto  │    └────────────────┘
    │  └─ chirol-image     │
    │                      │    ┌────────────────┐
    │  投稿系              │    │  GitHub Actions │
    │  ├─ post-get         │    │  CI/CD Pipeline │
    │  ├─ post-save        │    │  (自動デプロイ)  │
    │  └─ wannade-save     │    └────────────────┘
    └──────────┬───────────┘
               │
    ┌──────────▼───────────┐
    │  DynamoDB (5テーブル)  │
    │  ├─ ScheduleInputs   │ ← 週次入力データ
    │  ├─ SystemConfig     │ ← システム設定
    │  ├─ ChirolData       │ ← キャラクター一言＆画像
    │  ├─ FamilyPosts      │ ← つぶやき・ダイ日記
    │  └─ WannadeRanking   │ ← わんなでランキング
    └──────────────────────┘
```

### AWS構成要素

| サービス | 用途 | 備考 |
|---------|------|------|
| **Lambda** | 10個のハンドラー関数 | メモリ256MB、タイムアウト30秒 |
| **API Gateway** | REST APIエンドポイント | prod stage、CORS有効 |
| **DynamoDB** | データ永続化（5テーブル） | TTL有効化、PAY_PER_REQUEST |
| **EventBridge** | 定期実行 | 金曜10:00 JST リマインド |
| **S3** | 静的ファイル配信 + 画像保存 | family-schedule-web-kame-982312822872 |
| **Secrets Manager** | LINE認証情報管理 | line/credentials-kame |
| **SQS** | Dead Letter Queue | エラー時のみ使用 |

## 主な機能

### 1. ホーム画面

- わんこ画像表示（表情タグ: normal/happy/thinking/sad）
- 吹き出しで一言表示
- 各機能への遷移メニュー（スケジュール、つぶやき、占い、わんなで、チロル情報）

### 2. 週次スケジュール入力

- 1日5枠（終日、9時、17時、21時、24時）× 7日 = 35枠
- チェックボックスで簡単選択
- 日付ごとに備考を追加可能
- いつでも上書き可能
- 今週・来週・カレンダー表示の3ビュー

### 3. つぶやき（家族投稿）

- テキスト＋画像の投稿
- リアクション（いいね）機能
- コメント機能
- 投稿の編集・削除
- 30日間のTTLで自動削除

### 4. ダイ日記

- だいず専用の日記投稿
- 投稿タイプ: POST / DIARY

### 5. WANsta（わんなで）

- 犬なでなでタップゲーム
- トップ3ランキング表示
- ユーザー別スコア管理

### 6. キャラクター機能（チロル＆だいず）

- **一言（ひとこと）**: キャラクター台詞を登録・削除・ランダム表示
- **画像管理**: 表情タグ付き画像をS3にアップロード・管理
- **Presigned URL**: ブラウザから直接S3へアップロード

### 7. 自動リマインド

- 毎週金曜10:00 JSTに翌週の予定入力リマインドをLINE通知

### 8. ダッシュボード

- 管理用のWebページ（dashboard.html）
- スケジュール表示・キャラクター管理

## デプロイ

### GitHub Actions（自動デプロイ）

`main` ブランチへのpushで自動デプロイが実行されます。

**必要なGitHub Secrets**:
- `AWS_ACCESS_KEY_ID` - デプロイ用IAMユーザーのアクセスキー
- `AWS_SECRET_ACCESS_KEY` - デプロイ用IAMユーザーのシークレットキー

**処理内容**:
1. Node.js 20.x + esbuildでビルド
2. 10個のLambda関数を個別にZIP化してデプロイ
3. Web静的ファイルをS3に同期（キャッシュ制御付き）
   - HTML: 5分キャッシュ
   - 画像: 1年キャッシュ（immutable）
   - その他: 1日キャッシュ

### 手動デプロイ

```bash
# ビルド
npm install
npm run build

# Lambda更新（例）
aws lambda update-function-code --function-name <function-name> --zip-file fileb://function.zip --profile c3test

# Web静的ファイルのデプロイ
aws s3 sync web/ s3://family-schedule-web-kame-982312822872/ --profile c3test
```

**Lambda関数名一覧**:

| 関数名 | 用途 |
|--------|------|
| family-schedule-webhook-kame | LINE Webhook受信 |
| family-schedule-get-kame | スケジュール個人取得 |
| family-schedule-submit-kame | スケジュール入力保存 |
| family-schedule-week-get-kame | 週別全員スケジュール取得 |
| family-schedule-weekly-reminder-kame | 金曜リマインド |
| chirol-hitokoto-kame | キャラクター一言管理 |
| chirol-image-kame | キャラクター画像管理 |
| post-get-kame | 投稿取得 |
| post-save-kame | 投稿保存・更新・削除 |
| wannade-save-kame | わんなでランキング |

## API仕様

### スケジュール系

| メソッド | パス | 説明 |
|---------|------|------|
| POST | /webhook | LINE Webhook受信。署名検証、groupId自動保存 |
| POST | /schedule/submit | スケジュール入力保存。変更検出付きLINE通知 |
| GET | /schedule/{weekId} | 個人の週次スケジュール取得 |
| GET | /schedule/week/{weekId} | 週別の全ユーザースケジュール取得 |

### キャラクター系

| メソッド | パス | 説明 |
|---------|------|------|
| GET/POST/DELETE | /chirol/hitokoto | 一言の取得・登録・削除 |
| GET/POST/DELETE | /chirol/images | 画像の取得・登録・削除（S3連携） |
| GET | /chirol/upload-url | S3 Presigned URL取得 |

### 投稿系

| メソッド | パス | 説明 |
|---------|------|------|
| GET | /posts | 投稿一覧取得（タイプ別: POST/DIARY） |
| POST | /posts | 新規投稿作成 |
| PUT | /posts/{postId} | 投稿更新 |
| DELETE | /posts/{postId} | 投稿削除 |
| POST | /posts/{postId}/reaction | リアクション（いいね）トグル |
| POST | /posts/{postId}/comment | コメント追加 |

### わんなで系

| メソッド | パス | 説明 |
|---------|------|------|
| GET | /wannade | ランキング取得 |
| POST | /wannade | スコア保存 |

## データベース設計

### ScheduleInputs-kame（週次入力）

```
PK: weekId (例: "2025-12-29")  # 月曜日の日付
SK: userId
displayName: LINEプロフィール名
slots: { "2025-12-29:allday": true, "2025-12-29:09": false, ... }
notes: { "2025-12-29": "備考テキスト", ... }
submittedAt: ISO8601
isLocked: false
ttl: 12週間後のUNIXタイムスタンプ
```

### SystemConfig-kame（システム設定）

```
PK: "CONFIG"
SK: "MAIN"
groupId: LINEグループID
adminUserId: 管理者ユーザーID
timezone: "Asia/Tokyo"
```

### ChirolData-kame（キャラクター一言＆画像）

```
# 一言
PK: "CHIROL"
SK: "HITOKOTO#<timestamp>"
text: 一言テキスト
createdAt: ISO8601

# 画像
PK: "CHIROL"
SK: "IMAGE#<timestamp>"
url: S3 URL
tag: normal/happy/thinking/sad
createdAt: ISO8601
```

### FamilyPosts-kame（つぶやき・ダイ日記）

```
PK: postType ("POST" | "DIARY")
SK: "<timestamp>#<postId>"
text: 投稿テキスト
imageUrl: 画像URL（オプション）
userId: 投稿者ID
displayName: 投稿者名
reactions: { like: [userId, ...] }
comments: [{ userId, displayName, text, createdAt }]
createdAt: ISO8601
ttl: 30日後のUNIXタイムスタンプ
```

### WannadeRanking-kame（わんなでランキング）

```
PK: "RANKING"
SK: userId
displayName: ユーザー名
score: スコア
updatedAt: ISO8601
```

## プロジェクト構造

```
schedule.app-1/
├── src/
│   ├── handlers/              # Lambda関数ハンドラー（10ファイル）
│   │   ├── webhook.ts         # LINE Webhook受信・コマンド処理
│   │   ├── schedule-get.ts    # 個人スケジュール取得
│   │   ├── schedule-submit.ts # スケジュール入力保存
│   │   ├── schedule-week-get.ts # 週別全員スケジュール取得
│   │   ├── weekly-reminder.ts # 金曜10:00 リマインド送信
│   │   ├── chirol-hitokoto.ts # キャラクター一言管理
│   │   ├── chirol-image.ts    # キャラクター画像管理
│   │   ├── post-get.ts        # 投稿取得
│   │   ├── post-save.ts       # 投稿CRUD・リアクション・コメント
│   │   └── wannade-save.ts    # わんなでランキング
│   ├── utils/                 # 共通ユーティリティ
│   │   ├── constants.ts       # 定数・URL生成
│   │   ├── dynamodb.ts        # DynamoDB操作ラッパー
│   │   ├── handler.ts         # エラーハンドリングミドルウェア
│   │   ├── line.ts            # LINE API（pushMessage）
│   │   ├── secrets.ts         # Secrets Manager（キャッシュ付き）
│   │   ├── signature.ts       # LINE署名検証（HMAC-SHA256）
│   │   └── weekId.ts          # 週ID生成・JST日付ユーティリティ
│   └── types/
│       └── index.ts           # TypeScript型定義
├── web/
│   ├── home.html              # メインLIFFアプリ（5タブ）
│   ├── dashboard.html         # 管理ダッシュボード
│   ├── manifest.json          # PWAマニフェスト
│   ├── sw.js                  # Service Worker
│   ├── scripts/               # フロントエンドJS
│   │   ├── core/              # コア機能（config, state, utils, account）
│   │   ├── tabs/              # タブ別ロジック
│   │   ├── ui/                # UI部品（sidebar, modals）
│   │   ├── home.page.js       # ホームページ制御
│   │   ├── dashboard.page.js  # ダッシュボード制御
│   │   └── routes.js          # ルーティング
│   ├── styles/                # CSS
│   │   ├── base.css           # ベーススタイル
│   │   ├── crop.css           # 画像クロップ用
│   │   └── tabs/              # タブ別スタイル
│   └── images/dog/            # わんこ画像
│       ├── chirol/            # チロル画像（WebP）
│       │   ├── happy/         # 嬉しい表情
│       │   ├── normal/        # 通常表情
│       │   ├── sad/           # 悲しい表情
│       │   └── thinking/      # 考え中表情
│       └── daizu/             # だいず画像（JPG）
│           ├── happy/         # 嬉しい表情
│           ├── normal/        # 通常表情
│           ├── sad/           # 悲しい表情
│           └── thinking/      # 考え中表情
├── scripts/
│   ├── create-phase2-tables.ts # Phase 2用DynamoDBテーブル作成
│   └── s3-cors.json           # S3 CORS設定
├── .github/
│   └── workflows/
│       └── deploy.yml         # GitHub Actions自動デプロイ
├── esbuild.config.js          # esbuildビルド設定
├── template.yaml              # AWS SAM定義（参考用）
├── tsconfig.json              # TypeScript設定
├── package.json               # 依存関係・スクリプト
└── .gitignore
```

## 注意事項

- **`-kame` サフィックス**: 意図的なマルチインスタンス設計。変更しない
- **`web/` 内の `API_BASE_URL`**: ハードコード。現状単一環境のため変更不要
- **`template.yaml`**: 参考用。実際のデプロイはGitHub Actions経由で直接Lambda更新

## 変更履歴

### 2026年2月 - Phase 2（だいず対応 + 新機能追加）

- **だいずキャラクター追加**: だいず画像・一言の管理機能
- **つぶやき機能**: 家族間の投稿・リアクション・コメント
- **ダイ日記**: だいず専用日記機能
- **WANsta（わんなで）**: タップゲーム＆ランキング
- **占い機能**: 日替わり占い
- **PWA対応**: manifest.json、Service Worker追加
- **GitHub Actions**: 自動デプロイパイプライン構築
- **フロントエンド刷新**: JS/CSSをモジュール分割、5タブ構成に再設計
- **不要機能削除**: チロル記録（体調/食事/トイレ）、投薬管理、ポイント集計、週次確定/通知を削除

### 2026年1月 - Phase 1

- 家族スケジュール管理LINEボット
- LIFF画面での予定入力
- ダッシュボード
- チロルキャラクター機能
- 自動確定処理・ポイント集計

### 2025年12月 - 初期リリース

- 基本的なスケジュール管理機能

---

**開発開始**: 2025年12月
**最終更新**: 2026年2月
