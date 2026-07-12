// core/utils.js — Pure utility functions (副作用なし)

// ========== 日付ユーティリティ ==========

function getCalendarWeekId() {
  const now = new Date();
  const jstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const day = jstNow.getDay();
  // 日曜日は翌日の月曜＝来週を「今週」として扱う
  if (day === 0) {
    const nextMonday = new Date(jstNow);
    nextMonday.setDate(jstNow.getDate() + 1);
    return formatDateToWeekId(nextMonday);
  }
  const daysFromMonday = day - 1;
  const thisMonday = new Date(jstNow);
  thisMonday.setDate(jstNow.getDate() - daysFromMonday);
  return formatDateToWeekId(thisMonday);
}

function getNextWeekId() {
  const now = new Date();
  const jstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const day = jstNow.getDay();
  // 日曜日は翌週の月曜（+1日）のさらに次の月曜（+8日）を「来週」とする
  const daysUntilNextMonday = (day === 0) ? 8 : (8 - day);
  const nextMonday = new Date(jstNow);
  nextMonday.setDate(jstNow.getDate() + daysUntilNextMonday);
  return formatDateToWeekId(nextMonday);
}

function formatDateToWeekId(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekId(date) {
  const d = new Date(date);
  const day = d.getDay();
  const daysFromMonday = (day === 0) ? 6 : (day - 1);
  const monday = new Date(d);
  monday.setDate(d.getDate() - daysFromMonday);
  return formatDateToWeekId(monday);
}

function formatDateForApi(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekDateRange(weekId) {
  const monday = new Date(weekId + 'T00:00:00+09:00');
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday, sunday };
}

function generate7DaysFromMonday(weekId) {
  const dates = [];
  const [year, month, day] = weekId.split('-').map(Number);
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.UTC(year, month - 1, day + i));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${dd}`);
  }
  return dates;
}

function getDatesArray(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// ========== HTML/表示ユーティリティ ==========

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showError(containerId, message) {
  document.getElementById(containerId).innerHTML = `<div class="error">${message}</div>`;
}

function showToast(message, duration) {
  var existing = document.getElementById('appToast');
  if (existing) existing.remove();
  var toast = document.createElement('div');
  toast.id = 'appToast';
  toast.textContent = message;
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:10px 20px;border-radius:20px;font-size:14px;z-index:99999;transition:opacity 0.3s';
  document.body.appendChild(toast);
  setTimeout(function() { toast.style.opacity = '0'; setTimeout(function() { toast.remove(); }, 300); }, duration || 2000);
}

function formatRelativeTime(date) {
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return '今';
  if (diff < 3600) return Math.floor(diff / 60) + '分前';
  if (diff < 86400) return Math.floor(diff / 3600) + '時間前';
  if (diff < 604800) return Math.floor(diff / 86400) + '日前';
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// ========== ハッシュ/ランダム ==========

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function seededRandom(seed) {
  return function() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

// ========== 画像 S3 アップロード ==========

/**
 * base64 DataURL を Blob に変換
 */
function dataUrlToBlob(dataUrl) {
  var parts = dataUrl.split(',');
  var byteString = atob(parts[1]);
  var ab = new ArrayBuffer(byteString.length);
  var ia = new Uint8Array(ab);
  for (var i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: 'image/jpeg' });
}

/**
 * base64 DataURL を S3 にアップロードして URL を返す
 * @param {string} dataUrl - base64 DataURL
 * @param {string} tag - 'diary' | 'normal' | 'wansta-daizu' など
 * @returns {Promise<string>} S3 URL
 */
async function uploadImageToS3(dataUrl, tag) {
  tag = tag || 'diary';
  var urlData = await Api.getUploadUrl(tag, 'image/jpeg');

  var blob = dataUrlToBlob(dataUrl);
  await Api.upload(urlData.uploadUrl, blob, 'image/jpeg');

  return urlData.imageUrl;
}

// ========== 画像圧縮 ==========

function compressImage(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // 最大サイズを超える場合はリサイズ
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round(height * maxSize / width);
            width = maxSize;
          } else {
            width = Math.round(width * maxSize / height);
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // JPEG形式で圧縮
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ========== スケジュール送信共通関数 ==========
// home.js / home.schedule.js / schedule.js の重複 fetch を統一

/**
 * スケジュール送信（Api.submitScheduleの薄いラッパー）
 * 失敗時はErrorをthrow（従来どおり）。
 * 呼び出し元に res.ok で判定するコードが残っているため、
 * 戻り値は { ok: true } 互換のオブジェクトを返す（成功時は必ずthrowせず解決する）。
 * @param {object} body - { weekId, userId, displayName, slots, notes, skipNotification? }
 * @returns {Promise<{ok: true}>}
 */
async function submitScheduleData(body) {
  await Api.submitSchedule(body);
  return { ok: true };
}

// ========== SWR(Stale-While-Revalidate)キャッシュ ==========
// GET APIのレスポンスをlocalStorageに保存し、2回目以降は即キャッシュを返しつつ
// 裏で最新を取得する。タブ切替のたびにLambdaの応答を待たなくて済むようにする。

var SWR_PREFIX = 'swrCache:';

function _swrRead(url) {
  try {
    var entry = JSON.parse(localStorage.getItem(SWR_PREFIX + url) || 'null');
    return (entry && entry.data !== undefined) ? entry : null;
  } catch (e) { return null; }
}

function _swrWrite(url, data) {
  try {
    localStorage.setItem(SWR_PREFIX + url, JSON.stringify({ t: Date.now(), data: data }));
  } catch (e) {
    // 容量オーバー時はSWRキャッシュを全部消して身軽にする（次回から再構築）
    try {
      Object.keys(localStorage).forEach(function(k) {
        if (k.indexOf(SWR_PREFIX) === 0) localStorage.removeItem(k);
      });
    } catch (e2) { /* 無視 */ }
  }
}

/**
 * GET JSON を SWR で取得する。
 * - キャッシュあり → 即返す。裏で再取得し、内容が変わっていれば onFresh(freshData) を呼ぶ
 * - キャッシュなし → ネットワークを待って返す（従来どおり）
 * - opts.force  → キャッシュを無視してネットワークを待つ（保存直後の再読込用）
 *
 * 注意: onFresh の中から自分自身（swrJson を呼ぶ読み込み関数）を再帰的に
 * 呼び戻さないこと。レスポンスが毎回微妙に変わるAPIで無限ループになる。
 * onFresh では「データ反映＋再描画」だけを行う。
 *
 * @param {object} [opts]
 * @param {function(string): Promise<Response>} [opts.fetchFn] - fetch の代わりに使う関数
 *   （認証ヘッダー付与や401リトライなど、呼び出し元固有の挙動を注入するため）。
 *   未指定時は fetch(url, { headers: opts.headers }) を使う。
 */
async function swrJson(url, onFresh, opts) {
  opts = opts || {};
  var doFetch = opts.fetchFn || function(u) { return fetch(u, { headers: (opts.headers || {}) }); };
  var cached = opts.force ? null : _swrRead(url);
  var network = doFetch(url).then(function(res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }).then(function(data) {
    _swrWrite(url, data);
    return data;
  });
  if (cached) {
    network.then(function(data) {
      if (onFresh && JSON.stringify(data) !== JSON.stringify(cached.data)) onFresh(data);
    }).catch(function() { /* 裏の更新失敗は無視（キャッシュ表示を維持） */ });
    return cached.data;
  }
  return network;
}

// ========== プリウォーム（先読み） ==========
// ページ表示が落ち着いたあと、他タブのデータを裏で取得しておく。
// SWRキャッシュが温まる＋Lambdaのコールドスタートも解消され、タブ切替が速くなる。

function prewarmAppData() {
  setTimeout(function() {
    try {
      var noop = function() { /* 先読み失敗は無視 */ };
      Api.getPosts('?type=YOUSU&limit=50').catch(noop);
      Api.getPosts('?type=DIARY&limit=50').catch(noop);
      Api.getWeek(getWeekId(new Date())).catch(noop);
      Api.getChirolImages().catch(noop);
      Api.getHitokoto('chirol').catch(noop);
      Api.getHitokoto('daizu').catch(noop);
      Api.get(AppConfig.API.WANNADE).catch(noop);
      Api.getAccounts().catch(noop);
    } catch (e) { /* 無視 */ }
  }, 2000);
}
