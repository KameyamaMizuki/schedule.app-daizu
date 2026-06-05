# LINE ID連携 + アカウント管理サーバー化 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** アカウント設定をDynamoDBで家族間共有し、スマホはLIFF自動ログイン・PCはPIN認証で本人を特定する。

**Architecture:** LIFF SDK でスマホ側の LINE userId を取得して自動ログイン。PCはサーバー側でbcryptハッシュ照合するPIN認証。アカウント設定（name/avatar/birthday/pinHash）はDynamoDB `AccountSettings-kame` に保存し、アプリ起動時に全員分を一括取得してメモリに展開する。

**Tech Stack:** TypeScript + AWS Lambda + DynamoDB + bcryptjs / LIFF SDK 2.x / Vanilla JS + CSS custom properties

---

## ファイル構成

### 新規作成
- `src/handlers/account.ts` — GET/PUT /account, POST /account/auth, PUT /account/pin
- `web/scripts/core/auth.js` — LIFF初期化・認証フロー（LIFF自動 or PC PINセッション確認）
- `web/scripts/ui/pin-login.js` — PINログイン画面ロジック
- `web/styles/pin-login.css` — PINログイン画面スタイル

### 修正
- `src/types.ts` — `AccountSettings` 型を追加
- `src/utils/dynamodb.ts` — account テーブル操作を追加
- `src/utils/constants.ts` — `TABLE_ACCOUNT_SETTINGS` 定数を追加
- `web/scripts/core/config.js` — `API.ACCOUNT` パス・`STORAGE.AUTH_SESSION` キーを追加、不要な `STORAGE` キーを削除
- `web/scripts/core/account.js` — localStorage → API 呼び出しに置き換え
- `web/scripts/ui/account-edit.js` — モーダルUI刷新（切り替え削除・PIN設定・リンク共有追加）、API保存に変更
- `web/scripts/ui/user-select.js` — `initCurrentUser()` を新auth.jsに委譲
- `web/scripts/dashboard.page.js` — init()でauth.jsを呼ぶよう変更
- `web/scripts/home.page.js` — 同上
- `web/home.html` — LIFF SDK追加・PINログイン画面HTML追加
- `web/dashboard.html` — 同上
- `web/styles/base.css` — CSS custom propertiesでダークモード対応
- `.github/workflows/deploy.yml` — LIFF ID注入・account Lambda デプロイ追加

---

## Phase 0: コード掃除

### Task 1: config.jsからlocalStorage不要キーを削除し、新しいキー・APIパスを追加

**Files:**
- Modify: `web/scripts/core/config.js`

- [ ] **Step 1: config.jsを開いて現状確認**

```
STORAGE キー現状:
  CURRENT_USER_ID  → auth.jsに移管（削除）
  CUSTOM_PHOTOS    → API保存に移管（削除）
  CUSTOM_AVATARS   → API保存に移管（削除）
  CUSTOM_NAMES     → API保存に移管（削除）
  FAMILY_BIRTHDAYS → API保存に移管（削除）

追加するキー:
  AUTH_SESSION: 'authSession'  ← PC PIN認証後のセッション保存用
```

- [ ] **Step 2: STORAGE ブロックと API ブロックを更新**

`web/scripts/core/config.js` の `STORAGE` と `API` セクションを以下に置き換える:

```javascript
  /** localStorage キー */
  STORAGE: {
    AUTH_SESSION: 'authSession',  // { userId, authenticated: true }
  },

  /** API パス（${API_BASE_URL} に付加する文字列） */
  API: {
    CHIROL_IMAGES:   '/chirol/images',
    CHIROL_HITOKOTO: '/chirol/hitokoto',
    SCHEDULE_WEEK:   '/schedule/week',
    SCHEDULE_SUBMIT: '/schedule/submit',
    POSTS:           '/posts',
    CHIROL_UPLOAD_URL: '/chirol/upload-url',
    WANNADE:         '/wannade',
    ACCOUNT:         '/account',
  },
```

`DEFAULT_AVATARS` も削除する（サーバーからアバターを取得するため不要）:
```javascript
  // 削除: DEFAULT_AVATARS: { '瑞季': '👧', '才子': '👩', '桃寧': '👨' },
```

- [ ] **Step 3: ビルドが通ることを確認**

```bash
node scripts/build-web.js
```
Expected: `✓ Done` (エラーなし)

- [ ] **Step 4: コミット**

```bash
git add web/scripts/core/config.js
git commit -m "refactor: localStorage アカウントキーを削除しAPI.ACCOUNTを追加"
```

---

### Task 2: account.jsをAPI連携スタブに置き換え

**Files:**
- Modify: `web/scripts/core/account.js`

- [ ] **Step 1: 現account.jsをAPI対応版に全面書き換え**

`web/scripts/core/account.js` を以下に置き換える:

```javascript
// core/account.js — アカウント設定の取得（サーバーキャッシュ版）
// Phase 1完了後にAPI呼び出しを実装。それまではfamilyMembersのdisplayNameをフォールバックとして使用。

// 全家族メンバーのアカウント設定をキャッシュするマップ: userId → AccountSettings
var accountSettingsCache = {};

/**
 * サーバーから全家族メンバーのアカウント設定を一括取得してキャッシュ
 */
async function loadAccountSettings() {
  try {
    var res = await fetch(API_BASE_URL + AppConfig.API.ACCOUNT);
    if (!res.ok) return;
    var data = await res.json();
    (data.accounts || []).forEach(function(a) {
      accountSettingsCache[a.userId] = a;
    });
  } catch (e) {
    console.warn('アカウント設定の取得に失敗（フォールバック使用）:', e);
  }
}

/**
 * メンバーの表示名を返す（サーバー設定 > state.jsのデフォルト）
 */
function getDisplayName(member) {
  var settings = accountSettingsCache[member.userId];
  return (settings && settings.displayName) || member.displayName;
}

/**
 * userId から表示名を返す
 */
function getDisplayNameByUserId(userId) {
  var member = familyMembers.find(function(m) { return m.userId === userId; });
  if (!member) return null;
  return getDisplayName(member);
}

/**
 * メンバーのアバター写真URL（S3）を返す
 */
function getAvatarPhoto(userId) {
  var settings = accountSettingsCache[userId];
  return (settings && settings.avatarType === 'photo' && settings.avatarUrl) ? settings.avatarUrl : null;
}

/**
 * メンバーのアバター絵文字を返す
 */
function getAvatarEmoji(userId) {
  var settings = accountSettingsCache[userId];
  if (settings && settings.avatarType === 'emoji' && settings.avatarEmoji) {
    return settings.avatarEmoji;
  }
  // フォールバック
  var fallbacks = { '瑞季': '👧', '才子': '👩', '桃寧': '👨' };
  var member = familyMembers.find(function(m) { return m.userId === userId; });
  return member ? (fallbacks[member.displayName] || '👤') : '👤';
}
```

- [ ] **Step 2: account-edit.jsのgetAvatarPhoto/getAvatarEmojiの引数を確認**

現在 `getAvatarPhoto(member.displayName)` のように **displayName** を引数に取っている。新実装では **userId** を引数に取る。`account-edit.js` の呼び出し箇所を洗い出してメモしておく（Task 11で修正）。

```bash
grep -n "getAvatarPhoto\|getAvatarEmoji" web/scripts/ui/account-edit.js web/scripts/ui/user-select.js
```

- [ ] **Step 3: ビルド確認**

```bash
node scripts/build-web.js
```
Expected: `✓ Done`

- [ ] **Step 4: コミット**

```bash
git add web/scripts/core/account.js
git commit -m "refactor: account.jsをAPIキャッシュ方式にスタブ化"
```

---

### Task 3: user-select.jsの整理とauth.js委譲準備

**Files:**
- Modify: `web/scripts/ui/user-select.js`

- [ ] **Step 1: user-select.jsから不要ロジックを削除し委譲スタブに変更**

`web/scripts/ui/user-select.js` を以下に置き換える:

```javascript
// ui/user-select.js — 認証完了後のUI更新のみ担当
// 認証フロー自体は core/auth.js が管理する

/**
 * ヘッダーアバターを現在のユーザー設定で更新
 */
function updateHeaderAvatar() {
  var el = document.getElementById('headerUserAvatar');
  if (!currentUser || !el) return;
  var photo = getAvatarPhoto(currentUser.userId);
  var emoji = getAvatarEmoji(currentUser.userId);
  el.textContent = '';
  if (photo) {
    var img = document.createElement('img');
    img.className = 'header-avatar-img';
    img.onerror = function() { el.textContent = emoji; };
    el.appendChild(img);
    img.src = photo;
  } else {
    el.textContent = emoji;
  }
}

/**
 * 認証完了後に呼ばれるコールバック（auth.jsから呼ばれる）
 */
function onAuthComplete() {
  updateHeaderAvatar();
  window.yousuLoaded = false;
  window.diaryLoaded = false;
}

// 後方互換: dashboard.page.js の initCurrentUser() 呼び出しを auth.js に委譲
function initCurrentUser() {
  if (typeof initAuth === 'function') {
    initAuth();
  }
}
```

- [ ] **Step 2: ビルド確認**

```bash
node scripts/build-web.js
```
Expected: `✓ Done`

- [ ] **Step 3: コミット**

```bash
git add web/scripts/ui/user-select.js
git commit -m "refactor: user-select.jsをUI更新のみに絞りauth.jsへ委譲"
```

---

## Phase 1: バックエンド

### Task 4: bcryptjsを依存に追加

**Files:**
- Modify: `package.json`

- [ ] **Step 1: bcryptjsをインストール**

```bash
npm install bcryptjs
npm install --save-dev @types/bcryptjs
```

Expected: `added X packages`

- [ ] **Step 2: コミット**

```bash
git add package.json package-lock.json
git commit -m "deps: bcryptjsを追加（Lambda用純粋JS実装）"
```

---

### Task 5: DynamoDB AccountSettings-kame テーブルをAWSに手動作成

**Files:** なし（AWSリソース操作）

- [ ] **Step 1: テーブルを作成**

```bash
aws dynamodb create-table \
  --table-name AccountSettings-kame \
  --attribute-definitions AttributeName=userId,AttributeType=S \
  --key-schema AttributeName=userId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --profile c3test \
  --region ap-northeast-1
```

Expected: JSON レスポンスに `"TableStatus": "CREATING"`

- [ ] **Step 2: テーブルがACTIVEになるまで待機**

```bash
aws dynamodb wait table-exists \
  --table-name AccountSettings-kame \
  --profile c3test \
  --region ap-northeast-1
```

Expected: コマンドが正常終了（出力なし）

- [ ] **Step 3: 初期データを3名分投入（displayNameとデフォルト絵文字のみ、pinHashは後でPIN設定時に追加）**

```bash
aws dynamodb put-item \
  --table-name AccountSettings-kame \
  --item '{"userId":{"S":"U687f86855c46490c030499f5393c8a7e"},"displayName":{"S":"瑞季"},"avatarType":{"S":"emoji"},"avatarEmoji":{"S":"👧"},"updatedAt":{"S":"2026-06-05T00:00:00Z"}}' \
  --profile c3test --region ap-northeast-1

aws dynamodb put-item \
  --table-name AccountSettings-kame \
  --item '{"userId":{"S":"U4b13048aa2906b929c3139c4f3dfdd7c"},"displayName":{"S":"才子"},"avatarType":{"S":"emoji"},"avatarEmoji":{"S":"👩"},"updatedAt":{"S":"2026-06-05T00:00:00Z"}}' \
  --profile c3test --region ap-northeast-1

aws dynamodb put-item \
  --table-name AccountSettings-kame \
  --item '{"userId":{"S":"Ua8420309a164fffdbdd7f300f4c1cc94"},"displayName":{"S":"桃寧"},"avatarType":{"S":"emoji"},"avatarEmoji":{"S":"👨"},"updatedAt":{"S":"2026-06-05T00:00:00Z"}}' \
  --profile c3test --region ap-northeast-1
```

Expected: 各コマンドが出力なしで正常終了

---

### Task 6: types.tsにAccountSettings型を追加

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: AccountSettings型を追加**

`src/types.ts` の末尾に追加:

```typescript
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
```

- [ ] **Step 2: コミット**

```bash
git add src/types.ts
git commit -m "feat: AccountSettings型を追加"
```

---

### Task 7: constants.tsにアカウントテーブル定数を追加

**Files:**
- Modify: `src/utils/constants.ts`

- [ ] **Step 1: TABLE_ACCOUNT_SETTINGS を追加**

`src/utils/constants.ts` の `DB_KEYS` または定数セクションに追加:

```typescript
export const TABLE_ACCOUNT_SETTINGS = process.env.TABLE_ACCOUNT_SETTINGS || 'AccountSettings-kame';
```

- [ ] **Step 2: コミット**

```bash
git add src/utils/constants.ts
git commit -m "feat: TABLE_ACCOUNT_SETTINGS定数を追加"
```

---

### Task 8: dynamodb.tsにアカウント操作を追加

**Files:**
- Modify: `src/utils/dynamodb.ts`

- [ ] **Step 1: インポートとアカウント操作関数を追加**

`src/utils/dynamodb.ts` の末尾に追加:

```typescript
import { AccountSettings } from '../types';
import { TABLE_ACCOUNT_SETTINGS } from './constants';

/** 全家族メンバーのAccountSettingsを取得 */
export async function getAllAccountSettings(): Promise<AccountSettings[]> {
  const result = await docClient.send(new ScanCommand({
    TableName: TABLE_ACCOUNT_SETTINGS
  }));
  return (result.Items || []) as AccountSettings[];
}

/** 特定ユーザーのAccountSettingsを取得 */
export async function getAccountSettings(userId: string): Promise<AccountSettings | null> {
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_ACCOUNT_SETTINGS,
    Key: { userId }
  }));
  return result.Item as AccountSettings || null;
}

/** AccountSettingsを保存・更新 */
export async function saveAccountSettings(settings: AccountSettings): Promise<void> {
  await docClient.send(new PutCommand({
    TableName: TABLE_ACCOUNT_SETTINGS,
    Item: settings
  }));
}
```

- [ ] **Step 2: ScanCommandをインポートに追加**

ファイル上部のDynamoDB importに `ScanCommand` を追加:

```typescript
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand   // ← 追加
} from '@aws-sdk/lib-dynamodb';
```

- [ ] **Step 3: ビルド確認**

```bash
npm run build 2>&1 | tail -5
```
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add src/utils/dynamodb.ts
git commit -m "feat: DynamoDBにアカウント設定操作関数を追加"
```

---

### Task 9: account.tsのLambdaハンドラーを作成

**Files:**
- Create: `src/handlers/account.ts`

- [ ] **Step 1: account.tsを作成**

```typescript
/**
 * GET  /account       — 全家族メンバーの設定を一括取得
 * PUT  /account       — 自分の設定を更新（name/avatar/birthday）
 * POST /account/auth  — PIN照合（PC用）
 * PUT  /account/pin   — PIN設定・変更
 */

import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AccountSettings } from '../types';
import { getAllAccountSettings, getAccountSettings, saveAccountSettings } from '../utils/dynamodb';
import { withHandler, ok, err } from '../utils/handler';

const FAMILY_USER_IDS = [
  'U687f86855c46490c030499f5393c8a7e',
  'U4b13048aa2906b929c3139c4f3dfdd7c',
  'Ua8420309a164fffdbdd7f300f4c1cc94'
];

const UpdateProfileSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1).max(20),
  avatarType: z.enum(['photo', 'emoji']),
  avatarUrl: z.string().url().optional(),
  avatarEmoji: z.string().optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const SetPinSchema = z.object({
  userId: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/, 'PINは4桁の数字です')
});

const AuthPinSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, 'PINは4桁の数字です')
});

export const handler = withHandler(async (event) => {
  const method = event.httpMethod;
  const path = event.path;

  // GET /account — 全員の設定を返す（pinHashは除外）
  if (method === 'GET' && path === '/account') {
    const accounts = await getAllAccountSettings();
    const safe = accounts.map(({ pinHash: _, ...rest }) => rest);
    return ok({ accounts: safe });
  }

  // PUT /account — プロフィール更新
  if (method === 'PUT' && path === '/account') {
    const body = UpdateProfileSchema.safeParse(JSON.parse(event.body || '{}'));
    if (!body.success) return err(body.error.message);
    if (!FAMILY_USER_IDS.includes(body.data.userId)) return err('不正なユーザーです', 403);

    const existing = await getAccountSettings(body.data.userId);
    const updated: AccountSettings = {
      ...existing,
      ...body.data,
      pinHash: existing?.pinHash,
      updatedAt: new Date().toISOString()
    };
    await saveAccountSettings(updated);
    const { pinHash: _, ...safe } = updated;
    return ok(safe);
  }

  // POST /account/auth — PIN照合
  if (method === 'POST' && path === '/account/auth') {
    const body = AuthPinSchema.safeParse(JSON.parse(event.body || '{}'));
    if (!body.success) return err(body.error.message);

    const all = await getAllAccountSettings();
    for (const account of all) {
      if (!account.pinHash) continue;
      const match = await bcrypt.compare(body.data.pin, account.pinHash);
      if (match) {
        const { pinHash: _, ...safe } = account;
        return ok({ success: true, account: safe });
      }
    }
    return ok({ success: false });
  }

  // PUT /account/pin — PIN設定・変更
  if (method === 'PUT' && path === '/account/pin') {
    const body = SetPinSchema.safeParse(JSON.parse(event.body || '{}'));
    if (!body.success) return err(body.error.message);
    if (!FAMILY_USER_IDS.includes(body.data.userId)) return err('不正なユーザーです', 403);

    const existing = await getAccountSettings(body.data.userId);
    if (!existing) return err('アカウントが見つかりません', 404);

    const pinHash = await bcrypt.hash(body.data.pin, 10);
    await saveAccountSettings({ ...existing, pinHash, updatedAt: new Date().toISOString() });
    return ok({ success: true });
  }

  return err('Not found', 404);
});
```

- [ ] **Step 2: ビルド確認**

```bash
npm run build 2>&1 | grep -E "account|error|Error"
```
Expected: `dist/handlers/account.js` が生成され、エラーなし

- [ ] **Step 3: コミット**

```bash
git add src/handlers/account.ts
git commit -m "feat: account Lambda ハンドラーを作成"
```

---

### Task 10: AWS上にaccount Lambda関数とAPIルートを作成

**Files:** なし（AWSリソース操作）

- [ ] **Step 1: Lambda関数を作成**

```bash
# ZIPを作成
(cd dist && zip /tmp/account-kame.zip handlers/account.js)

# Lambda関数を作成
aws lambda create-function \
  --function-name account-kame \
  --runtime nodejs22.x \
  --role arn:aws:iam::982312822872:role/dog-record-lambda-role-kame \
  --handler handlers/account.handler \
  --zip-file fileb:///tmp/account-kame.zip \
  --environment "Variables={TABLE_ACCOUNT_SETTINGS=AccountSettings-kame}" \
  --profile c3test \
  --region ap-northeast-1
```

Expected: JSON レスポンスに `"FunctionArn"`

- [ ] **Step 2: DynamoDBアクセス権限をIAMロールに追加**

```bash
aws iam put-role-policy \
  --role-name dog-record-lambda-role-kame \
  --policy-name AccountSettingsAccess \
  --policy-document '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Action":["dynamodb:GetItem","dynamodb:PutItem","dynamodb:Scan"],
      "Resource":"arn:aws:dynamodb:ap-northeast-1:982312822872:table/AccountSettings-kame"
    }]
  }' \
  --profile c3test
```

- [ ] **Step 3: API Gatewayにルートを追加**

```bash
REST_API_ID=aqmin18fa2

# /account リソースを作成
PARENT_ID=$(aws apigateway get-resources --rest-api-id $REST_API_ID --profile c3test --region ap-northeast-1 --query 'items[?path==`/`].id' --output text)

ACCOUNT_ID=$(aws apigateway create-resource \
  --rest-api-id $REST_API_ID \
  --parent-id $PARENT_ID \
  --path-part account \
  --profile c3test --region ap-northeast-1 \
  --query 'id' --output text)

# /account/auth リソースを作成
AUTH_ID=$(aws apigateway create-resource \
  --rest-api-id $REST_API_ID \
  --parent-id $ACCOUNT_ID \
  --path-part auth \
  --profile c3test --region ap-northeast-1 \
  --query 'id' --output text)

# /account/pin リソースを作成
PIN_ID=$(aws apigateway create-resource \
  --rest-api-id $REST_API_ID \
  --parent-id $ACCOUNT_ID \
  --path-part pin \
  --profile c3test --region ap-northeast-1 \
  --query 'id' --output text)

echo "ACCOUNT_ID=$ACCOUNT_ID AUTH_ID=$AUTH_ID PIN_ID=$PIN_ID"
```

- [ ] **Step 4: 各メソッドをLambdaに接続（GET・PUT /account、POST /account/auth、PUT /account/pin）**

```bash
LAMBDA_ARN="arn:aws:lambda:ap-northeast-1:982312822872:function:account-kame"

for METHOD in GET PUT; do
  aws apigateway put-method --rest-api-id $REST_API_ID --resource-id $ACCOUNT_ID \
    --http-method $METHOD --authorization-type NONE --profile c3test --region ap-northeast-1
  aws apigateway put-integration --rest-api-id $REST_API_ID --resource-id $ACCOUNT_ID \
    --http-method $METHOD --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:ap-northeast-1:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" \
    --profile c3test --region ap-northeast-1
done

aws apigateway put-method --rest-api-id $REST_API_ID --resource-id $AUTH_ID \
  --http-method POST --authorization-type NONE --profile c3test --region ap-northeast-1
aws apigateway put-integration --rest-api-id $REST_API_ID --resource-id $AUTH_ID \
  --http-method POST --type AWS_PROXY --integration-http-method POST \
  --uri "arn:aws:apigateway:ap-northeast-1:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" \
  --profile c3test --region ap-northeast-1

aws apigateway put-method --rest-api-id $REST_API_ID --resource-id $PIN_ID \
  --http-method PUT --authorization-type NONE --profile c3test --region ap-northeast-1
aws apigateway put-integration --rest-api-id $REST_API_ID --resource-id $PIN_ID \
  --http-method PUT --type AWS_PROXY --integration-http-method POST \
  --uri "arn:aws:apigateway:ap-northeast-1:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" \
  --profile c3test --region ap-northeast-1
```

- [ ] **Step 5: OPTIONSメソッド（CORS）を各リソースに追加**

```bash
for RES_ID in $ACCOUNT_ID $AUTH_ID $PIN_ID; do
  aws apigateway put-method --rest-api-id $REST_API_ID --resource-id $RES_ID \
    --http-method OPTIONS --authorization-type NONE --profile c3test --region ap-northeast-1
  aws apigateway put-integration --rest-api-id $REST_API_ID --resource-id $RES_ID \
    --http-method OPTIONS --type MOCK \
    --request-templates '{"application/json":"{\"statusCode\":200}"}' \
    --profile c3test --region ap-northeast-1
done
```

- [ ] **Step 6: Lambda実行権限をAPI Gatewayに付与してデプロイ**

```bash
aws lambda add-permission \
  --function-name account-kame \
  --statement-id apigateway-account \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:ap-northeast-1:982312822872:aqmin18fa2/*/*" \
  --profile c3test --region ap-northeast-1

aws apigateway create-deployment \
  --rest-api-id $REST_API_ID \
  --stage-name prod \
  --profile c3test --region ap-northeast-1
```

- [ ] **Step 7: 動作確認**

```bash
curl https://aqmin18fa2.execute-api.ap-northeast-1.amazonaws.com/prod/account
```
Expected: `{"accounts":[{"userId":"U687...","displayName":"瑞季",...},...]}`

---

### Task 11: deploy.ymlにaccount Lambdaのデプロイを追加

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: FUNCTIONSリストにaccount-kameを追加**

```yaml
            "account-kame:handlers/account.js"
```

- [ ] **Step 2: コミットしてCIでビルド確認**

```bash
git add .github/workflows/deploy.yml package.json package-lock.json
git commit -m "ci: account-kame LambdaをCIデプロイに追加"
git push origin main
```

Expected: GitHub Actionsでデプロイ成功

---

## Phase 2: フロントエンド認証

### Task 12: LIFF SDKをHTMLに追加しLIFF IDをCI注入

**Files:**
- Modify: `web/home.html`, `web/dashboard.html`
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: home.htmlとdashboard.htmlの`<head>`にLIFF SDKを追加**

両ファイルの `<link rel="stylesheet"...>` の直前に追加:

```html
<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
```

- [ ] **Step 2: HTMLにLIFF IDプレースホルダーを追加**

両ファイルの `<script src="scripts/...bundle.js">` の直前に追加:

```html
<script>var LIFF_ID = 'LIFF_ID_PLACEHOLDER';</script>
```

- [ ] **Step 3: deploy.ymlのInject SW versionステップにLIFF ID注入を追加**

```yaml
          # LIFF IDをSecretsManagerから取得して注入
          LIFF_URL=$(aws secretsmanager get-secret-value \
            --secret-id line/credentials-kame \
            --query SecretString --output text \
            | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('LIFF_URL',''))")
          LIFF_ID=${LIFF_URL##*/}
          sed -i "s|LIFF_ID_PLACEHOLDER|${LIFF_ID}|g" web/home.html web/dashboard.html
```

- [ ] **Step 4: コミット**

```bash
git add web/home.html web/dashboard.html .github/workflows/deploy.yml
git commit -m "feat: LIFF SDKをHTMLに追加しCIでLIFF IDを自動注入"
```

---

### Task 13: auth.jsを作成（LIFF認証 + PCセッション確認）

**Files:**
- Create: `web/scripts/core/auth.js`

- [ ] **Step 1: auth.jsを作成**

```javascript
// core/auth.js — 認証フロー管理
// 依存: core/config.js, core/state.js, core/account.js, ui/user-select.js

/**
 * アプリ起動時の認証エントリポイント
 * dashboard.page.js / home.page.js から呼ぶ
 */
async function initAuth() {
  // 1. LIFF初期化
  try {
    await liff.init({ liffId: LIFF_ID });
  } catch (e) {
    console.warn('LIFF初期化失敗:', e);
    // LIFF失敗 → PCフローへ
    return _tryPcSession();
  }

  // 2. LIFF環境内かつログイン済みの場合
  if (liff.isInClient() && liff.isLoggedIn()) {
    return _authByLiff();
  }

  // 3. ブラウザでLIFF SDKが使えるがLIFF Client外（PCブラウザ等）
  return _tryPcSession();
}

/** LIFF経由で自動ログイン */
async function _authByLiff() {
  try {
    var profile = await liff.getProfile();
    var member = familyMembers.find(function(m) { return m.userId === profile.userId; });
    if (!member) {
      _showAccessDenied();
      return;
    }
    currentUser = member;
    await _onLoginSuccess();
  } catch (e) {
    console.error('LIFFプロフィール取得失敗:', e);
    _tryPcSession();
  }
}

/** localStorageのPCセッションを確認 */
async function _tryPcSession() {
  try {
    var session = JSON.parse(localStorage.getItem(AppConfig.STORAGE.AUTH_SESSION) || 'null');
    if (session && session.userId && session.authenticated) {
      var member = familyMembers.find(function(m) { return m.userId === session.userId; });
      if (member) {
        currentUser = member;
        await _onLoginSuccess();
        return;
      }
    }
  } catch (e) { /* 無視 */ }
  // セッションなし → PINログイン画面を表示
  _showPinLogin();
}

/** ログイン成功後の共通処理 */
async function _onLoginSuccess() {
  await loadAccountSettings();  // 全員のアカウント設定を取得
  if (typeof onAuthComplete === 'function') onAuthComplete();
}

/** アクセス拒否画面 */
function _showAccessDenied() {
  document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-size:18px;color:#666;padding:20px;text-align:center">このアプリは家族専用です🐕</div>';
}

/** PINログイン画面を表示 */
function _showPinLogin() {
  var overlay = document.getElementById('pinLoginOverlay');
  if (overlay) overlay.style.display = 'flex';
}

/** PC PIN認証成功後にセッションを保存 */
function savePcSession(userId) {
  localStorage.setItem(AppConfig.STORAGE.AUTH_SESSION, JSON.stringify({ userId: userId, authenticated: true }));
}
```

- [ ] **Step 2: コミット**

```bash
git add web/scripts/core/auth.js
git commit -m "feat: LIFF自動ログイン+PCセッション確認のauth.jsを作成"
```

---

### Task 14: PINログイン画面のHTML・CSS・JSを作成

**Files:**
- Create: `web/scripts/ui/pin-login.js`
- Create: `web/styles/pin-login.css`
- Modify: `web/home.html`, `web/dashboard.html`

- [ ] **Step 1: pin-login.cssを作成**

```css
/* PINログイン画面 */
.pin-login-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:#fff;z-index:99999;display:none;flex-direction:column;align-items:center;justify-content:center;padding:24px}
.pin-login-title{font-size:20px;font-weight:700;color:#5d4037;margin-bottom:32px}
.pin-login-label{font-size:15px;color:#8d6e63;margin-bottom:20px}
.pin-dots{display:flex;gap:16px;margin-bottom:32px}
.pin-dot{width:18px;height:18px;border-radius:50%;border:2px solid #8d6e63;background:#fff;transition:background .15s}
.pin-dot.filled{background:#8d6e63}
.pin-numpad{display:grid;grid-template-columns:repeat(3,72px);gap:12px}
.pin-key{width:72px;height:72px;border-radius:50%;border:none;background:#f5f0eb;font-size:22px;font-weight:600;color:#5d4037;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s}
.pin-key:active{background:#d7ccc8}
.pin-key.delete{font-size:16px;color:#a1887f}
.pin-welcome{display:none;flex-direction:column;align-items:center;gap:20px;text-align:center}
.pin-welcome-name{font-size:24px;font-weight:700;color:#5d4037}
.pin-welcome-msg{font-size:16px;color:#8d6e63}
.pin-welcome-btn{padding:14px 32px;border:none;border-radius:24px;font-size:16px;font-weight:600;cursor:pointer}
.pin-welcome-go{background:#8d6e63;color:#fff}
.pin-welcome-retry{background:#f5f0eb;color:#5d4037;margin-top:8px}
.pin-error{color:#e53935;font-size:13px;min-height:20px;margin-top:-16px;margin-bottom:8px}
.pin-loading{color:#8d6e63;font-size:14px}
```

- [ ] **Step 2: pin-login.jsを作成**

```javascript
// ui/pin-login.js — PINログイン画面
// 依存: core/auth.js, core/state.js

var _pinBuffer = '';
var _pinLoading = false;

function initPinLogin() {
  _renderPinScreen();
}

function _renderPinScreen() {
  var overlay = document.getElementById('pinLoginOverlay');
  if (!overlay) return;
  overlay.innerHTML = `
    <div class="pin-login-title">スケジュールアプリ</div>
    <div id="pinInputArea">
      <div class="pin-login-label">PINを入力してください</div>
      <div class="pin-dots" id="pinDots">
        <div class="pin-dot" id="pd0"></div>
        <div class="pin-dot" id="pd1"></div>
        <div class="pin-dot" id="pd2"></div>
        <div class="pin-dot" id="pd3"></div>
      </div>
      <div class="pin-error" id="pinError"></div>
      <div class="pin-numpad">
        ${[1,2,3,4,5,6,7,8,9,'','0','⌫'].map(function(k) {
          if (k === '') return '<div></div>';
          return '<div class="pin-key' + (k === '⌫' ? ' delete' : '') + '" onclick="pinKeyPress(\'' + k + '\')">' + k + '</div>';
        }).join('')}
      </div>
      <div class="pin-loading" id="pinLoading" style="display:none">確認中...</div>
    </div>
    <div class="pin-welcome" id="pinWelcome">
      <div>🐕</div>
      <div class="pin-welcome-name" id="pinWelcomeName"></div>
      <div class="pin-welcome-msg">お帰りなさい！</div>
      <button class="pin-welcome-btn pin-welcome-go" onclick="pinGoHome()">ホームへ進む</button>
      <button class="pin-welcome-btn pin-welcome-retry" onclick="pinRetry()">入力し直す</button>
    </div>
  `;
  _pinBuffer = '';
}

function pinKeyPress(key) {
  if (_pinLoading) return;
  if (key === '⌫') {
    _pinBuffer = _pinBuffer.slice(0, -1);
    _updateDots();
    return;
  }
  if (_pinBuffer.length >= 4) return;
  _pinBuffer += key;
  _updateDots();
  if (_pinBuffer.length === 4) {
    _submitPin();
  }
}

function _updateDots() {
  for (var i = 0; i < 4; i++) {
    var dot = document.getElementById('pd' + i);
    if (dot) dot.classList.toggle('filled', i < _pinBuffer.length);
  }
}

async function _submitPin() {
  _pinLoading = true;
  document.getElementById('pinLoading').style.display = 'block';
  document.getElementById('pinError').textContent = '';

  try {
    var res = await fetch(API_BASE_URL + AppConfig.API.ACCOUNT + '/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: _pinBuffer })
    });
    var data = await res.json();

    if (data.success && data.account) {
      var member = familyMembers.find(function(m) { return m.userId === data.account.userId; });
      if (member) {
        currentUser = member;
        savePcSession(member.userId);
        _showWelcome(data.account.displayName);
        return;
      }
    }
    // 失敗
    document.getElementById('pinError').textContent = 'PINが違います。もう一度お試しください。';
    _pinBuffer = '';
    _updateDots();
  } catch (e) {
    document.getElementById('pinError').textContent = '通信エラーが発生しました。';
    _pinBuffer = '';
    _updateDots();
  } finally {
    _pinLoading = false;
    document.getElementById('pinLoading').style.display = 'none';
  }
}

function _showWelcome(name) {
  document.getElementById('pinInputArea').style.display = 'none';
  var welcome = document.getElementById('pinWelcome');
  welcome.style.display = 'flex';
  document.getElementById('pinWelcomeName').textContent = name + 'さん、';
}

async function pinGoHome() {
  document.getElementById('pinLoginOverlay').style.display = 'none';
  await _onLoginSuccess();
}

function pinRetry() {
  _pinBuffer = '';
  document.getElementById('pinInputArea').style.display = 'block';
  document.getElementById('pinWelcome').style.display = 'none';
  _updateDots();
}
```

- [ ] **Step 3: home.html / dashboard.htmlにPINオーバーレイHTMLを追加**

`<body>` の直後（ヘッダーの前）に追加:

```html
<div id="pinLoginOverlay" class="pin-login-overlay"></div>
```

- [ ] **Step 4: build-web.jsのCSS・JSリストにpin-login追加**

`scripts/build-web.js` の `HOME_CSS` / `DASHBOARD_CSS` に `styles/pin-login.css`、`HOME_JS` / `DASHBOARD_JS` に `scripts/core/auth.js` と `scripts/ui/pin-login.js` を追加する（依存順序に注意: auth.jsはaccount.jsの後、pin-login.jsはauth.jsの後）。

```javascript
// HOME_JS / DASHBOARD_JS に追加（account.jsの後に）
'scripts/core/auth.js',
'scripts/ui/pin-login.js',

// HOME_CSS / DASHBOARD_CSS に追加
'styles/pin-login.css',
```

- [ ] **Step 5: ビルド確認**

```bash
node scripts/build-web.js
```
Expected: `✓ Done`

- [ ] **Step 6: コミット**

```bash
git add web/scripts/core/auth.js web/scripts/ui/pin-login.js web/styles/pin-login.css web/home.html web/dashboard.html scripts/build-web.js
git commit -m "feat: PINログイン画面とauth.jsを追加"
```

---

### Task 15: dashboard.page.js / home.page.jsをauth.js対応に更新

**Files:**
- Modify: `web/scripts/dashboard.page.js`
- Modify: `web/scripts/home.page.js`

- [ ] **Step 1: dashboard.page.jsのinit()冒頭を修正**

`initCurrentUser()` の呼び出しを `await initAuth()` に置き換え:

```javascript
async function init() {
  await initAuth();   // ← 変更（旧: initCurrentUser()）
  // 以降は変更なし
  var urlParams = new URLSearchParams(window.location.search);
  // ...
}
```

- [ ] **Step 2: home.page.jsも同様に修正**

`initCurrentUser()` → `await initAuth()` に変更。

- [ ] **Step 3: ビルド確認**

```bash
node scripts/build-web.js
```
Expected: `✓ Done`

- [ ] **Step 4: コミット・プッシュ**

```bash
git add web/scripts/dashboard.page.js web/scripts/home.page.js
git commit -m "feat: initCurrentUser()をinitAuth()に置き換え"
git push origin main
```

---

## Phase 3: アカウントモーダルUI刷新

### Task 16: account-edit.jsをAPI保存・新UIに全面刷新

**Files:**
- Modify: `web/scripts/ui/account-edit.js`
- Modify: `web/home.html`, `web/dashboard.html`（モーダルHTML）

- [ ] **Step 1: account-edit.jsを新実装に置き換え**

```javascript
// ui/account-edit.js — アカウントモーダル（表示・編集）
// アカウント切り替えなし。自分の設定のみ編集。サーバー保存。
// 依存: core/config.js, core/state.js, core/account.js, ui/user-select.js

var _editingPhoto = null;
var _editingEmoji = null;
var _editingIconType = 'photo';
var _availableEmojis = ['👧','👩','👨','🧒','👶','🐕','🐈','🌸','⭐','🌙','🔥','💎'];

function openAccountModal() {
  if (!currentUser) return;
  var modal = document.getElementById('accountModal');
  _renderAccountView();
  modal.classList.add('active');
}

function closeAccountModal() {
  document.getElementById('accountModal').classList.remove('active');
}

function _renderAccountView() {
  var photo = getAvatarPhoto(currentUser.userId);
  var emoji = getAvatarEmoji(currentUser.userId);
  var settings = accountSettingsCache[currentUser.userId] || {};

  document.getElementById('accountViewMode').style.display = 'block';
  document.getElementById('accountEditMode').style.display = 'none';

  // アバター表示
  var avatarEl = document.getElementById('accountAvatar');
  var avatarImg = document.getElementById('accountAvatarImg');
  if (photo) {
    avatarEl.style.display = 'none';
    avatarImg.src = photo; avatarImg.style.display = 'block';
  } else {
    avatarImg.style.display = 'none';
    avatarEl.style.display = 'block';
    avatarEl.textContent = emoji;
  }
  document.getElementById('accountName').textContent = getDisplayName(currentUser);

  var birthdayEl = document.getElementById('accountBirthday');
  if (birthdayEl) birthdayEl.textContent = settings.birthday ? '🎂 ' + settings.birthday : '🎂 生年月日: 未設定';
}

function startEditAccount() {
  if (!currentUser) return;
  var settings = accountSettingsCache[currentUser.userId] || {};
  _editingPhoto = settings.avatarUrl || null;
  _editingEmoji = settings.avatarEmoji || '👤';
  _editingIconType = settings.avatarType || 'photo';

  document.getElementById('accountViewMode').style.display = 'none';
  document.getElementById('accountEditMode').style.display = 'block';
  document.getElementById('accountNameInput').value = getDisplayName(currentUser);

  var birthdayInput = document.getElementById('accountBirthdayInput');
  if (birthdayInput) birthdayInput.value = settings.birthday || '';

  // アイコン選択UI初期化
  switchAccountIconTab(_editingIconType);

  var preview = document.getElementById('accountPhotoPreview');
  var previewImg = document.getElementById('accountPreviewImg');
  if (_editingPhoto) {
    previewImg.src = _editingPhoto;
    preview.classList.add('has-photo');
    document.getElementById('accountPhotoRemove').style.display = 'block';
  } else {
    previewImg.src = ''; preview.classList.remove('has-photo');
    document.getElementById('accountPhotoRemove').style.display = 'none';
  }

  document.getElementById('accountEmojiPicker').innerHTML = _availableEmojis.map(function(e) {
    return '<div class="account-emoji-option' + (e === _editingEmoji ? ' selected' : '') + '" onclick="selectAccountEmoji(\'' + e + '\')">' + e + '</div>';
  }).join('');
}

function switchAccountIconTab(tab) {
  _editingIconType = tab;
  document.getElementById('accountIconPhotoTab').classList.toggle('active', tab === 'photo');
  document.getElementById('accountIconEmojiTab').classList.toggle('active', tab === 'emoji');
  document.getElementById('accountPhotoPicker').style.display = tab === 'photo' ? 'flex' : 'none';
  document.getElementById('accountEmojiPicker').style.display = tab === 'emoji' ? 'grid' : 'none';
}

async function accountPhotoSelected(event) {
  var file = event.target.files[0];
  if (!file) return;
  try {
    _editingPhoto = await compressImage(file, AppConfig.IMAGE.AVATAR_PHOTO.maxWidth, AppConfig.IMAGE.AVATAR_PHOTO.quality);
    var preview = document.getElementById('accountPhotoPreview');
    document.getElementById('accountPreviewImg').src = _editingPhoto;
    preview.classList.add('has-photo');
    document.getElementById('accountPhotoRemove').style.display = 'block';
  } catch (e) { alert('画像の読み込みに失敗しました'); }
}

function removeAccountPhoto() {
  _editingPhoto = null;
  document.getElementById('accountPreviewImg').src = '';
  document.getElementById('accountPhotoPreview').classList.remove('has-photo');
  document.getElementById('accountPhotoRemove').style.display = 'none';
}

function selectAccountEmoji(emoji) {
  _editingEmoji = emoji;
  document.querySelectorAll('.account-emoji-option').forEach(function(el) {
    el.classList.toggle('selected', el.textContent === emoji);
  });
}

function cancelEditAccount() {
  document.getElementById('accountViewMode').style.display = 'block';
  document.getElementById('accountEditMode').style.display = 'none';
}

async function saveAccountEdit() {
  if (!currentUser) return;
  var newName = document.getElementById('accountNameInput').value.trim();
  if (!newName) { alert('表示名を入力してください'); return; }

  var btn = document.getElementById('accountSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = '保存中...'; }

  try {
    var avatarType = _editingIconType;
    var avatarUrl = null;
    if (avatarType === 'photo' && _editingPhoto && _editingPhoto.startsWith('data:')) {
      avatarUrl = await uploadImageToS3(_editingPhoto, 'avatar');
    } else if (avatarType === 'photo' && _editingPhoto) {
      avatarUrl = _editingPhoto;
    }

    var birthdayInput = document.getElementById('accountBirthdayInput');
    var payload = {
      userId: currentUser.userId,
      displayName: newName,
      avatarType: avatarType,
      avatarUrl: avatarUrl || undefined,
      avatarEmoji: avatarType === 'emoji' ? _editingEmoji : undefined,
      birthday: birthdayInput ? birthdayInput.value : undefined
    };

    var res = await fetch(API_BASE_URL + AppConfig.API.ACCOUNT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('保存失敗');
    var updated = await res.json();
    accountSettingsCache[currentUser.userId] = updated;

    cancelEditAccount();
    _renderAccountView();
    updateHeaderAvatar();
  } catch (e) {
    alert('設定の保存に失敗しました: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '保存'; }
  }
}

// ── PIN設定 ──
function openPinSetting() {
  var section = document.getElementById('pinSettingSection');
  if (section) section.style.display = section.style.display === 'none' ? 'block' : 'none';
}

async function savePin() {
  if (!currentUser) return;
  var input = document.getElementById('pinInput');
  var pin = input ? input.value.trim() : '';
  if (!/^\d{4}$/.test(pin)) { alert('PINは4桁の数字で入力してください'); return; }

  try {
    var res = await fetch(API_BASE_URL + AppConfig.API.ACCOUNT + '/pin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.userId, pin: pin })
    });
    if (!res.ok) throw new Error('PIN設定失敗');
    alert('PINを設定しました');
    if (input) input.value = '';
    openPinSetting();
  } catch (e) {
    alert('PIN設定に失敗しました: ' + e.message);
  }
}

// ── アプリリンク共有 ──
function shareAppLink() {
  var url = 'https://family-schedule-web-kame-982312822872.s3.ap-northeast-1.amazonaws.com/home.html';
  if (navigator.share) {
    navigator.share({ title: 'スケジュールアプリ', url: url });
  } else {
    navigator.clipboard.writeText(url).then(function() {
      alert('リンクをコピーしました！');
    });
  }
}
```

- [ ] **Step 2: home.html / dashboard.htmlのアカウントモーダルHTMLを更新**

`id="accountViewMode"` 内の **アカウント切り替えセクション** を削除し、代わりに以下を追加:

```html
<!-- アカウント切り替え → 削除 -->

<!-- PIN設定 -->
<button class="account-action-btn" onclick="openPinSetting()">🔑 PIN設定・変更</button>
<div id="pinSettingSection" style="display:none;margin-top:10px">
  <input type="password" id="pinInput" maxlength="4" pattern="\d{4}"
    placeholder="新しいPIN（4桁）" class="account-name-input" inputmode="numeric">
  <div class="account-edit-buttons">
    <button class="account-edit-cancel" onclick="openPinSetting()">キャンセル</button>
    <button class="account-edit-save" id="accountSaveBtn" onclick="savePin()">設定する</button>
  </div>
</div>

<!-- アプリリンク共有 -->
<button class="account-action-btn" onclick="shareAppLink()" style="margin-top:8px">🔗 アプリリンクを共有</button>
```

- [ ] **Step 3: ビルド・動作確認**

```bash
node scripts/build-web.js && git add web/scripts/ui/account-edit.js web/home.html web/dashboard.html
git commit -m "feat: アカウントモーダルをAPI保存・PIN設定・リンク共有に刷新"
git push origin main
```

---

## Phase 4: ダークモード

### Task 17: CSS custom propertiesでダークモード対応

**Files:**
- Modify: `web/styles/base.css`
- Modify: `web/styles/tabs/diary.css`（代表例、他タブも同様）

- [ ] **Step 1: base.cssにCSS変数を定義**

`web/styles/base.css` の先頭に追加:

```css
:root {
  --color-bg: #f5f5f5;
  --color-surface: #ffffff;
  --color-text-primary: #333333;
  --color-text-muted: #666666;
  --color-border: #e0e0e0;
  --color-brown: #8d6e63;
  --color-brown-light: #f5f0eb;
}
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #121212;
    --color-surface: #1e1e1e;
    --color-text-primary: #f0f0f0;
    --color-text-muted: #aaaaaa;
    --color-border: #333333;
    --color-brown: #a1887f;
    --color-brown-light: #2a2320;
  }
}
body { background: var(--color-bg); color: var(--color-text-primary); }
```

- [ ] **Step 2: 各CSSファイルのハードコードされたbg色を変数に置換**

主要箇所:
- `.diary-entry { background: var(--color-surface); }`
- `.diary-container { background: var(--color-bg); }`
- `.diary-text-fade { background: linear-gradient(to bottom, transparent, var(--color-surface)); }`
- ヘッダー・モーダル・カードの `#fff` → `var(--color-surface)`
- テキストの `#333` → `var(--color-text-primary)`

- [ ] **Step 3: ビルド・確認**

```bash
node scripts/build-web.js
```
Expected: `✓ Done`

- [ ] **Step 4: コミット・プッシュ**

```bash
git add web/styles/
git commit -m "feat: CSS custom propertiesでダークモード対応"
git push origin main
```

---

## Self-Review チェック

**Spec coverage:**
- ✅ LIFF自動ログイン → Task 13
- ✅ PC PIN認証 → Task 14
- ✅ 家族以外アクセス拒否 → auth.js `_showAccessDenied()`
- ✅ PCセッション管理 → auth.js `savePcSession()` / `_tryPcSession()`
- ✅ DynamoDB AccountSettings-kame → Task 5
- ✅ GET/PUT/POST/auth/PUT/pin → Task 9
- ✅ bcryptハッシュ → Task 4, Task 9
- ✅ アカウントモーダル刷新 → Task 16
- ✅ PIN設定UI → Task 16
- ✅ アプリリンク共有 → Task 16
- ✅ ダークモード → Task 17
- ✅ コード掃除 → Task 1-3

**型整合性:**
- `getAvatarPhoto(userId)` / `getAvatarEmoji(userId)` — account.jsとaccount-edit.jsで引数はuserIdで統一
- `accountSettingsCache[userId]` — account.js・account-edit.js両方で同一キー
- `AppConfig.API.ACCOUNT` — config.jsで定義、全ファイルで参照
