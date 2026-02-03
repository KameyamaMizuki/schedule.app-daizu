# 家族スケジュール管理 + チロル記録 LINEボット

家族3人の週次スケジュール管理と、愛犬チロルの健康記録・投薬管理を、LINEボット＋LIFF画面で実現するシステムです。

## 目次

- [システム概要](#システム概要)
- [タイミングシステム](#タイミングシステム)
- [アーキテクチャ](#アーキテクチャ)
- [主な機能](#主な機能)
- [デプロイ手順](#デプロイ手順)
- [API仕様](#api仕様)
- [データベース設計](#データベース設計)
- [プロジェクト構造](#プロジェクト構造)
- [メンテナンススクリプト](#メンテナンススクリプト)
- [トラブルシューティング](#トラブルシューティング)
- [コスト最適化](#コスト最適化)
- [変更履歴](#変更履歴)

## システム概要

### 主な特徴

- **週次スケジュール管理**: 月曜～日曜の1週間単位で管理
- **LINE連携**: LINEボットとLIFF画面で簡単入力
- **自動ポイント集計**: 平日・土日加算を自動計算
- **確定表の自動投稿**: 毎週月曜0:00に自動確定、6:00にLINE通知
- **2週間並行運用**: 確定週と入力週を同時管理
- **チロル記録**: 犬の体調・食事・トイレを日次記録、AIによる獣医向けサマリー生成
- **投薬管理**: 朝/昼/夜/寝る前の4時間帯で投薬スケジュール管理
- **チロル一言＆画像**: チロルキャラクターの一言登録・画像管理機能

### ポイント計算ルール

- **終日**: 4P（土日は6P）
- **時間枠**（9/17/21/24時）: 各1P（土日は1.5P）
- **表示形式**: 「合計P（平日P + 土日加算P）」

## タイミングシステム

### 週次スケジュール

```
┌─────────────────────────────────────────────────────┐
│          毎週の流れ（例：1/6～1/12 の週）            │
└─────────────────────────────────────────────────────┘

前週金曜 1/3（金）10:00
├─ 📨 翌週の予定入力リマインド送信
└─ 「来週の予定入力をお忘れなく！」

当週月曜 1/13（月）0:00
├─ ✅ 前週（1/6～1/12）の確定処理
├─ 📊 ポイント集計
├─ ⚠️ 担当者不在の日があれば警告
└─ 💾 データベースに保存

当週月曜 1/13（月）6:00
├─ 📨 確定メッセージ送信（LINE通知）
├─ 確定スケジュール
├─ 担当者不在の日の警告
├─ 週次ポイント
└─ ダッシュボードリンク
```

### 2週間並行運用

システムは常に2つの週を同時に管理：

```
┌──────────────┐  ┌──────────────┐
│  確定済み週  │  │   入力週     │
│  (表示用)    │  │  (集計中)    │
└──────────────┘  └──────────────┘
    ↓ 閲覧          ↓ 編集可能
┌──────────────┐  ┌──────────────┐
│ ダッシュボード│  │  LIFF画面    │
│  今週の予定  │  │  予定入力    │
└──────────────┘  └──────────────┘
```

### 状態遷移

**重要**: 締切機能は廃止されました。いつでも入力・修正が可能です。

```
集計中（入力期間）
  ↓ 月曜0:00
確定（表示期間）
  ↓ 月曜6:00
LINE通知送信
```

各週は2つの状態のみ：
- **集計中**: 予定入力タブで表示、いつでも編集可能
- **確定**: 今週の予定タブに移動、ダッシュボードで閲覧可能（編集も可能）

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
    │         ID: aqmin18fa2 / prod stage      │
    └────┬────────────────────────────────┬────┘
         │                                │
    ┌────▼─────────────────┐    ┌────────▼───────┐
    │  Lambda Functions    │    │   S3 Bucket    │
    │  (16関数)            │    │  ┌──────────┐  │
    │                      │    │  │dashboard │  │
    │  スケジュール系       │    │  │  .html   │  │
    │  ├─ webhook          │    │  ├──────────┤  │
    │  ├─ schedule-get     │    │  │  home    │  │
    │  ├─ schedule-submit  │    │  │  .html   │  │
    │  ├─ schedule-week-get│    │  ├──────────┤  │
    │  ├─ history-get      │    │  │ images/  │  │
    │  ├─ weekly-reminder  │    │  │  dog/    │  │
    │  ├─ weekly-finalize  │    │  └──────────┘  │
    │  └─ weekly-notify    │    └────────────────┘
    │                      │
    │  チロル記録系         │    ┌────────────────┐
    │  ├─ record-save      │    │  Amazon Bedrock │
    │  ├─ record-get       │    │  Claude 3 Haiku │
    │  ├─ record-delete    │    │  (AI要約生成)   │
    │  └─ record-summary ──┼───▶│                │
    │                      │    └────────────────┘
    │  投薬管理系           │
    │  ├─ medication-get   │
    │  └─ medication-save  │
    │                      │
    │  チロルキャラ系       │
    │  ├─ chirol-hitokoto  │
    │  ├─ chirol-image     │
    │  └─ line-richmenu    │
    └──────────┬───────────┘
               │
    ┌──────────▼───────────┐
    │  DynamoDB (7テーブル) │
    │  ├─ ScheduleInputs   │ ← 週次入力データ
    │  ├─ WeeklyFinalized  │ ← 確定スケジュール
    │  ├─ UserPoints       │ ← 累計ポイント
    │  ├─ SystemConfig     │ ← システム設定
    │  ├─ DogRecords       │ ← 犬の健康記録
    │  ├─ MedicationSchedule│← 投薬スケジュール
    │  └─ ChirolData       │ ← チロル一言＆画像
    └──────────────────────┘
```

### AWS構成要素

| サービス | 用途 | 備考 |
|---------|------|------|
| **Lambda** | 16個のハンドラー関数 | メモリ256MB（chirol-imageのみ1024MB）、タイムアウト30秒（finalize/summaryは60秒） |
| **API Gateway** | REST APIエンドポイント | prod stage、CORS有効 |
| **DynamoDB** | データ永続化（7テーブル） | TTL有効化（12週間）、PAY_PER_REQUEST |
| **EventBridge Scheduler** | 定期実行（週3回） | 金10:00、月0:00、月6:00 |
| **S3** | 静的ファイル配信 + チロル画像保存 | family-schedule-web-kame-982312822872 |
| **Secrets Manager** | LINE認証情報管理 | line/credentials-kame |
| **SQS** | Dead Letter Queue | エラー時のみ使用 |
| **Bedrock** | AI要約生成（Claude 3 Haiku） | 犬の記録サマリー用 |

### デプロイ方式

**重要**: `sam deploy` はCloudFormation ResourceExistenceCheckエラーで失敗するため使用不可。直接Lambda更新方式を使用。

- IAMロール: `dog-record-lambda-role-kame`（全Lambda共通）
- AWS Profile: `c3test`（SSO認証）
- Lambdaハンドラーパス: `handlers/xxx.handler`（dist/プレフィックスなし。zipがdist/*を展開するため）

## 主な機能

### 1. 週次スケジュール入力

**LIFF画面で簡単入力**:
- 1日5枠（終日、9時、17時、21時、24時）× 7日 = 35枠
- チェックボックスで簡単選択
- 日付ごとに備考を追加可能
- **いつでも上書き可能**（締切機能廃止）

### 2. 自動確定処理（月曜0:00）＋LINE通知（月曜6:00）

**確定処理の流れ**:
```
1. 前週データを取得
   ↓
2. ポイントを自動計算
   ├─ 平日ポイント
   ├─ 土日加算ポイント
   └─ 合計ポイント
   ↓
3. 確定表テキストを生成
   ├─ 各日付の時間枠と参加者
   ├─ ⚠️ 担当者不在の日を検出・警告
   └─ 週次ポイント内訳
   ↓
4. データベースに保存
   ↓
5. 累計ポイントを更新
   ↓
6. LINE通知送信（月曜6:00）
   ├─ 確定スケジュール
   ├─ 担当者不在の日の警告
   ├─ 週次ポイント
   └─ ダッシュボードリンク
```

### 3. ダッシュボード（5タブ構成）

| タブ | 機能 |
|-----|------|
| **今週の予定** | 確定済みスケジュールを週別に表示。担当者不在の日を警告表示。編集ボタンで確定後も修正可能 |
| **集計表示** | 週別の詳細集計表。日付×時間枠のマトリックス表示 |
| **予定入力** | 各メンバーの入力状況を確認。LIFFリンクで簡単入力 |
| **累計** | メンバー別の累計ポイント表示。平日・土日加算の内訳を円グラフで可視化 |
| **チロル** | チロルの一言登録・画像管理。DB保存・表示機能 |

### 4. 犬の健康記録（チロル記録）

- **日次記録**: 体調（元気/普通/不調）、食事（完食/少食/食べない）、トイレ（正常/軟便/下痢/血便）
- **時間付き記録**: 各記録に時刻を記録
- **AIサマリー**: Amazon Bedrock（Claude 3 Haiku）で獣医向けの要約を自動生成
- **履歴閲覧**: 日付範囲指定で過去の記録を検索・閲覧
- **記録削除**: 個別記録の削除に対応

### 5. 投薬スケジュール管理

- **4時間帯**: 朝/昼/夜/寝る前
- **デフォルト10薬**: 初期設定済みの投薬リスト
- **カスタマイズ可能**: 薬の追加・削除・時間帯変更

### 6. チロルキャラクター機能

- **一言（ひとこと）**: チロルのキャラクター台詞を登録・削除・ランダム表示
- **画像管理**: 表情タグ付き画像（normal/happy/thinking/sad）をS3にアップロード・管理
- **画像最適化**: sharpによるリサイズ・WebP変換

### 7. 担当者不在日の警告機能

- 全時間枠で誰も担当していない日を自動検出
- 確定処理時にLINEメッセージで警告
- ダッシュボードの「今週の予定」タブでも黄色い警告ボックスで表示

## デプロイ手順

### 前提条件

- AWS CLI インストール済み
- Node.js 20.x以上
- AWS SSO認証済み（`aws sso login --profile c3test`）
- LINE公式アカウント（Messaging API有効化済み）

### 1. ビルド

```bash
# 依存関係インストール
npm install

# SAMビルド
sam build
```

### 2. zip作成（PowerShell）

```powershell
cd .aws-sam\build\WebhookFunction
Compress-Archive -Path 'handlers\*','utils\*','types\*','node_modules\*','types.js','types.js.map' -DestinationPath ..\..\..\function.zip -Force
```

### 3. Sharp Linuxバイナリ対応（chirol-image用）

Windows環境でビルドするとWindows用sharpバイナリのみ含まれるため、Lambda実行用にLinuxバイナリを手動追加：

```bash
npm install --os=linux --cpu=x64 sharp
# @img/sharp-linux-x64 と @img/sharp-libvips-linux-x64 を
# .aws-sam/build/WebhookFunction/node_modules/@img/ にコピー
```

### 4. Lambda更新（全16関数）

```bash
aws lambda update-function-code --function-name <function-name> --zip-file fileb://function.zip --profile c3test
```

**Lambda関数名一覧**:
| 関数名 | 用途 |
|--------|------|
| line-webhook-kame | LINE Webhook受信 |
| schedule-get-kame | スケジュール個人取得 |
| schedule-submit-kame | スケジュール入力保存 |
| schedule-week-get-kame | 週別全員スケジュール取得 |
| weekly-reminder-kame | 金曜リマインド |
| weekly-finalize-kame | 月曜確定処理 |
| weekly-notify-kame | 月曜LINE通知 |
| history-get-kame | 履歴・累計ポイント取得 |
| record-save-kame | 犬の記録保存 |
| record-get-kame | 犬の記録取得 |
| record-delete-kame | 犬の記録削除 |
| record-summary-kame | AI要約生成 |
| medication-get-kame | 投薬スケジュール取得 |
| medication-save-kame | 投薬スケジュール保存 |
| chirol-hitokoto-kame | チロル一言管理 |
| chirol-image-kame | チロル画像管理 |
| line-richmenu-setup-kame | LINEリッチメニュー設定 |

### 5. Web静的ファイルのデプロイ

```bash
aws s3 sync web/ s3://family-schedule-web-kame-982312822872/ --profile c3test
```

## API仕様

### スケジュール系

| メソッド | パス | 説明 |
|---------|------|------|
| POST | /webhook | LINE Webhook受信。署名検証、groupId自動保存、コマンド処理 |
| POST | /schedule/submit | LIFF入力保存。変更検出付きLINE通知 |
| GET | /schedule/{weekId} | 個人の週次スケジュール取得 |
| GET | /schedule/week/{weekId} | 週別の全ユーザースケジュール取得（ダッシュボード用） |
| GET | /history | 確定済み週別データ・累計ポイント取得 |

### チロル記録系

| メソッド | パス | 説明 |
|---------|------|------|
| POST | /records | 犬の健康記録保存（体調/食事/トイレ） |
| GET | /records/{date} | 特定日の記録取得 |
| GET | /records?start={date}&end={date} | 日付範囲指定で記録取得 |
| DELETE | /records/{date}/{recordId} | 個別記録削除 |
| POST | /records/summary | Bedrock Claude 3 Haikuで獣医向けAI要約生成 |

### 投薬管理系

| メソッド | パス | 説明 |
|---------|------|------|
| GET | /medications | 投薬スケジュール一覧取得（デフォルト10薬、4時間帯） |
| PUT | /medications | 投薬スケジュール更新 |

### チロルキャラクター系

| メソッド | パス | 説明 |
|---------|------|------|
| GET/POST/DELETE | /chirol/hitokoto | チロル一言の取得・登録・削除 |
| GET/POST/DELETE | /chirol/images | チロル画像の取得・アップロード・削除（S3連携） |

## データベース設計

### ScheduleInputs-kame（週次入力）

```
PK: weekId (例: "2025-12-29")  # 月曜日の日付
SK: userId
displayName: LINEプロフィール名
slots: { "2025-12-29:allday": true, "2025-12-29:09": false, ... }
notes: { "2025-12-29": "備考テキスト", ... }
submittedAt: ISO8601
isLocked: false (常にfalse、締切機能廃止)
ttl: 12週間後のUNIXタイムスタンプ
```

### WeeklyFinalized-kame（週次確定表）

```
PK: weekId
SK: "FINALIZED"
finalizedAt: ISO8601
scheduleText: 確定表テキスト
pointsBreakdown: {
  userId: {
    displayName: "名前",
    weekdayPoints: 5,
    weekendBonusPoints: 4,
    totalPoints: 9
  }
}
version: 修正回数
ttl: 12週間後のUNIXタイムスタンプ
```

### UserPoints-kame（累計ポイント）

```
PK: userId
SK: "TOTAL"
displayName: 最新名前
totalPoints: 累計合計
weekdayPoints: 累計平日P
weekendBonusPoints: 累計土日加算P
lastUpdatedWeek: 最終更新weekId
updatedAt: ISO8601
```

### SystemConfig-kame（システム設定）

```
PK: "CONFIG"
SK: "MAIN"
groupId: LINEグループID
timezone: "Asia/Tokyo"
```

### DogRecords-kame（犬の健康記録）

```
PK: date (例: "2026-01-15")
SK: recordId (タイムスタンプベース)
time: 時刻
condition: 体調（元気/普通/不調）
meal: 食事（完食/少食/食べない）
toilet: トイレ（正常/軟便/下痢/血便）
note: 備考
ttl: UNIXタイムスタンプ
```

### MedicationSchedule-kame（投薬スケジュール）

```
PK: "MEDICATION"
SK: "SCHEDULE"
medications: [{ name, morning, noon, evening, bedtime }]
updatedAt: ISO8601
```

### ChirolData-kame（チロル一言＆画像）

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

## プロジェクト構造

```
schedule.app-1/
├── src/
│   ├── handlers/              # Lambda関数ハンドラー（17ファイル）
│   │   ├── webhook.ts         # LINE Webhook受信・コマンド処理
│   │   ├── schedule-get.ts    # 個人スケジュール取得
│   │   ├── schedule-submit.ts # スケジュール入力保存
│   │   ├── schedule-week-get.ts # 週別全員スケジュール取得
│   │   ├── history-get.ts     # 履歴・累計ポイント取得
│   │   ├── weekly-reminder.ts # 金曜10:00 リマインド送信
│   │   ├── weekly-finalize.ts # 月曜0:00 確定処理
│   │   ├── weekly-notify.ts   # 月曜6:00 LINE通知送信
│   │   ├── record-save.ts     # 犬の記録保存
│   │   ├── record-get.ts      # 犬の記録取得
│   │   ├── record-delete.ts   # 犬の記録削除
│   │   ├── record-summary.ts  # AI要約生成（Bedrock）
│   │   ├── medication-get.ts  # 投薬スケジュール取得
│   │   ├── medication-save.ts # 投薬スケジュール保存
│   │   ├── chirol-hitokoto.ts # チロル一言管理
│   │   └── chirol-image.ts    # チロル画像管理（sharp使用）
│   ├── utils/                 # 共通ユーティリティ
│   │   ├── constants.ts       # 定数・URL生成
│   │   ├── dynamodb.ts        # DynamoDB操作ラッパー
│   │   ├── line.ts            # LINE API（pushMessage）
│   │   ├── points.ts          # ポイント計算ロジック
│   │   ├── scheduleText.ts    # 確定表テキスト生成
│   │   ├── secrets.ts         # Secrets Manager（キャッシュ付き）
│   │   ├── signature.ts       # LINE署名検証（HMAC-SHA256）
│   │   └── weekId.ts          # 週ID生成・JST日付ユーティリティ
│   └── types/
│       └── index.ts           # TypeScript型定義
├── web/
│   ├── dashboard.html         # 管理ダッシュボード（5タブ）
│   ├── home.html              # ホームページ
│   └── images/dog/            # チロル画像（WebP、4表情カテゴリ）
│       ├── happy/             # 嬉しい表情（5枚）
│       ├── normal/            # 通常表情（8枚）
│       ├── sad/               # 悲しい表情（2枚）
│       └── thinking/          # 考え中表情（4枚）
├── scripts/                   # メンテナンス用スクリプト（削除しない）
│   ├── check-cumulative.ts    # 累計ポイント検証
│   ├── create-chirol-table.ts # ChirolDataテーブル作成
│   ├── delete-dummy-weeks.ts  # テストデータ削除
│   ├── finalize-missing-weeks.ts # 未確定週の一括確定
│   ├── finalize-week.ts       # 手動週確定
│   ├── optimize-images.js     # 画像WebP変換・最適化
│   ├── recalculate-points.ts  # ポイント再計算
│   └── update-user-totals.ts  # 累計ポイント再集計
├── assets/
│   └── dog-originals/         # チロル元画像（JPG/PNG、28枚）
├── template.yaml              # AWS SAM定義（参考用。sam deployは使用不可）
├── tsconfig.json              # TypeScript設定（ES2020、CommonJS、strict）
├── package.json               # 依存関係・スクリプト
├── .gitignore
└── .cfignore
```

## メンテナンススクリプト

`scripts/` ディレクトリにはメンテナンス用のスクリプトがあります。**削除しないでください。**

| スクリプト | 用途 |
|-----------|------|
| check-cumulative.ts | 全確定週をスキャンし累計ポイントを検証 |
| create-chirol-table.ts | ChirolData-kameテーブルを作成 |
| delete-dummy-weeks.ts | テスト用ダミーデータを削除 |
| finalize-missing-weeks.ts | 入力データがあるが未確定の週を一括確定 |
| finalize-week.ts | 指定weekIdの手動確定（引数にweekIdを指定） |
| optimize-images.js | 犬画像をWebP形式に一括変換（300x300px, 80%品質） |
| recalculate-points.ts | 全確定週のポイントを再計算 |
| update-user-totals.ts | UserPointsテーブルの累計を全再集計 |

## トラブルシューティング

### Q: AWSコマンドが認証エラーになる
A: SSOセッションの期限切れ。`aws sso login --profile c3test` で再認証。

### Q: グループにメッセージが届かない
A: SystemConfigテーブルにgroupIdが保存されているか確認。グループで何かメッセージを送信してgroupId自動保存を実行。

### Q: ダッシュボードが表示されない
A: S3バケットポリシーで公開設定されているか確認。dashboard.htmlのAPI_BASE_URLが正しいか確認。

### Q: ポイント計算が合わない
A: `src/utils/points.ts` の `calculatePoints` 関数を確認。土日判定が正しく動作しているか確認。`scripts/recalculate-points.ts` で再計算も可能。

### Q: 担当者不在の警告が表示されない
A: `weekly-finalize.ts` の `buildFinalizedSchedule` 関数が正しくデプロイされているか確認。dashboard.htmlも最新版がS3にアップロードされているか確認。

### Q: 曜日表示がずれている
A: JST timezone (`T00:00:00+09:00`) が正しく使用されているか確認。`new Date(dateStr)` ではなく `new Date(dateStr + 'T00:00:00+09:00')` を使用。

### Q: chirol-imageでsharpエラーが出る
A: Lambda実行環境はLinuxのため、Windows環境でビルドした場合はLinux用sharpバイナリを手動で追加する必要がある。デプロイ手順のステップ3を参照。

### Q: sam deployが失敗する
A: CloudFormation ResourceExistenceCheckエラーが発生するため、`sam deploy` は使用不可。直接Lambda更新方式（デプロイ手順のステップ4）を使用。

## コスト最適化

### 実施済みの最適化

#### Lambda関数の最適化

| 項目 | 最適化前 | 最適化後 | 削減率 |
|-----|---------|---------|--------|
| パッケージサイズ | 38MB | 20MB | 47%削減 |
| メモリサイズ | 512MB | 256MB | 50%削減 |

- ソースマップ (.js.map) を除外
- TypeScript型定義 (.d.ts) を除外
- 不要な開発用依存関係を除外
- API関数のメモリを256MBに削減（chirol-imageのみ1024MB）

#### DynamoDB最適化

- **TTL有効化**: 12週間後に自動削除
- **PAY_PER_REQUEST**: 使用量に応じた課金

#### 実行頻度の最適化

- **EventBridge**: 週3回のみ実行（金曜・月曜×2）
- **Lambda**: イベント駆動型で必要時のみ実行

### 月間コスト見積もり（概算）

| サービス | 見積もり |
|---------|---------|
| Lambda | 無料枠内 |
| DynamoDB | $1以下 |
| API Gateway | $1以下 |
| S3 | $0.5以下 |
| EventBridge | 無料枠内 |
| Bedrock | 使用量に応じて変動 |
| **合計** | **月額 $3～5程度** |

## 注意事項

- **CORS設定は触らない**: 各ハンドラーにローカル定義で維持。12ファイルで設定が微妙に異なりリスク大
- **`-kame` サフィックス**: 意図的なマルチインスタンス設計。変更しない
- **`web/` 内の `API_BASE_URL`**: ハードコード。現状単一環境のため変更不要
- **`template.yaml`**: 参考用。実際のデプロイは直接Lambda更新方式

## 変更履歴

### 2026年1月 - Phase 1 クリーンアップ（コミット d2e6d56）

- 不要ファイル削除: `deploy/`, `api/`, `iam/`, `nul` を削除
- 未使用コード削除: `weekly-finalize.ts` の `getPreviousWeekId` インポート削除、`constants.ts` の `getInputUrl()` 関数削除
- `.cfignore` 最適化
- **バグ修正**:
  - `weekly-notify.ts`: `getPreviousWeekId()` → `getCurrentWeekId()` に修正（確定処理と同じweekIdを使う）
  - `dashboard.html`: スケジュール編集ボタン（×/◯トグル）が効かない → `loadSelectedWeek(skipFetch)` パラメータ追加
  - `dashboard.html`: チロル一言がDB保存後に表示されない → `loadHitokotoFromDB()` 追加
  - `dashboard.html`: チロル画像がアップロード後に反映されない → `loadChirolImagesFromDB()` 追加
  - `dashboard.html`: チロル保存時に3秒最低待機アニメーション追加
  - Lambdaハンドラーパス: `dist/handlers/xxx.handler` → `handlers/xxx.handler` に修正
  - chirol IAM権限: ChirolData-kameテーブルとS3へのアクセス権追加
  - API Gateway: `/chirol/hitokoto` と `/chirol/images` エンドポイント新規作成
  - Sharp Linuxバイナリ: Windows環境ビルドにLinux用sharpバイナリを手動追加

### 2026年1月5日 - コードリファクタリング & AWS最適化

- 冗長ディレクトリ・ファイルを削減（約650MB削減）
- 共通処理をユーティリティ化（`pushMessage`、S3 URL生成）
- `.gitignore` の改善
- EventBridge Schedulerの時刻設定を修正
- 全Lambda関数のメモリサイズを256MBに最適化

### 2025年12月31日 - メジャーアップデート

- 締切機能の廃止（いつでも入力・修正が可能に）
- タイミングシステムの再設計（金曜リマインド、月曜確定・通知）
- 担当者不在日の警告機能追加
- 曜日表示の修正（JST timezone統一）
- 集計中週の分離

### 2025年12月 - 初期リリース

- 家族スケジュール管理LINEボット
- LIFF画面での予定入力
- ダッシュボード（4タブ）
- 自動確定処理・ポイント集計

---

**開発開始**: 2025年12月
**最終更新**: 2026年2月
