/**
 * Service Worker — 家族スケジュールアプリ v15
 *
 * キャッシュ戦略:
 *   HTML / JS / CSS / 画像 → Stale While Revalidate
 *     キャッシュがあれば即座に返し、バックグラウンドで最新を取得してキャッシュ更新。
 *     2回目以降のページ読み込みがほぼ瞬時になる。
 *
 *   API (execute-api.amazonaws.com) → Network First
 *     常に最新データを取得。失敗時のみキャッシュを使用。
 */

const CACHE_VERSION = 'v22';
const CACHE_NAME = `app-${CACHE_VERSION}`;

// インストール: 即座に有効化
self.addEventListener('install', () => {
  self.skipWaiting();
});

// アクティベート: 古いキャッシュを全削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// フェッチ
self.addEventListener('fetch', event => {
  const { request } = event;

  // GET 以外は素通し
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!url.protocol.startsWith('http')) return;

  // presigned URL 発行エンドポイントはキャッシュ禁止（有効期限 300 秒のため）
  if (url.pathname.includes('/chirol/upload-url')) {
    return; // Service Worker をバイパスしてブラウザに直接リクエストさせる
  }

  // API リクエストは Network First（常に最新データ）
  if (url.hostname.includes('execute-api.amazonaws.com')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 静的アセット・HTML は Stale While Revalidate（キャッシュ即返却 → バックグラウンド更新）
  event.respondWith(staleWhileRevalidate(request));
});

/**
 * Stale While Revalidate
 * キャッシュがあれば即座に返し、バックグラウンドでネットワークから更新する。
 * キャッシュがなければネットワークを待つ。
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  // バックグラウンドで最新を取得してキャッシュ更新（失敗しても無視）
  const networkFetch = fetch(request).then(response => {
    if (response.ok && response.type !== 'opaque') {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  // キャッシュヒット → 即座に返す（ネットワーク更新はバックグラウンドで継続）
  if (cached) return cached;

  // キャッシュミス → ネットワーク待ち
  const networkResponse = await networkFetch;
  if (networkResponse) return networkResponse;

  // オフラインでキャッシュもない場合
  if (request.destination === 'document') {
    return new Response('<h1>オフラインです</h1><p>ネットワーク接続を確認してください。</p>', {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
  return new Response('', { status: 503 });
}

/**
 * Network First（API 用）
 * ネットワークから取得し、失敗時のみキャッシュを使用。
 */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok && response.type !== 'opaque') {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached ?? new Response('', { status: 503 });
  }
}
