// ========== ホームお知らせティッカー（Task22） ==========
// 依存: core/state.js(familyMembers) / core/account.js(getDisplayName) / core/utils.js(formatRelativeTime)
//   / core/api.js(Api.getPosts / getChirolImages / getHitokoto) / dashboard.page.js(switchTab)
// initHomeTab() から呼ばれる（home.js）。
//
// 直近3日以内に増えた更新（日記・様子・チロル画像・一言）を新しい順に最大10件集め、
// #homeTicker 内で1件ずつフェードイン→約3秒表示→フェードアウトでループ表示する。
// 更新が0件のときは行ごと非表示（display:none。.home-container の gap にも乗らないため高さ0）。
// prefers-reduced-motion: 先頭1件のみ静的表示（ループしない）。
// タップで該当タブへ switchTab()。取得失敗は静かに非表示のまま（console.errorのみ）。

var HOME_TICKER_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 直近3日以内
var HOME_TICKER_MAX_ITEMS = 10;
var HOME_TICKER_DISPLAY_MS = 3000; // 1件あたりの表示間隔
var HOME_TICKER_FADE_MS = 400;     // フェードイン/アウト時間（CSS transitionと一致させる）

var homeTickerIntervalId = null;
var homeTickerItems = [];
var homeTickerIndex = 0;

// 投稿の表示名（サーバー設定 > displayNameフォールバック。diary.js/yousu.jsと同じ優先順位）
function homeTickerAuthorName(post) {
  var member = familyMembers.find(function(m) { return m.userId === post.userId; });
  var name = member ? getDisplayName(member) : post.displayName;
  return name || '誰か';
}

// 4つのデータ源から「3日以内」のイベントだけを集め、新しい順に最大10件へ整形
function homeTickerCollect(diaryPosts, yousuPosts, chirolImages, chirolHitokoto, daizuHitokoto) {
  var cutoff = Date.now() - HOME_TICKER_WINDOW_MS;
  var raw = [];

  var pushIfRecent = function(createdAt, tab, text) {
    if (!createdAt) return;
    var ts = new Date(createdAt).getTime();
    if (!isFinite(ts) || ts < cutoff) return;
    raw.push({ ts: ts, tab: tab, text: text });
  };

  (diaryPosts || []).forEach(function(post) {
    pushIfRecent(post.createdAt, 'diary', homeTickerAuthorName(post) + 'さんが日記を書きました');
  });
  (yousuPosts || []).forEach(function(post) {
    pushIfRecent(post.createdAt, 'yousu', homeTickerAuthorName(post) + 'さんが様子を記録しました');
  });
  (chirolImages || []).forEach(function(img) {
    if (img.tag === 'diary') return; // 日記の挿入写真はWANsta更新として扱わない（wansta.jsの分類と揃える）
    pushIfRecent(img.createdAt, 'wansta', '写真が追加されました');
  });
  (chirolHitokoto || []).forEach(function(h) {
    pushIfRecent(h.createdAt, 'wansta', 'チロルの一言が増えました');
  });
  (daizuHitokoto || []).forEach(function(h) {
    pushIfRecent(h.createdAt, 'wansta', 'だいずの一言が増えました');
  });

  raw.sort(function(a, b) { return b.ts - a.ts; });

  return raw.slice(0, HOME_TICKER_MAX_ITEMS).map(function(item) {
    return { tab: item.tab, text: item.text + '（' + formatRelativeTime(new Date(item.ts)) + '）' };
  });
}

function homeTickerPrefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function homeTickerStop() {
  if (homeTickerIntervalId) {
    clearInterval(homeTickerIntervalId);
    homeTickerIntervalId = null;
  }
}

// index番目の内容をボタンに反映（テキスト＋タップ時の遷移先）
function homeTickerApply(index) {
  var el = document.getElementById('homeTicker');
  var textEl = document.getElementById('homeTickerText');
  var item = homeTickerItems[index];
  if (!el || !textEl || !item) return;
  textEl.textContent = item.text; // textContentなので escapeHtml 不要（表示名にHTML特殊文字が含まれても安全）
  el.onclick = function() { switchTab(item.tab); };
}

function homeTickerShowNext() {
  var textEl = document.getElementById('homeTickerText');
  if (!textEl || homeTickerItems.length === 0) return;
  textEl.classList.add('fade-out');
  setTimeout(function() {
    homeTickerIndex = (homeTickerIndex + 1) % homeTickerItems.length;
    homeTickerApply(homeTickerIndex);
    textEl.classList.remove('fade-out');
  }, HOME_TICKER_FADE_MS);
}

// 表示/ループの起動（再入時に二重タイマーが走らないよう毎回まずstop）
function homeTickerRotate() {
  homeTickerStop();
  var el = document.getElementById('homeTicker');
  var textEl = document.getElementById('homeTickerText');
  if (!el || !textEl) return;

  if (homeTickerItems.length === 0) {
    el.style.display = 'none';
    el.onclick = null;
    return;
  }

  el.style.display = '';
  homeTickerIndex = 0;
  textEl.classList.remove('fade-out');
  homeTickerApply(0);

  // 1件のみ、またはprefers-reduced-motion時は先頭1件を静的表示（ループしない）
  if (homeTickerItems.length <= 1 || homeTickerPrefersReducedMotion()) return;

  homeTickerIntervalId = setInterval(homeTickerShowNext, HOME_TICKER_DISPLAY_MS);
}

// データ取得（SWR: キャッシュ即表示→裏で最新化されたら再集計）
async function renderHomeTicker() {
  var el = document.getElementById('homeTicker');
  if (!el) return;

  var diaryPosts = null, yousuPosts = null, chirolImages = null, chirolHitokoto = null, daizuHitokoto = null;

  var rebuild = function() {
    homeTickerItems = homeTickerCollect(
      (diaryPosts && diaryPosts.posts) || [],
      (yousuPosts && yousuPosts.posts) || [],
      (chirolImages && chirolImages.images) || [],
      (chirolHitokoto && chirolHitokoto.hitokotoList) || [],
      (daizuHitokoto && daizuHitokoto.hitokotoList) || []
    );
    homeTickerRotate();
  };

  var results = await Promise.allSettled([
    Api.getPosts('?type=DIARY&limit=50', function(fresh) { diaryPosts = fresh; rebuild(); }),
    Api.getPosts('?type=YOUSU&limit=50', function(fresh) { yousuPosts = fresh; rebuild(); }),
    Api.getChirolImages(function(fresh) { chirolImages = fresh; rebuild(); }),
    Api.getHitokoto('chirol', function(fresh) { chirolHitokoto = fresh; rebuild(); }),
    Api.getHitokoto('daizu', function(fresh) { daizuHitokoto = fresh; rebuild(); })
  ]);

  if (results[0].status === 'fulfilled') diaryPosts = results[0].value;
  else console.error('Failed to load home ticker diary posts:', results[0].reason);
  if (results[1].status === 'fulfilled') yousuPosts = results[1].value;
  else console.error('Failed to load home ticker yousu posts:', results[1].reason);
  if (results[2].status === 'fulfilled') chirolImages = results[2].value;
  else console.error('Failed to load home ticker chirol images:', results[2].reason);
  if (results[3].status === 'fulfilled') chirolHitokoto = results[3].value;
  else console.error('Failed to load home ticker chirol hitokoto:', results[3].reason);
  if (results[4].status === 'fulfilled') daizuHitokoto = results[4].value;
  else console.error('Failed to load home ticker daizu hitokoto:', results[4].reason);

  rebuild();
}
