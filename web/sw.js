/**
 * Service Worker — 家族スケジュールアプリ
 *
 * 方針: Network First を基本に、オフライン時のみキャッシュを使用。
 * キャッシュ問題を防ぐため、常にネットワークから最新を取得する。
 */

const CACHE_VERSION = 'v14';
const CACHE_NAME = `app-${CACHE_VERSION}`;

// インストール: 即座に有効化
self.addEventListener('install', () => {
  self.skipWaiting();
});

// アクティベート: 古いキャッシュを全て削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// フェッチ: 全てNetwork First
self.addEventListener('fetch', event => {
  const { request } = event;

  // GET以外は素通し
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type !== 'opaque') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // オフラインでキャッシュもない場合
    const url = new URL(request.url);
    if (url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname === '') {
      return new Response('<h1>オフラインです</h1><p>ネットワーク接続を確認してください。</p>', {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    return new Response('', { status: 503 });
  }
}
