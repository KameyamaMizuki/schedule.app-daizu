# LINE ID連携 + アカウント管理サーバー化 設計書

**日付:** 2026-06-05  
**ステータス:** 承認済み

---

## 概要

現在 localStorage にのみ保存されているアカウント設定（表示名・アイコン・誕生日）をサーバー（DynamoDB）で管理し、全端末・全家族メンバー間でリアルタイムに共有できるようにする。スマホはLIFF自動ログイン、PCは個人4桁PINで認証する。

---

## 認証フロー

### スマホ（LINEリッチメニュー / メッセージリンクから開く）

```
アプリ起動
  → liff.init({ liffId })
  → liff.getProfile() で LINE userId 取得
  → familyMembers に一致 → 自動ログイン
  → 一致しない     → 「このアプリは家族専用です」画面を表示して終了
```

### PC（ブラウザで直接開く）

```
アプリ起動
  → LIFF環境でない (liff.isInClient() === false)
  → localStorage に認証済みセッションあり → 自動ログイン
  → セッションなし → PINログイン画面を表示

PINログイン画面
  → 4桁入力完了で自動送信
  → POST /account/auth { pin }
  → 成功: 「〇〇さん、お帰りなさい！」画面
       [ホームへ進む] → セッション保存してアプリへ
       [入力し直す]   → PIN画面に戻る
  → 失敗: エラーメッセージ表示
```

### セッション管理（PC）

- PIN認証成功後、`{ userId, authenticated: true }` を localStorage に保存
- キャッシュクリアまで有効（家族専用アプリのためJWT等の複雑な管理は不要）

---

## バックエンド

### 新DynamoDBテーブル：`AccountSettings-kame`

| 属性 | 型 | 説明 |
|---|---|---|
| `userId` (PK) | String | LINE userId |
| `displayName` | String | 表示名 |
| `avatarType` | `'photo'` \| `'emoji'` | アイコン種別 |
| `avatarUrl` | String? | S3 URL（写真の場合） |
| `avatarEmoji` | String? | 絵文字（絵文字の場合） |
| `birthday` | String? | `"YYYY-MM-DD"` |
| `pinHash` | String | bcryptハッシュ（生PINは保存しない） |
| `updatedAt` | String | ISO 8601 |

### 新Lambda：`account-kame`

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/account` | 全家族メンバーの設定を一括取得 |
| `PUT` | `/account` | 自分の設定を更新（name / avatar / birthday） |
| `POST` | `/account/auth` | PIN照合（PC用）— userId不要、全メンバーのハッシュと照合して一致したuserIdを返す |
| `PUT` | `/account/pin` | PIN設定・変更 |

アバター写真のアップロードは既存の日記と同じS3 presigned URL方式を流用する。

---

## フロントエンド変更

### LIFF SDK初期化

- `home.html` / `dashboard.html` に LIFF SDK を追加
  ```html
  <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  ```
- アプリ起動直後（既存の `initCurrentUser()` の前）に `liff.init({ liffId })` を実行
- LIFF ID は CI ビルド時に Secrets Manager から取得した値を HTML に埋め込む（LIFF ID は公開情報のため問題なし）
- 環境判定後、認証フローを分岐

### PINログイン画面（新規）

```
┌─────────────────────────────┐
│      スケジュールアプリ     │
│                             │
│    PINを入力してください    │
│                             │
│         ● ● ● ●            │
│      [1]  [2]  [3]         │
│      [4]  [5]  [6]         │
│      [7]  [8]  [9]         │
│           [0]              │
└─────────────────────────────┘
         ↓ 4桁入力完了（自動送信）
┌─────────────────────────────┐
│                             │
│   🐕 瑞季さん、             │
│      お帰りなさい！         │
│                             │
│   [ホームへ進む]            │
│   [入力し直す]              │
│                             │
└─────────────────────────────┘
```

- 4桁入力完了と同時に自動でAPIへ送信（送信ボタン不要）
- ローディング中はスピナーを表示
- 一致した人の displayName を「お帰りなさい」画面に表示

### アカウントモーダルの刷新

**削除する機能：**
- アカウント切り替えボタン（LIFF自動認証で不要）

**維持・更新する機能：**
- 名前・アイコン編集（サーバー保存に変更）

**追加する機能：**
- 🎂 誕生日設定（サーバー保存に変更）
- 🔑 PIN設定・変更（4桁入力UI）
- 🔗 アプリリンクをコピー / 任意のアプリに送信（Share API or clipboard）

### アプリ起動時の設定読み込み

```
ログイン確定後
  → GET /account（全員分の設定を一括取得）
  → displayName / avatar / birthday をメモリに展開
  → 全タブの投稿者名・アイコン表示に適用
```

---

## ダークモード

端末設定（`prefers-color-scheme: dark`）に自動追従。  
実装方式：CSS カスタムプロパティ（変数）をベースカラーとして定義し、ダークモード時に上書き。

```css
:root {
  --bg-primary: #ffffff;
  --text-primary: #333333;
  /* ... */
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: #1a1a1a;
    --text-primary: #f0f0f0;
    /* ... */
  }
}
```

---

## 実装フェーズ

| フェーズ | 内容 | 優先度 |
|---|---|---|
| **1** | バックエンド：DynamoDBテーブル + `account-kame` Lambda + APIエンドポイント | 最高 |
| **2** | 認証：LIFF初期化 + PIN画面 + `account.js` 刷新 | 高 |
| **3** | アカウントモーダルUI刷新 | 中 |
| **4** | ダークモード | 低 |

---

## 既存コードへの影響

| ファイル | 変更内容 |
|---|---|
| `web/scripts/core/state.js` | `familyMembers` のハードコードを維持（userId の正引きに使用） |
| `web/scripts/ui/user-select.js` | `initCurrentUser()` をLIFF/PIN認証フローに置き換え |
| `web/scripts/core/account.js` | localStorage読み書きをAPI呼び出しに変更 |
| `web/scripts/ui/account-edit.js` | モーダルUI刷新、API保存に変更 |
| `web/home.html` / `web/dashboard.html` | LIFF SDK追加 |
| `src/handlers/` | `account.ts` 新規追加 |
| `.github/workflows/deploy.yml` | account Lambda のデプロイ追加 |
