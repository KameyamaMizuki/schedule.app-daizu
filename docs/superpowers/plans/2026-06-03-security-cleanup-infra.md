# Security, Cleanup & Infrastructure Modernization

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CORS・バリデーション・race condition を修正し、重複コードを統合し、AWS インフラを Node.js 22・SAM 管理・GitHub Actions OIDC に移行する。

**Architecture:** Phase 1（Task 1–7）はコード変更のみで現行 CI が自動デプロイ。Phase 2（Task 8–12）は SAM 修復後に `template.yaml` でインフラを一元管理する。タスクは依存関係順に並んでいるため、上から順に実施する。

**Tech Stack:** TypeScript 5.3, Node.js 22, jest 29 + ts-jest 29, AWS SAM CLI 1.100+, Lambda, API Gateway REST, DynamoDB, S3, GitHub Actions

---

## ファイル構成

**新規作成:**
- `jest.config.ts` — jest + ts-jest 設定
- `src/utils/reactions.ts` — chirol 用 like/comment 操作の共有ユーティリティ
- `tests/utils/dynamodb.test.ts` — togglePostLike のテスト
- `tests/utils/reactions.test.ts` — reactions ユーティリティのテスト
- `tests/handlers/post-get.test.ts` — type バリデーションのテスト
- `tests/utils/handler.test.ts` — CORS ヘッダーのテスト

**変更:**
- `package.json` — ts-jest・@types/jest 追加
- `src/utils/dynamodb.ts` — togglePostLike 追加、addPostReaction/removePostReaction 削除、ConsistentRead 修正
- `src/utils/handler.ts` — CORS origin を ALLOWED_ORIGIN env var に変更
- `src/utils/constants.ts` — S3_BASE_URL を env var から取得
- `src/handlers/post-save.ts` — togglePostLike 使用に変更
- `src/handlers/chirol-image.ts` — reactions utility 使用、userName 検証
- `src/handlers/chirol-hitokoto.ts` — reactions utility 使用、userName 検証
- `src/handlers/post-get.ts` — type パラメータに Zod バリデーション追加
- `esbuild.config.js` — target: 'node22' に変更
- `template.yaml` — runtime nodejs22.x、env vars 追加、CORS AllowOrigin 修正
- `.github/workflows/deploy.yml` — Node.js 22、OIDC 認証に変更

---

## Phase 1: コード修正（現行 CI で自動デプロイ）

---

### Task 1: jest + ts-jest テスト基盤のセットアップ

**Files:**
- Modify: `package.json`
- Create: `jest.config.ts`
- Create: `tests/utils/.gitkeep`（ディレクトリ作成用）

- [ ] **Step 1: ts-jest と @types/jest をインストール**

```bash
npm install --save-dev ts-jest @types/jest
```

- [ ] **Step 2: `jest.config.ts` を作成**

```typescript
// jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }]
  },
  moduleNameMapper: {
    '^@aws-sdk/client-dynamodb$': '<rootDir>/node_modules/@aws-sdk/client-dynamodb',
    '^@aws-sdk/lib-dynamodb$': '<rootDir>/node_modules/@aws-sdk/lib-dynamodb'
  }
};

export default config;
```

- [ ] **Step 3: `package.json` の `test` スクリプトを確認し、tests ディレクトリを作成**

```bash
mkdir -p tests/utils tests/handlers
```

- [ ] **Step 4: スモークテストを作成して動作確認**

```typescript
// tests/utils/smoke.test.ts
describe('test setup', () => {
  it('jest works', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: テスト実行を確認**

```bash
npx jest tests/utils/smoke.test.ts --no-coverage
```

期待出力:
```
PASS tests/utils/smoke.test.ts
  test setup
    ✓ jest works
Tests: 1 passed
```

- [ ] **Step 6: スモークテストを削除してコミット**

```bash
del tests\utils\smoke.test.ts
git add jest.config.ts tests/ package.json package-lock.json
git commit -m "chore: add jest + ts-jest test infrastructure"
```

---

### Task 2: `togglePostLike` — race condition 修正 + 二重書き込み解消

`addPostReaction`（2回 UpdateCommand）と `removePostReaction`（read-modify-write 競合）を、楽観的ロック付きの `togglePostLike` に統合する。

**Files:**
- Modify: `src/utils/dynamodb.ts`
- Modify: `src/handlers/post-save.ts`
- Create: `tests/utils/dynamodb.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// tests/utils/dynamodb.test.ts
import { docClient, togglePostLike } from '../../src/utils/dynamodb';
import type { PostType } from '../../src/types';

describe('togglePostLike', () => {
  let sendSpy: jest.SpyInstance;

  beforeEach(() => {
    sendSpy = jest.spyOn(docClient, 'send' as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('liked でないとき userId を likes に追加して true を返す', async () => {
    sendSpy
      .mockResolvedValueOnce({ Item: { PK: 'POST', SK: 'sk1', reactions: { like: ['user1'] } } })
      .mockResolvedValueOnce({});

    const result = await togglePostLike('POST' as PostType, 'sk1', 'user2');

    expect(result).toBe(true);
    expect(sendSpy).toHaveBeenCalledTimes(2);
    const updateInput = (sendSpy.mock.calls[1][0] as any).input;
    expect(updateInput.ExpressionAttributeValues[':newLikes']).toContain('user2');
    expect(updateInput.ExpressionAttributeValues[':newLikes']).toContain('user1');
  });

  it('liked のとき userId を likes から削除して false を返す', async () => {
    sendSpy
      .mockResolvedValueOnce({ Item: { PK: 'POST', SK: 'sk1', reactions: { like: ['user1', 'user2'] } } })
      .mockResolvedValueOnce({});

    const result = await togglePostLike('POST' as PostType, 'sk1', 'user1');

    expect(result).toBe(false);
    const updateInput = (sendSpy.mock.calls[1][0] as any).input;
    expect(updateInput.ExpressionAttributeValues[':newLikes']).toEqual(['user2']);
  });

  it('ConditionalCheckFailedException でリトライして成功する', async () => {
    const conditionError = Object.assign(new Error('Condition failed'), {
      name: 'ConditionalCheckFailedException'
    });
    const mockPost = { Item: { PK: 'POST', SK: 'sk1', reactions: { like: [] } } };

    sendSpy
      .mockResolvedValueOnce(mockPost)       // attempt 1: getPost
      .mockRejectedValueOnce(conditionError) // attempt 1: UpdateCommand 失敗
      .mockResolvedValueOnce(mockPost)       // attempt 2: getPost
      .mockResolvedValueOnce({});            // attempt 2: UpdateCommand 成功

    await expect(togglePostLike('POST' as PostType, 'sk1', 'user1')).resolves.toBe(true);
    expect(sendSpy).toHaveBeenCalledTimes(4);
  });

  it('3回リトライ失敗後に throw する', async () => {
    const conditionError = Object.assign(new Error(), {
      name: 'ConditionalCheckFailedException'
    });
    const mockPost = { Item: { PK: 'POST', SK: 'sk1', reactions: { like: [] } } };

    sendSpy
      .mockResolvedValueOnce(mockPost).mockRejectedValueOnce(conditionError)
      .mockResolvedValueOnce(mockPost).mockRejectedValueOnce(conditionError)
      .mockResolvedValueOnce(mockPost).mockRejectedValueOnce(conditionError);

    await expect(togglePostLike('POST' as PostType, 'sk1', 'user1'))
      .rejects.toThrow('Failed to toggle like after 3 retries');
  });

  it('reactions が存在しない投稿（レガシー）でも動作する', async () => {
    sendSpy
      .mockResolvedValueOnce({ Item: { PK: 'POST', SK: 'sk1' } }) // reactions なし
      .mockResolvedValueOnce({});

    const result = await togglePostLike('POST' as PostType, 'sk1', 'user1');
    expect(result).toBe(true);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx jest tests/utils/dynamodb.test.ts --no-coverage
```

期待: `togglePostLike is not a function` などのエラーで FAIL

- [ ] **Step 3: `src/utils/dynamodb.ts` に `togglePostLike` を追加し、旧関数を削除**

`addPostReaction` と `removePostReaction` を削除して以下に置き換える:

```typescript
// src/utils/dynamodb.ts — 既存の addPostReaction と removePostReaction を削除して追加

/**
 * like をトグル（楽観的ロック付き）。返り値は操作後の liked 状態。
 * ConditionalCheckFailedException 時は最大 3 回リトライ。
 */
export async function togglePostLike(
  type: PostType,
  sk: string,
  userId: string
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const post = await getPost(type, sk);
    if (!post) throw new Error('Post not found');

    const currentLikes = post.reactions?.like ?? [];
    const isLiked = currentLikes.includes(userId);
    const newLikes = isLiked
      ? currentLikes.filter(id => id !== userId)
      : [...currentLikes, userId];

    try {
      await docClient.send(new UpdateCommand({
        TableName: TABLES.familyPosts,
        Key: { PK: type, SK: sk },
        UpdateExpression: 'SET reactions.#like = :newLikes',
        ConditionExpression:
          'reactions.#like = :currentLikes OR attribute_not_exists(reactions.#like)',
        ExpressionAttributeNames: { '#like': 'like' },
        ExpressionAttributeValues: { ':newLikes': newLikes, ':currentLikes': currentLikes }
      }));
      return !isLiked;
    } catch (e: any) {
      if (e.name === 'ConditionalCheckFailedException' && attempt < 2) continue;
      throw e;
    }
  }
  throw new Error('Failed to toggle like after 3 retries');
}
```

importから `addPostReaction` と `removePostReaction` のエクスポートを削除すること。

- [ ] **Step 4: `src/handlers/post-save.ts` の reaction エンドポイントを `togglePostLike` に切り替え**

`post-save.ts` の以下の import を変更:

```typescript
// 変更前
import {
  createPost, getPost, updatePost, deletePost,
  addPostReaction, removePostReaction, addPostComment, getSystemConfig
} from '../utils/dynamodb';

// 変更後
import {
  createPost, getPost, updatePost, deletePost,
  togglePostLike, addPostComment, getSystemConfig
} from '../utils/dynamodb';
```

reaction エンドポイントの処理を変更:

```typescript
// 変更前
  if (method === 'POST' && path.includes('/reaction')) {
    const parsed = ReactionSchema.safeParse(JSON.parse(event.body || '{}'));
    if (!parsed.success) return err(parsed.error.issues[0].message);

    const { userId, type, sk } = parsed.data;
    const post = await getPost(type, sk);
    if (!post) return err('Post not found', 404);

    const isLiked = post.reactions?.like?.includes(userId);
    if (isLiked) {
      await removePostReaction(type, sk, userId);
    } else {
      await addPostReaction(type, sk, userId);
    }
    return ok({ liked: !isLiked });
  }

// 変更後
  if (method === 'POST' && path.includes('/reaction')) {
    const parsed = ReactionSchema.safeParse(JSON.parse(event.body || '{}'));
    if (!parsed.success) return err(parsed.error.issues[0].message);

    const { userId, type, sk } = parsed.data;
    try {
      const liked = await togglePostLike(type, sk, userId);
      return ok({ liked });
    } catch (e: any) {
      if (e.message === 'Post not found') return err('Post not found', 404);
      throw e;
    }
  }
```

- [ ] **Step 5: テストが通ることを確認**

```bash
npx jest tests/utils/dynamodb.test.ts --no-coverage
```

期待出力:
```
PASS tests/utils/dynamodb.test.ts
  togglePostLike
    ✓ liked でないとき userId を likes に追加して true を返す
    ✓ liked のとき userId を likes から削除して false を返す
    ✓ ConditionalCheckFailedException でリトライして成功する
    ✓ 3回リトライ失敗後に throw する
    ✓ reactions が存在しない投稿（レガシー）でも動作する
Tests: 5 passed
```

- [ ] **Step 6: ビルドが通ることを確認**

```bash
npm run build:check
```

- [ ] **Step 7: コミット**

```bash
git add src/utils/dynamodb.ts src/handlers/post-save.ts tests/utils/dynamodb.test.ts
git commit -m "fix: replace addPostReaction/removePostReaction with atomic togglePostLike"
```

---

### Task 3: `src/utils/reactions.ts` — chirol 共有ユーティリティ作成

`chirol-hitokoto.ts` と `chirol-image.ts` の like トグル・コメント追加・コメント削除の重複コードを統合する。`userName` のトリム・最大長制限もここで行う。

**Files:**
- Create: `src/utils/reactions.ts`
- Create: `tests/utils/reactions.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// tests/utils/reactions.test.ts
import { docClient } from '../../src/utils/dynamodb';
import { toggleLike, addComment, deleteComment } from '../../src/utils/reactions';

describe('reactions utility', () => {
  let sendSpy: jest.SpyInstance;

  beforeEach(() => {
    sendSpy = jest.spyOn(docClient, 'send' as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── toggleLike ──

  it('toggleLike: userId が未登録のとき追加して新リストを返す', async () => {
    sendSpy
      .mockResolvedValueOnce({ Item: { likes: ['user1'] } })
      .mockResolvedValueOnce({});

    const result = await toggleLike('Table', { PK: 'pk', SK: 'sk' }, 'user2');

    expect(result).toContain('user2');
    expect(result).toContain('user1');
  });

  it('toggleLike: userId が登録済みのとき削除して新リストを返す', async () => {
    sendSpy
      .mockResolvedValueOnce({ Item: { likes: ['user1', 'user2'] } })
      .mockResolvedValueOnce({});

    const result = await toggleLike('Table', { PK: 'pk', SK: 'sk' }, 'user1');

    expect(result).toEqual(['user2']);
  });

  it('toggleLike: likes が存在しない場合も動作する', async () => {
    sendSpy
      .mockResolvedValueOnce({ Item: {} })
      .mockResolvedValueOnce({});

    const result = await toggleLike('Table', { PK: 'pk', SK: 'sk' }, 'user1');

    expect(result).toEqual(['user1']);
  });

  it('toggleLike: ConditionalCheckFailedException でリトライして成功する', async () => {
    const condErr = Object.assign(new Error(), { name: 'ConditionalCheckFailedException' });
    sendSpy
      .mockResolvedValueOnce({ Item: { likes: [] } })
      .mockRejectedValueOnce(condErr)
      .mockResolvedValueOnce({ Item: { likes: [] } })
      .mockResolvedValueOnce({});

    await expect(toggleLike('Table', { PK: 'pk', SK: 'sk' }, 'u1')).resolves.toEqual(['u1']);
    expect(sendSpy).toHaveBeenCalledTimes(4);
  });

  it('toggleLike: Item が見つからない場合 throw する', async () => {
    sendSpy.mockResolvedValueOnce({ Item: undefined });

    await expect(toggleLike('Table', { PK: 'pk', SK: 'sk' }, 'u1'))
      .rejects.toThrow('Item not found');
  });

  // ── addComment ──

  it('addComment: コメントを追加して comment オブジェクトを返す', async () => {
    sendSpy.mockResolvedValueOnce({});

    const result = await addComment('Table', { PK: 'pk', SK: 'sk' }, {
      userId: 'u1',
      userName: '  Alice  ',
      text: 'hello'
    });

    expect(result.id).toMatch(/^c_/);
    expect(result.userId).toBe('u1');
    expect(result.userName).toBe('Alice'); // トリム済み
    expect(result.text).toBe('hello');
    expect(result.createdAt).toBeTruthy();
  });

  it('addComment: userName が 50 文字を超える場合は切り詰める', async () => {
    sendSpy.mockResolvedValueOnce({});

    const longName = 'A'.repeat(100);
    const result = await addComment('Table', { PK: 'pk', SK: 'sk' }, {
      userId: 'u1',
      userName: longName,
      text: 'hi'
    });

    expect(result.userName.length).toBeLessThanOrEqual(50);
  });

  it('addComment: userName が未指定でも空文字として保存される', async () => {
    sendSpy.mockResolvedValueOnce({});

    const result = await addComment('Table', { PK: 'pk', SK: 'sk' }, {
      userId: 'u1',
      userName: '',
      text: 'hi'
    });

    expect(result.userName).toBe('');
  });

  // ── deleteComment ──

  it('deleteComment: 指定 commentId を持つコメントを削除する', async () => {
    sendSpy
      .mockResolvedValueOnce({
        Item: {
          comments: [
            { id: 'c_1', text: 'first' },
            { id: 'c_2', text: 'second' }
          ]
        }
      })
      .mockResolvedValueOnce({});

    await deleteComment('Table', { PK: 'pk', SK: 'sk' }, 'c_1');

    const updateInput = (sendSpy.mock.calls[1][0] as any).input;
    expect(updateInput.ExpressionAttributeValues[':comments']).toEqual([
      { id: 'c_2', text: 'second' }
    ]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx jest tests/utils/reactions.test.ts --no-coverage
```

期待: `reactions.ts` が存在しないため FAIL

- [ ] **Step 3: `src/utils/reactions.ts` を作成**

```typescript
// src/utils/reactions.ts
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './dynamodb';

export interface ChirolComment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
}

/**
 * like をトグルし、更新後の likes 配列を返す。楽観的ロック付き（最大 3 回リトライ）。
 */
export async function toggleLike(
  tableName: string,
  key: Record<string, unknown>,
  userId: string
): Promise<string[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await docClient.send(new GetCommand({ TableName: tableName, Key: key }));
    if (!result.Item) throw new Error('Item not found');

    const currentLikes: string[] = result.Item.likes ?? [];
    const isLiked = currentLikes.includes(userId);
    const newLikes = isLiked
      ? currentLikes.filter(id => id !== userId)
      : [...currentLikes, userId];

    try {
      await docClient.send(new UpdateCommand({
        TableName: tableName,
        Key: key,
        UpdateExpression: 'SET likes = :newLikes',
        ConditionExpression: 'likes = :currentLikes OR attribute_not_exists(likes)',
        ExpressionAttributeValues: { ':newLikes': newLikes, ':currentLikes': currentLikes }
      }));
      return newLikes;
    } catch (e: any) {
      if (e.name === 'ConditionalCheckFailedException' && attempt < 2) continue;
      throw e;
    }
  }
  throw new Error('Failed to toggle like after 3 retries');
}

/**
 * コメントを追加して新 comment オブジェクトを返す。
 * userName はトリムして最大 50 文字に制限する。
 */
export async function addComment(
  tableName: string,
  key: Record<string, unknown>,
  params: { userId: string; userName: string; text: string }
): Promise<ChirolComment> {
  const comment: ChirolComment = {
    id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId: params.userId,
    userName: String(params.userName ?? '').trim().slice(0, 50),
    text: String(params.text).trim(),
    createdAt: new Date().toISOString()
  };

  await docClient.send(new UpdateCommand({
    TableName: tableName,
    Key: key,
    UpdateExpression: 'SET comments = list_append(if_not_exists(comments, :empty), :c)',
    ExpressionAttributeValues: { ':c': [comment], ':empty': [] }
  }));

  return comment;
}

/**
 * 指定 commentId のコメントを削除する。
 */
export async function deleteComment(
  tableName: string,
  key: Record<string, unknown>,
  commentId: string
): Promise<void> {
  const result = await docClient.send(new GetCommand({ TableName: tableName, Key: key }));
  if (!result.Item) throw new Error('Item not found');

  const comments = (result.Item.comments ?? []).filter(
    (c: { id: string }) => c.id !== commentId
  );

  await docClient.send(new UpdateCommand({
    TableName: tableName,
    Key: key,
    UpdateExpression: 'SET comments = :comments',
    ExpressionAttributeValues: { ':comments': comments }
  }));
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx jest tests/utils/reactions.test.ts --no-coverage
```

期待: 全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add src/utils/reactions.ts tests/utils/reactions.test.ts
git commit -m "feat: add reactions utility with optimistic locking for chirol handlers"
```

---

### Task 4: `chirol-image.ts` と `chirol-hitokoto.ts` を reactions utility に切り替え

**Files:**
- Modify: `src/handlers/chirol-image.ts`
- Modify: `src/handlers/chirol-hitokoto.ts`

- [ ] **Step 1: `chirol-image.ts` の like トグル・コメント追加・コメント削除を置き換え**

ファイル先頭の import に追加:

```typescript
import { toggleLike, addComment, deleteComment } from '../utils/reactions';
```

POST ハンドラー内の `// ── いいねトグル ──` ブロック（行 104–118 付近）を置き換え:

```typescript
    // ── いいねトグル ──
    if (body.action === 'like') {
      const { imageId, userId } = body;
      if (!imageId || !userId) return err('imageId と userId は必須です');
      const key = { PK: DB_KEYS.CHIROL, SK: `${DB_KEYS.IMAGE_PREFIX}${imageId}` };
      const existing = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: key }));
      if (!existing.Item) return err('Image not found', 404);
      const likes = await toggleLike(TABLE_NAME, key, String(userId));
      return ok({ likes });
    }
```

`// ── コメント追加 ──` ブロックを置き換え:

```typescript
    // ── コメント追加 ──
    if (body.action === 'addComment') {
      const { imageId, userId, userName, text } = body;
      if (!imageId || !userId || !text) return err('imageId, userId, text は必須です');
      const key = { PK: DB_KEYS.CHIROL, SK: `${DB_KEYS.IMAGE_PREFIX}${imageId}` };
      const existing = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: key }));
      if (!existing.Item) return err('Image not found', 404);
      const comment = await addComment(TABLE_NAME, key, { userId: String(userId), userName: String(userName ?? ''), text: String(text) });
      return ok({ comment });
    }
```

DELETE ハンドラー内の `// ── コメント削除 ──` ブロックを置き換え:

```typescript
    // ── コメント削除 ──
    if (body.commentId) {
      const { imageId, commentId } = body;
      if (!imageId) return err('imageId は必須です');
      const key = { PK: DB_KEYS.CHIROL, SK: `${DB_KEYS.IMAGE_PREFIX}${imageId}` };
      try {
        await deleteComment(TABLE_NAME, key, String(commentId));
      } catch {
        return err('Image not found', 404);
      }
      return ok({ success: true });
    }
```

不要になった import（`GetCommand` が like/comment 系で使われなくなった場合）を整理する。`GetCommand` は画像削除で引き続き使用するため残す。

- [ ] **Step 2: `chirol-hitokoto.ts` も同様に置き換え**

import に追加:

```typescript
import { toggleLike, addComment, deleteComment } from '../utils/reactions';
```

POST の `// ── いいねトグル ──` ブロック（行 58–73 付近）を置き換え:

```typescript
    // ── いいねトグル ──
    if (body.action === 'like') {
      const { hitokotoId, userId } = body;
      if (!hitokotoId || !userId) return err('hitokotoId と userId は必須です');
      const key = { PK: pk, SK: `${DB_KEYS.HITOKOTO_PREFIX}${hitokotoId}` };
      const existing = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: key }));
      if (!existing.Item) return err('Hitokoto not found', 404);
      const likes = await toggleLike(TABLE_NAME, key, String(userId));
      return ok({ likes });
    }
```

POST の `// ── コメント追加 ──` ブロックを置き換え:

```typescript
    // ── コメント追加 ──
    if (body.action === 'addComment') {
      const { hitokotoId, userId, userName, text } = body;
      if (!hitokotoId || !userId || !text) return err('hitokotoId, userId, text は必須です');
      const key = { PK: pk, SK: `${DB_KEYS.HITOKOTO_PREFIX}${hitokotoId}` };
      const existing = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: key }));
      if (!existing.Item) return err('Hitokoto not found', 404);
      const comment = await addComment(TABLE_NAME, key, { userId: String(userId), userName: String(userName ?? ''), text: String(text) });
      return ok({ comment });
    }
```

DELETE の `// ── コメント削除 ──` ブロックを置き換え:

```typescript
    // ── コメント削除 ──
    if (body.commentId) {
      const { hitokotoId, commentId } = body;
      if (!hitokotoId) return err('hitokotoId は必須です');
      const key = { PK: pk, SK: `${DB_KEYS.HITOKOTO_PREFIX}${hitokotoId}` };
      try {
        await deleteComment(TABLE_NAME, key, String(commentId));
      } catch {
        return err('Hitokoto not found', 404);
      }
      return ok({ success: true });
    }
```

- [ ] **Step 3: ビルド確認**

```bash
npm run build:check
```

- [ ] **Step 4: コミット**

```bash
git add src/handlers/chirol-image.ts src/handlers/chirol-hitokoto.ts
git commit -m "refactor: replace inline like/comment logic with shared reactions utility"
```

---

### Task 5: CORS オリジン修正 — `*` を S3 オリジンに変更

**Files:**
- Modify: `src/utils/handler.ts`
- Create: `tests/utils/handler.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// tests/utils/handler.test.ts
import { withHandler, ok, CORS_HEADERS } from '../../src/utils/handler';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const makeEvent = (method: string): APIGatewayProxyEvent =>
  ({ httpMethod: method, headers: {}, body: null, queryStringParameters: null, pathParameters: null } as any);

describe('CORS headers', () => {
  it('Access-Control-Allow-Origin が * でない', () => {
    expect(CORS_HEADERS['Access-Control-Allow-Origin']).not.toBe('*');
  });

  it('Access-Control-Allow-Origin が S3 ドメインを含む', () => {
    expect(CORS_HEADERS['Access-Control-Allow-Origin']).toContain('amazonaws.com');
  });

  it('OPTIONS プリフライトが 200 と CORS ヘッダーを返す', async () => {
    const handler = withHandler(async () => ok({ test: true }));
    const result = await handler(makeEvent('OPTIONS'), {} as any, () => {});
    expect(result?.statusCode).toBe(200);
    expect(result?.headers?.['Access-Control-Allow-Origin']).not.toBe('*');
  });

  it('通常レスポンスにも CORS ヘッダーが付く', async () => {
    const handler = withHandler(async () => ok({ test: true }));
    const result = await handler(makeEvent('GET'), {} as any, () => {});
    expect(result?.headers?.['Access-Control-Allow-Origin']).not.toBe('*');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx jest tests/utils/handler.test.ts --no-coverage
```

期待: `'*'` のため FAIL

- [ ] **Step 3: `src/utils/handler.ts` の CORS_HEADERS を修正**

```typescript
// src/utils/handler.ts — ファイル先頭に追加（import の後）

const ALLOWED_ORIGIN =
  process.env.ALLOWED_ORIGIN ||
  'https://family-schedule-web-kame-982312822872.s3.ap-northeast-1.amazonaws.com';

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};
```

`import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';` の既存 import はそのまま。

- [ ] **Step 4: テストが通ることを確認**

```bash
npx jest tests/utils/handler.test.ts --no-coverage
```

- [ ] **Step 5: コミット**

```bash
git add src/utils/handler.ts tests/utils/handler.test.ts
git commit -m "fix: restrict CORS origin from wildcard to S3 domain"
```

---

### Task 6: `post-get.ts` type パラメータのバリデーション追加

**Files:**
- Modify: `src/handlers/post-get.ts`
- Create: `tests/handlers/post-get.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// tests/handlers/post-get.test.ts
import { handler } from '../../src/handlers/post-get';
import type { APIGatewayProxyEvent } from 'aws-lambda';

jest.mock('../../src/utils/dynamodb', () => ({
  getPostsByType: jest.fn().mockResolvedValue({ posts: [], lastEvaluatedKey: undefined })
}));

const makeEvent = (params: Record<string, string> = {}): APIGatewayProxyEvent =>
  ({
    httpMethod: 'GET',
    queryStringParameters: params,
    headers: {},
    body: null,
    pathParameters: null
  } as any);

describe('GET /posts', () => {
  it('無効な type パラメータで 400 を返す', async () => {
    const result = await handler(makeEvent({ type: 'INVALID' }), {} as any, () => {});
    expect(result?.statusCode).toBe(400);
  });

  it('type=POST で 200 を返す', async () => {
    const result = await handler(makeEvent({ type: 'POST' }), {} as any, () => {});
    expect(result?.statusCode).toBe(200);
  });

  it('type=DIARY で 200 を返す', async () => {
    const result = await handler(makeEvent({ type: 'DIARY' }), {} as any, () => {});
    expect(result?.statusCode).toBe(200);
  });

  it('type=YOUSU で 200 を返す', async () => {
    const result = await handler(makeEvent({ type: 'YOUSU' }), {} as any, () => {});
    expect(result?.statusCode).toBe(200);
  });

  it('type 未指定のとき POST がデフォルトになり 200 を返す', async () => {
    const result = await handler(makeEvent(), {} as any, () => {});
    expect(result?.statusCode).toBe(200);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx jest tests/handlers/post-get.test.ts --no-coverage
```

期待: `INVALID` type が 200 を返してしまうため FAIL

- [ ] **Step 3: `src/handlers/post-get.ts` に Zod バリデーションを追加**

```typescript
// src/handlers/post-get.ts — 全文置き換え
import { z } from 'zod';
import type { PostType } from '../types';
import { getPostsByType } from '../utils/dynamodb';
import { withHandler, ok, err } from '../utils/handler';

const TypeSchema = z.enum(['POST', 'DIARY', 'YOUSU']);

export const handler = withHandler(async (event) => {
  const params = event.queryStringParameters || {};

  const rawType = params.type ?? 'POST';
  const typeParsed = TypeSchema.safeParse(rawType);
  if (!typeParsed.success) {
    return err('type は POST/DIARY/YOUSU のいずれかを指定してください');
  }
  const type: PostType = typeParsed.data;

  const limit = Math.min(parseInt(params.limit || '50', 10), 100);

  let lastEvaluatedKey: Record<string, unknown> | undefined;
  if (params.lastKey) {
    try {
      lastEvaluatedKey = JSON.parse(decodeURIComponent(params.lastKey));
    } catch {
      // 不正なキーは無視して先頭から取得
    }
  }

  const { posts: rawPosts, lastEvaluatedKey: nextKey } = await getPostsByType(
    type,
    limit,
    lastEvaluatedKey
  );

  const posts = rawPosts.map(post => ({
    ...post,
    reactions: post.reactions || { like: [] },
    comments: post.comments || []
  }));

  return ok({
    posts,
    ...(nextKey ? { lastEvaluatedKey: encodeURIComponent(JSON.stringify(nextKey)) } : {})
  });
});
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx jest tests/handlers/post-get.test.ts --no-coverage
```

- [ ] **Step 5: コミット**

```bash
git add src/handlers/post-get.ts tests/handlers/post-get.test.ts
git commit -m "fix: add Zod validation for type query parameter in post-get"
```

---

### Task 7: `getAllScheduleInputs` の ConsistentRead 修正

**Files:**
- Modify: `src/utils/dynamodb.ts`

- [ ] **Step 1: ConsistentRead: true を削除**

[src/utils/dynamodb.ts:57](src/utils/dynamodb.ts#L57) の `ConsistentRead: true` を削除する:

```typescript
// 変更前
export async function getAllScheduleInputs(weekId: string): Promise<ScheduleInput[]> {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.scheduleInputs,
    KeyConditionExpression: 'weekId = :weekId',
    ExpressionAttributeValues: { ':weekId': weekId },
    ConsistentRead: true  // ← この行を削除
  }));
  return (result.Items as ScheduleInput[]) || [];
}

// 変更後
export async function getAllScheduleInputs(weekId: string): Promise<ScheduleInput[]> {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.scheduleInputs,
    KeyConditionExpression: 'weekId = :weekId',
    ExpressionAttributeValues: { ':weekId': weekId }
  }));
  return (result.Items as ScheduleInput[]) || [];
}
```

- [ ] **Step 2: ビルド確認**

```bash
npm run build:check
```

- [ ] **Step 3: コミット**

```bash
git add src/utils/dynamodb.ts
git commit -m "perf: remove unnecessary ConsistentRead in getAllScheduleInputs"
```

---

## Phase 2: インフラ更新（SAM + Node.js 22 + OIDC）

---

### Task 8: Node.js 22 — esbuild ターゲット更新

> **注意:** Lambda ランタイムの変更（Task 10）より先に esbuild のターゲットだけ更新する。コードのみの変更なので現行 CI でデプロイ可能。

**Files:**
- Modify: `esbuild.config.js`

- [ ] **Step 1: `esbuild.config.js` のターゲットを node22 に変更**

```javascript
// esbuild.config.js — 変更箇所のみ
esbuild.build({
  // ...
  target: 'node22',   // 変更前: 'node20'
  // ...
});
```

- [ ] **Step 2: ビルドが通ることを確認**

```bash
npm run build
```

期待: `✓ Built 10 handlers → dist/handlers` と表示される

- [ ] **Step 3: コミット**

```bash
git add esbuild.config.js
git commit -m "chore: update esbuild target to node22"
```

---

### Task 9: SAM deploy 修復 — インフラをコードで管理

現在 Lambda/API Gateway は CloudFormation 管理外で直接作成されており、`sam deploy` が ResourceExistenceCheck エラーで失敗する。`--import-existing-resources` フラグで既存リソースを CloudFormation スタックに取り込む。

**前提条件:**
- AWS SAM CLI 1.100+ がインストール済み (`sam --version` で確認)
- AWS CLI の認証情報が設定済み（管理者権限）

**Files:**
- Modify: `template.yaml`（後の Task 10 でさらに更新）
- Modify: `.github/workflows/deploy.yml`（lambda 個別デプロイを sam deploy に置き換え）

- [ ] **Step 1: SAM CLI のバージョンを確認**

```bash
sam --version
```

期待: `SAM CLI, version 1.100.0` 以上。古い場合は `pip install --upgrade aws-sam-cli` で更新。

- [ ] **Step 2: `template.yaml` の `S3BucketName` パラメータを追加**

`Parameters:` セクションに追加（既存の `LineSecretName`, `FamilyUserIds` の後）:

```yaml
  S3BucketName:
    Type: String
    Default: family-schedule-web-kame-982312822872
    Description: S3 bucket name for the static website

  AdminUserId:
    Type: String
    Default: ""
    Description: LINE userId of the admin user (used by schedule-get for isAdmin check)
```

- [ ] **Step 3: `scripts/` ディレクトリに `samconfig.toml` を作成**

```toml
# samconfig.toml
version = 0.1

[default.deploy.parameters]
stack_name = "family-schedule-kame"
s3_prefix = "family-schedule-kame"
region = "ap-northeast-1"
capabilities = "CAPABILITY_IAM CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND"
resolve_s3 = true
```

- [ ] **Step 4: SAM deploy を `--import-existing-resources` で実行（ドライラン）**

```bash
sam deploy \
  --import-existing-resources \
  --no-execute-changeset \
  --config-file samconfig.toml \
  --parameter-overrides \
    "LineSecretName=line/credentials-kame" \
    "AdminUserId=<YOUR_ADMIN_USER_ID>"
```

`--no-execute-changeset` はチェンジセットを確認するだけで実際には適用しない。CloudFormation コンソールで changeset の内容を確認する。

> **確認ポイント:**
> - 既存 Lambda 関数が `IMPORT` アクションになっている（CREATE でないこと）
> - API Gateway が `IMPORT` アクションになっている
> - DLQ が `IMPORT` になっている
> - エラーなく changeset が作成されていること

- [ ] **Step 5: 問題がなければ changeset を実行**

```bash
sam deploy \
  --import-existing-resources \
  --config-file samconfig.toml \
  --parameter-overrides \
    "LineSecretName=line/credentials-kame" \
    "AdminUserId=<YOUR_ADMIN_USER_ID>"
```

- [ ] **Step 6: デプロイ後の動作確認**

```bash
# Lambda 関数が存在することを確認
aws lambda get-function --function-name family-schedule-webhook-kame --query 'Configuration.FunctionName'

# API Gateway エンドポイントが変わっていないことを確認
aws cloudformation describe-stacks \
  --stack-name family-schedule-kame \
  --query 'Stacks[0].Outputs[?OutputKey==`WebhookUrl`].OutputValue' \
  --output text
```

LINE webhook URL が変わっていないことを確認する（変わった場合は LINE Developers コンソールで更新が必要）。

- [ ] **Step 7: GitHub Actions ワークフローを SAM deploy に移行**

`.github/workflows/deploy.yml` の `Package & Deploy Lambda functions` ステップを以下に置き換え:

```yaml
      - name: Install SAM CLI
        run: pip install aws-sam-cli

      - name: Deploy with SAM
        run: |
          sam deploy \
            --config-file samconfig.toml \
            --parameter-overrides \
              "LineSecretName=line/credentials-kame" \
              "AdminUserId=${{ secrets.ADMIN_USER_ID }}" \
            --no-confirm-changeset \
            --no-fail-on-empty-changeset
```

> `secrets.ADMIN_USER_ID` は GitHub → Settings → Secrets に追加しておくこと。

- [ ] **Step 8: コミット**

```bash
git add samconfig.toml template.yaml .github/workflows/deploy.yml
git commit -m "infra: restore SAM deploy with --import-existing-resources"
```

---

### Task 10: `template.yaml` の環境変数・ランタイム・CORS 更新

SAM deploy が稼働するようになったので、Lambda 設定の変更をコードで管理できる。

**Files:**
- Modify: `template.yaml`
- Modify: `src/utils/constants.ts`

- [ ] **Step 1: `template.yaml` の Globals ランタイムと環境変数を更新**

`Globals:` セクションを以下に変更:

```yaml
Globals:
  Function:
    Runtime: nodejs22.x
    Timeout: 30
    MemorySize: 256
    Environment:
      Variables:
        LINE_SECRET_NAME: !Ref LineSecretName
        TABLE_SCHEDULE_INPUTS: ScheduleInputs-kame
        TABLE_SYSTEM_CONFIG: SystemConfig-kame
        TABLE_CHIROL_DATA: ChirolData-kame
        TABLE_FAMILY_POSTS: FamilyPosts-kame
        TABLE_WANNADE_RANKING: WannadeRanking-kame
        CHIROL_IMAGE_BUCKET: !Ref S3BucketName
        FAMILY_USER_IDS: !Ref FamilyUserIds
        S3_BASE_URL: !Sub 'https://${S3BucketName}.s3.ap-northeast-1.amazonaws.com'
        ALLOWED_ORIGIN: !Sub 'https://${S3BucketName}.s3.ap-northeast-1.amazonaws.com'
```

- [ ] **Step 2: `ScheduleGetFunction` に `ADMIN_USER_ID` を追加**

`ScheduleGetFunction` に Environment セクションを追加（Globals を上書き）:

```yaml
  ScheduleGetFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: family-schedule-get-kame
      CodeUri: ./
      Handler: handlers/schedule-get.handler
      Environment:
        Variables:
          ADMIN_USER_ID: !Ref AdminUserId
      Events:
        # ... 既存のまま
```

- [ ] **Step 3: API Gateway の CORS AllowOrigin を修正**

```yaml
  ApiGateway:
    Type: AWS::Serverless::Api
    Properties:
      StageName: prod
      Cors:
        AllowOrigin: !Sub "'https://${S3BucketName}.s3.ap-northeast-1.amazonaws.com'"
        AllowHeaders: "'Content-Type,Authorization,X-Line-Signature'"
        AllowMethods: "'GET,POST,PUT,DELETE,OPTIONS'"
```

- [ ] **Step 4: `src/utils/constants.ts` の S3_BASE_URL を env var に変更**

```typescript
// 変更前
export const S3_BASE_URL = 'https://family-schedule-web-kame-982312822872.s3.ap-northeast-1.amazonaws.com';

// 変更後
export const S3_BASE_URL =
  process.env.S3_BASE_URL ||
  'https://family-schedule-web-kame-982312822872.s3.ap-northeast-1.amazonaws.com';
```

- [ ] **Step 5: ビルド確認**

```bash
npm run build:check
```

- [ ] **Step 6: sam deploy で反映**

```bash
sam deploy \
  --config-file samconfig.toml \
  --parameter-overrides \
    "LineSecretName=line/credentials-kame" \
    "AdminUserId=<YOUR_ADMIN_USER_ID>" \
  --no-confirm-changeset
```

- [ ] **Step 7: Lambda の環境変数が更新されていることを確認**

```bash
aws lambda get-function-configuration \
  --function-name family-schedule-get-kame \
  --query 'Environment.Variables' \
  --output json
```

期待: `ADMIN_USER_ID`, `S3_BASE_URL`, `ALLOWED_ORIGIN` が含まれる

- [ ] **Step 8: コミット**

```bash
git add template.yaml src/utils/constants.ts
git commit -m "infra: add env vars (ALLOWED_ORIGIN, S3_BASE_URL, ADMIN_USER_ID), upgrade to nodejs22.x"
```

---

### Task 11: GitHub Actions — Node.js 22 + OIDC 認証

長期 IAM キーを廃止し、OIDC による短命トークンに切り替える。

**前提条件:** AWS アカウント ID は `982312822872`、GitHub リポジトリのオーナー/名を確認しておくこと。

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: AWS に GitHub Actions OIDC プロバイダーを作成（一度のみ）**

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

既に存在する場合はスキップ。

- [ ] **Step 2: IAM ロール用の trust policy ファイルを作成**

`<GITHUB_OWNER>` と `<REPO_NAME>` を実際の値（例: `mizuki-kame/schedule.app-1`）に置き換えて実行:

```bash
cat > /tmp/trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::982312822872:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:<GITHUB_OWNER>/<REPO_NAME>:*"
        }
      }
    }
  ]
}
EOF
```

- [ ] **Step 3: IAM ロールを作成**

```bash
aws iam create-role \
  --role-name github-actions-family-schedule-kame \
  --assume-role-policy-document file:///tmp/trust-policy.json
```

- [ ] **Step 4: ロールに必要なポリシーをアタッチ**

```bash
# S3 アクセス
aws iam attach-role-policy \
  --role-name github-actions-family-schedule-kame \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess

# SAM deploy 用（CloudFormation + Lambda + API Gateway + IAM）
aws iam attach-role-policy \
  --role-name github-actions-family-schedule-kame \
  --policy-arn arn:aws:iam::aws:policy/PowerUserAccess
```

> **注意:** `PowerUserAccess` は広めの権限。本番環境では必要な権限のみを持つカスタムポリシーに絞ることを推奨。

- [ ] **Step 5: `.github/workflows/deploy.yml` を OIDC + Node.js 22 に更新**

`jobs.deploy` の先頭に permissions を追加:

```yaml
jobs:
  deploy:
    name: Build & Deploy
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
```

`Setup Node.js` ステップの `node-version` を更新:

```yaml
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
```

`Configure AWS credentials` ステップを OIDC に切り替え:

```yaml
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::982312822872:role/github-actions-family-schedule-kame
          aws-region: ${{ env.AWS_REGION }}
```

`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` の環境変数を削除する（Node.js 22 に統一するため不要）。

- [ ] **Step 6: GitHub Secrets から古いキーを削除**

GitHub → リポジトリ → Settings → Secrets and variables → Actions で以下を削除:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

`ADMIN_USER_ID` シークレットを追加（LINE 管理者の userId）。

- [ ] **Step 7: main にプッシュして CI が通ることを確認**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: migrate to OIDC auth and Node.js 22"
git push origin main
```

GitHub Actions のログで OIDC 認証が成功し、デプロイが完了することを確認する。

---

## 全テストをまとめて実行

全タスク完了後:

```bash
npx jest --no-coverage
```

期待出力:
```
PASS tests/utils/dynamodb.test.ts
PASS tests/utils/reactions.test.ts
PASS tests/handlers/post-get.test.ts
PASS tests/utils/handler.test.ts

Test Suites: 4 passed, 4 total
Tests:       XX passed, XX total
```
