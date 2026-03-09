/**
 * Service Worker — 家族スケジュールアプリ
 *
 * キャッシュ戦略:
 * - 静的アセット (HTML/CSS/JS/画像): Cache First
 * - API リクエスト (/posts, /schedule): Network First、失敗時はキャッシュ
 */

const CACHE_VERSION = 'v3';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/home.html',
  '/dashboard.html',
  '/styles/base.css',
  '/styles/tabs/home.css',
  '/styles/tabs/tsubuyaki.css',
  '/styles/tabs/diary.css',
  '/styles/tabs/wansta.css',
  '/scripts/core/config.js',
  '/scripts/core/state.js',
  '/scripts/core/utils.js',
  '/scripts/core/account.js',
  '/scripts/routes.js',
];

// インストール: 静的アセットをキャッシュ
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// アクティベート: 古いキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== API_CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// フェッチ: リクエストに応じてキャッシュ戦略を切り替え
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // chrome-extension や non-http リクエストはスキップ
  if (!url.protocol.startsWith('http')) return;

  // API リクエスト: Network First（最新データ優先、オフライン時はキャッシュ）
  if (url.pathname.startsWith('/posts') || url.pathname.startsWith('/schedule')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 静的アセット: Cache First
  if (request.method === 'GET') {
    event.respondWith(cacheFirst(request));
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('オフラインです。キャッシュにデータがありません。', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'オフライン', posts: [], users: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
