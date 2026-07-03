# Family Schedule LINE Bot — Claude Code コンテキスト

このファイルは Claude Code が自動で読み込むプロジェクト情報です。
AWS リソース名・デプロイ方法・既知の注意点を一元管理します。

---

## AWS リソース一覧

### アカウント・リージョン
| 項目 | 値 |
|---|---|
| AWS アカウント ID | `982312822872` |
| リージョン | `ap-northeast-1`（東京） |
| SSO プロファイル | `c3test` |

### CloudFormation
| 項目 | 値 |
|---|---|
| スタック名 | `family-schedule-linebot-kame` |
| ステータス | `UPDATE_COMPLETE` |

> ⚠️ `samconfig.toml` のスタック名は参考用。`template.yaml` には DynamoDB テーブル定義がないが、スタックには `ScheduleInputs-kame` / `SystemConfig-kame` が含まれる。誤って `sam deploy` するとテーブルが削除される危険があるため **SAM deploy は使用しない**。コードのみ `aws lambda update-function-code` で更新する（GitHub Actions が自動実行）。

### API Gateway
| 項目 | 値 |
|---|---|
| REST API ID | `aqmin18fa2` |
| API 名 | `family-schedule-linebot-kame` |
| ベース URL | `https://aqmin18fa2.execute-api.ap-northeast-1.amazonaws.com/prod` |
| LINE Webhook URL | `https://aqmin18fa2.execute-api.ap-northeast-1.amazonaws.com/prod/webhook` |

### S3
| 項目 | 値 |
|---|---|
| バケット名 | `family-schedule-web-kame-982312822872` |
| ベース URL | `https://family-schedule-web-kame-982312822872.s3.ap-northeast-1.amazonaws.com` |
| ホーム | `…/home.html` |
| ダッシュボード | `…/dashboard.html` |
| チロル画像プレフィックス | `chirol-images/` |

### DynamoDB テーブル（現在使用中）
| テーブル名 | 用途 |
|---|---|
| `ScheduleInputs-kame` | 家族のスケジュール入力（TTL: 12週） |
| `SystemConfig-kame` | LINE グループ ID 等の設定 |
| `ChirolData-kame` | チロル/だいず の一言・画像メタデータ（PK: CHIROL / DAIZU） |
| `FamilyPosts-kame` | つぶやき(POST)・日記(DIARY)・様子(YOUSU) |
| `WannadeRanking-kame` | わんなでランキング TOP3（単一アイテム） |

> CloudFormation スタックにも `ScheduleInputs-kame` / `SystemConfig-kame` が含まれる（スタック管理下）。

### Lambda 関数
| 関数名 | ハンドラー | 役割 |
|---|---|---|
| `family-schedule-webhook-kame` | handlers/webhook | LINE Webhook 受信・コマンド処理 |
| `family-schedule-submit-kame` | handlers/schedule-submit | スケジュール保存 API |
| `family-schedule-get-kame` | handlers/schedule-get | 個人スケジュール取得 API（ADMIN_USER_ID 使用） |
| `family-schedule-week-get-kame` | handlers/schedule-week-get | 週全員スケジュール取得 API |
| `family-schedule-weekly-reminder-kame` | handlers/weekly-reminder | 毎週金曜 10:00 JST リマインダー（EventBridge） |
| `chirol-hitokoto-kame` | handlers/chirol-hitokoto | チロル/だいず の一言 CRUD |
| `chirol-image-kame` | handlers/chirol-image | チロル画像管理・Presigned URL |
| `post-get-kame` | handlers/post-get | 投稿一覧取得 |
| `post-save-kame` | handlers/post-save | 投稿作成・編集・削除・リアクション |
| `wannade-save-kame` | handlers/wannade-save | わんなでランキング管理 |

> IAM ロール: schedule 系 → CloudFormation 自動生成ロール / chirol・post・wannade 系 → `dog-record-lambda-role-kame`（手動管理）

### SQS
| キュー名 | 用途 |
|---|---|
| `family-schedule-dlq-kame` | weekly-reminder のデッドレターキュー（14日保持） |

URL: `https://sqs.ap-northeast-1.amazonaws.com/982312822872/family-schedule-dlq-kame`

### Secrets Manager
| シークレット名 | 内容 |
|---|---|
| `line/credentials-kame` | `CHANNEL_ID` / `CHANNEL_SECRET` / `CHANNEL_ACCESS_TOKEN_LONG` / `LIFF_URL` / `ADMIN_USER_ID` |

---

## デプロイ

### 通常デプロイ（コード変更）
```
git push origin main
```
GitHub Actions が自動で以下を実行：
1. TypeScript → JavaScript（esbuild, Node.js 22 ターゲット）
2. 各 Lambda 関数の ZIP → `update-function-code`
3. `web/` → S3 同期

### 環境変数の変更
GitHub Actions は `update-function-code` のみ実行するため、**env vars は自動更新されない**。  
変更が必要な場合は AWS コンソールまたは以下の CLI：

```powershell
# 例: family-schedule-get-kame に ADMIN_USER_ID を追加
aws lambda update-function-configuration `
  --function-name family-schedule-get-kame `
  --environment "Variables={LINE_SECRET_NAME=line/credentials-kame,TABLE_SCHEDULE_INPUTS=ScheduleInputs-kame,TABLE_SYSTEM_CONFIG=SystemConfig-kame,ADMIN_USER_ID=<LINE_USER_ID>}" `
  --profile c3test
```

### 新しい Lambda 関数を追加する場合
1. `template.yaml` にリソースを追記（ドキュメント兼記録用）
2. `esbuild.config.js` — エントリポイントは `src/handlers/` を自動スキャンするため変更不要
3. AWS コンソールまたは CLI で Lambda 関数を手動作成
4. GitHub Actions の `FUNCTIONS` 配列に追加

---

## アーキテクチャ

```
LINE App ──→ API Gateway (aqmin18fa2)
                ├── /webhook          → family-schedule-webhook-kame
                ├── /schedule/submit  → family-schedule-submit-kame
                ├── /schedule/{weekId}→ family-schedule-get-kame
                ├── /schedule/week/{weekId} → family-schedule-week-get-kame
                ├── /chirol/*         → chirol-hitokoto-kame / chirol-image-kame
                ├── /posts            → post-get-kame / post-save-kame
                └── /wannade          → wannade-save-kame

EventBridge (cron: 毎週金曜 10:00 JST) → family-schedule-weekly-reminder-kame

LIFF (LINE Frontend) → S3 (family-schedule-web-kame-982312822872)
                        ├── home.html
                        └── dashboard.html
```

---

## 既知の注意点

- **CORS**: `handler.ts` の `ALLOWED_ORIGIN` は `process.env.ALLOWED_ORIGIN` から取得（未設定時は S3 URL にフォールバック）
- **ADMIN_USER_ID**: `schedule-get` ハンドラーで使用。未設定の場合 `isAdmin` は常に false
- **chirol-images/ は S3 sync --delete の除外対象**（`deploy.yml` の `--exclude "chirol-images/*"`）
- **DynamoDB TTL**: ScheduleInputs（12週）/ FamilyPosts の POST 種別（30日）/ DIARY・YOUSU は永続
- **SAM deploy 禁止**: スタック `family-schedule-linebot-kame` に本番 DynamoDB テーブルが含まれるため、現行 template.yaml で sam deploy すると削除される危険がある
