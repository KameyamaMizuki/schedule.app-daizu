// ========== ホームタブ — コントローラー ==========
// 依存読み込み順（dashboard.bundle.js内）: routes.js → core/state.js → core/utils.js → home.js(本ファイル)
//   → home.walk.js → home.daizu-liff.js → dashboard.page.js（homeタブ表示時に initHomeTab() を呼ぶ）
//
// このファイルが担う責務（ホーム画面は4ブロック構成）:
//   - データ読み込み (loadChirolImagesFromDB / loadHitokotoFromDB)
//   - 共有状態変数 (homeExpression / homeHitokotoList)
//   - 初期化 (initHomeTab)
//   - ①チロル円形写真+吹き出し (updateHomeTodayInfo / homeGetTodayPerson /
//     homeSetRandomDogImage / homeChangeDogImage / homeSetSpeechText / homeDogTapped)
//   - ③今週のよていサマリーカード (renderHomeScheduleSummary)
//   - ④きょうのだいずカード (renderHomeDaizuCard)
// おさんぽ日和カード（②）は home.walk.js の renderWalkCard() が #walkCard に描画する。
// home.daizu-liff.js は ?mode=daizu の独立LIFFフォームで本ファイルとは無関係に動作する。

// ========== データ読み込み ==========

// DynamoDBから追加された画像を読み込み
async function loadChirolImagesFromDB() {
  try {
    // SWR: 2回目以降はキャッシュ即返し（このページ表示中の追記は1回だけなのでonFresh不要）
    const data = await Api.getChirolImages();
    {
      if (data.images && data.images.length > 0) {
        for (const img of data.images) {
          // 有効なURL以外はスキップ（絵文字等を除外）
          if (!img.url || !img.url.startsWith('http')) continue;
          const tag = img.tag || 'normal';
          if (homeDogImages[tag]) {
            homeDogImages[tag].push(img.url);
          }
        }
      }
    }
  } catch (e) {
    console.error('Failed to load chirol images from DB:', e);
  }
}

// オレの一言リスト（デフォルト + DynamoDBから取得分）
let homeHitokotoList = [...AppConfig.CHIROL_HITOKOTO_TEXTS];

// DynamoDBから追加された一言を読み込み
async function loadHitokotoFromDB() {
  try {
    const data = await Api.getHitokoto();
    {
      if (data.hitokotoList && data.hitokotoList.length > 0) {
        // テキストが有効なもののみ追加（絵文字のみ、空文字などを除外）
        const dbTexts = data.hitokotoList
          .map(h => h.text)
          .filter(text => text && text.length > 1 && /[ぁ-んァ-ンー一-龥a-zA-Z0-9]/.test(text));
        homeHitokotoList = [...homeHitokotoList, ...dbTexts];
      }
    }
  } catch (e) {
    console.error('Failed to load hitokoto from DB:', e);
  }
}

// ========== 共有状態変数 ==========

let homeExpression = 'normal';
let homeDogTapBusy = false; // 一言表示中の連打防止

// ========== 初期化 ==========

function initHomeTab() {
  updateHomeTodayInfo();
  homeSetRandomDogImage('normal');
  if (typeof renderWalkCard === 'function') renderWalkCard(); // おさんぽ日和(Task17, home.walk.js) — 失敗時は静かに非表示なのでawait不要
  renderHomeScheduleSummary();
  renderHomeDaizuCard();
  if (typeof renderHomeTicker === 'function') renderHomeTicker(); // お知らせティッカー(Task22, home.ticker.js) — 失敗時は静かに非表示なのでawait不要
  // 一言・犬画像は初期表示に不要なので遅延読み込み（Lambdaコールドスタートの競合を避ける）
  setTimeout(function() {
    loadHitokotoFromDB();
    loadChirolImagesFromDB();
  }, 800);
}

// ========== ①今日情報（チロルの吹き出し） ==========

async function updateHomeTodayInfo() {
  const now = new Date();
  const dayNames = AppConfig.SCHEDULE.DAYS;
  const todayStr = `${now.getMonth() + 1}/${now.getDate()}(${dayNames[now.getDay()]})`;
  const todayDateEl = document.getElementById('homeTodayDate');
  if (todayDateEl) todayDateEl.textContent = todayStr;
  const dateStr = formatDateForApi(now);

  // SWR: キャッシュで即表示→裏で最新化されたら差し替え
  // 要素はIDで毎回引き直す（吹き出しが再描画されるため）
  const applyPerson = function(data) {
    const el = document.getElementById('homeTodayPerson');
    if (!el) return;
    const person = data ? homeGetTodayPerson(data, dateStr) : null;
    el.textContent = person || '未定';
  };
  try {
    const weekId = getWeekId(now);
    const data = await Api.getWeek(weekId, applyPerson);
    applyPerson(data);
  } catch (e) {
    console.error('Failed to load today info:', e);
    applyPerson(null);
  }
}

function homeGetTodayPerson(data, dateStr) {
  const timeSlots = AppConfig.SCHEDULE.SLOTS;
  const timeLabels = { allday: '終日', '09': '9時〜', '17': '17時〜', '21': '21時〜', '24': '24時〜' };
  const assignments = [];
  for (const user of data.users || []) {
    const userSlots = [];
    for (const slot of timeSlots) {
      const key = `${dateStr}:${slot}`;
      if (user.slots && user.slots[key]) userSlots.push(slot);
    }
    if (userSlots.length > 0) assignments.push({ name: getDisplayNameByUserId(user.userId) || user.displayName, slots: userSlots });
  }
  if (assignments.length === 0) return null;
  const allAllday = assignments.every(a => a.slots.includes('allday') && a.slots.length === 1);
  if (allAllday) return `${assignments.map(a => a.name).join('と')}（終日）`;
  return assignments.map(a => {
    if (a.slots.includes('allday')) return a.name;
    return `${a.name}（${timeLabels[a.slots[0]]}）`;
  }).join('と');
}

// ========== ①チロル画像・吹き出し ==========

function homeSetRandomDogImage(expression) {
  const images = homeDogImages[expression];
  const img = images[Math.floor(Math.random() * images.length)];
  homeChangeDogImage(img, expression);
}

function homeChangeDogImage(src, expression) {
  const dogImg = document.getElementById('homeDogImage');
  if (!dogImg) return;
  if (homeExpression === expression && dogImg.src.includes(src)) return;
  // 新しい画像をプリロード
  const preload = new Image();
  preload.src = src;
  preload.onload = () => {
    dogImg.classList.add('fade-out');
    setTimeout(() => {
      dogImg.src = src;
      homeExpression = expression;
      dogImg.classList.remove('fade-out');
    }, AppConfig.TIMING.DOG_FADE);
  };
  preload.onerror = () => {
    // プリロード失敗時は確実に存在する画像を使用
    const fallbackSrc = AppConfig.DOG_IMAGES.CHIROL_AVATAR;
    dogImg.src = fallbackSrc;
    homeExpression = 'normal';
  };
}

function homeSetSpeechText(text, onDone) {
  const bubble = document.getElementById('homeSpeechBubble');
  const textEl = document.getElementById('homeSpeechText');
  if (bubble && textEl) {
    bubble.classList.add('fade-out');
    setTimeout(() => {
      textEl.innerHTML = text;
      bubble.classList.remove('fade-out');
      if (onDone) onDone();
    }, AppConfig.TIMING.DOG_FADE);
  }
}

// 日付+担当の吹き出しテキストに戻す（HTML片を毎回作り直す＝span要素の再取得に対応）
function homeSpeechDefaultHtml() {
  const now = new Date();
  const dayNames = AppConfig.SCHEDULE.DAYS;
  const todayStr = `${now.getMonth() + 1}/${now.getDate()}(${dayNames[now.getDay()]})`;
  return `今日は <span class="highlight" id="homeTodayDate">${todayStr}</span> ！<br>担当は <span class="highlight" id="homeTodayPerson">-</span>だぜ！`;
}

// 犬の画像タップで一言表示 → 3秒後に日付+担当表示へ戻る
// T16刷新でここから homeSetRandomDogImage() 呼び出しが漏れ、吹き出しは変わるが写真が変わらない回帰が発生していた（Task20で復元）
function homeDogTapped() {
  if (homeDogTapBusy) return;
  homeDogTapBusy = true;
  const hitokoto = homeHitokotoList[Math.floor(Math.random() * homeHitokotoList.length)];
  homeSetRandomDogImage('normal');
  // hitokoto はDB由来の未検証テキストをそのままinnerHTMLに渡すためescapeHtml必須
  // （wansta.jsのrenderWanstaHitokotoも同じhitokotoデータをescapeHtml(item.text)で描画している＝踏襲）
  homeSetSpeechText(escapeHtml(hitokoto));
  setTimeout(() => {
    homeSetRandomDogImage('normal');
    homeSetSpeechText(homeSpeechDefaultHtml(), updateHomeTodayInfo);
    homeDogTapBusy = false;
  }, AppConfig.TIMING.MSG_DISPLAY);
}

// ========== ③今週のよていサマリーカード ==========
// きょう・あすの「担当」を homeGetTodayPerson と同じロジックで要約表示。
// [T33] タップするとカード直下に「きょう」の全員×時間帯(終日/9/17/21/24)詳細を
// ◯✕グリッドで展開表示し、再タップで収納する（以前はタップで予定タブへ遷移していた）。
// 展開内には引き続き予定タブへのリンクを残す。展開/収納は home.walk.js の
// toggleWalkPanel と同じ実装パターン(hidden属性 + aria-expanded + max-height/opacityの
// トランジション + prefers-reduced-motion時は即時切替 + transitionend未発火環境向けの
// setTimeoutフォールバック)。詳細グリッドは schedule-weekview.js の wv-grid/wv-cell を
// そのまま流用(同じdashboard.bundle.cssに含まれるため追加CSSなしで見た目を統一できる)。

let homeScheduleTodayData = null;
let homeScheduleTodayStr = '';
let homeScheduleExpanded = false;

async function renderHomeScheduleSummary() {
  const body = document.getElementById('homeScheduleSummaryBody');
  if (!body) return;

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const todayStr = formatDateForApi(now);
  const tomorrowStr = formatDateForApi(tomorrow);
  const todayWeekId = getWeekId(now);
  const tomorrowWeekId = getWeekId(tomorrow);
  const sameWeek = todayWeekId === tomorrowWeekId;

  homeScheduleTodayStr = todayStr;
  let todayData = null;
  let tomorrowData = null;

  const paint = function() {
    const todayPerson = todayData ? homeGetTodayPerson(todayData, todayStr) : null;
    const tomorrowPerson = tomorrowData ? homeGetTodayPerson(tomorrowData, tomorrowStr) : null;
    body.innerHTML =
      '<div class="home-summary-row"><span class="home-summary-label">きょう</span><span class="home-summary-value">' + escapeHtml(todayPerson || '未定') + '</span></div>' +
      '<div class="home-summary-row"><span class="home-summary-label">あす</span><span class="home-summary-value">' + escapeHtml(tomorrowPerson || '未定') + '</span></div>';
    homeScheduleTodayData = todayData;
    if (homeScheduleExpanded) renderHomeSchedulePanel(); // 展開中にSWRで最新化されたら詳細グリッドも更新
  };

  try {
    todayData = await Api.getWeek(todayWeekId, function(fresh) {
      todayData = fresh;
      if (sameWeek) tomorrowData = fresh;
      paint();
    });
    if (sameWeek) {
      tomorrowData = todayData;
    } else {
      tomorrowData = await Api.getWeek(tomorrowWeekId, function(fresh) {
        tomorrowData = fresh;
        paint();
      });
    }
    paint();
  } catch (e) {
    console.error('Failed to load home schedule summary:', e);
    body.innerHTML = '<div class="home-summary-row"><span class="home-summary-value">読み込みに失敗しました</span></div>';
  }
}

function homeScheduleReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/** きょうの全員×時間帯(終日/9/17/21/24)を◯/✕グリッドで表示するHTML(wv-grid/wv-cellを流用) + 予定タブへのリンク */
function buildHomeScheduleDetailHtml() {
  const data = homeScheduleTodayData;
  const dateStr = homeScheduleTodayStr;
  const linkHtml = '<button type="button" class="home-detail-link" onclick="switchTab(\'schedule\')">予定タブで詳しく <i class="ph-bold ph-arrow-right"></i></button>';
  if (!data || !data.users || data.users.length === 0) {
    return '<div class="home-summary-row"><span class="home-summary-value">読み込み中…</span></div>' + linkHtml;
  }
  const timeSlots = AppConfig.SCHEDULE.SLOTS;
  const timeLabels = AppConfig.SCHEDULE.LABEL_MAP;
  let html = '<div class="wv-grid home-detail-grid">';
  html += '<div class="wv-grid-cell wv-grid-head"></div>';
  data.users.forEach(function(user) {
    const name = getDisplayNameByUserId(user.userId) || user.displayName;
    html += '<div class="wv-grid-cell wv-grid-head">' + escapeHtml(name) + '</div>';
  });
  timeSlots.forEach(function(slot) {
    html += '<div class="wv-grid-cell wv-slot-label">' + timeLabels[slot] + '</div>';
    data.users.forEach(function(user) {
      const key = dateStr + ':' + slot;
      const on = !!(user.slots && user.slots[key]);
      html += '<div class="wv-grid-cell wv-cell ' + (on ? 'on' : 'off') + '">' + (on ? '◯' : '✕') + '</div>';
    });
  });
  html += '</div>';
  return html + linkHtml;
}

function renderHomeSchedulePanel() {
  const panel = document.getElementById('homeScheduleSummaryPanel');
  if (!panel) return;
  panel.innerHTML = buildHomeScheduleDetailHtml();
}

function toggleHomeScheduleSummary() {
  const card = document.getElementById('homeScheduleSummaryCard');
  const panel = document.getElementById('homeScheduleSummaryPanel');
  if (!card || !panel) return;
  if (homeScheduleExpanded) {
    collapseHomeSchedulePanel(panel);
    homeScheduleExpanded = false;
  } else {
    renderHomeSchedulePanel();
    expandHomeSchedulePanel(panel);
    homeScheduleExpanded = true;
  }
  card.setAttribute('aria-expanded', homeScheduleExpanded ? 'true' : 'false');
}

function expandHomeSchedulePanel(panel) {
  panel.hidden = false;
  if (homeScheduleReducedMotion()) {
    panel.style.transition = 'none';
    panel.style.maxHeight = 'none';
    panel.style.opacity = '1';
    return;
  }
  panel.style.maxHeight = '0px';
  panel.style.opacity = '0';
  void panel.offsetHeight; // reflow
  const target = panel.scrollHeight;
  // rAFはバックグラウンドタブ/一部のheadless実行環境で発火しないことがあるため、
  // setTimeoutで次ティックに回して確実にトランジションを開始させる(home.walk.js踏襲)。
  setTimeout(function() {
    panel.style.maxHeight = target + 'px';
    panel.style.opacity = '1';
  }, 16);
  const finish = function() {
    panel.style.maxHeight = 'none'; // 以後のリフロー(向き変更等)でも切れないように
    panel.removeEventListener('transitionend', onEnd);
    clearTimeout(fallback);
  };
  const onEnd = function(e) { if (e.target === panel && e.propertyName === 'max-height') finish(); };
  panel.addEventListener('transitionend', onEnd);
  const fallback = setTimeout(finish, 600); // transitionendが発火しない環境向けの保険
}

function collapseHomeSchedulePanel(panel) {
  if (homeScheduleReducedMotion()) {
    panel.style.transition = 'none';
    panel.style.maxHeight = '0px';
    panel.style.opacity = '0';
    panel.hidden = true;
    return;
  }
  const current = panel.scrollHeight;
  panel.style.maxHeight = current + 'px';
  void panel.offsetHeight; // reflow
  setTimeout(function() {
    panel.style.maxHeight = '0px';
    panel.style.opacity = '0';
  }, 16);
  const finish = function() {
    panel.hidden = true;
    panel.removeEventListener('transitionend', onEnd);
    clearTimeout(fallback);
  };
  const onEnd = function(e) { if (e.target === panel && e.propertyName === 'max-height') finish(); };
  panel.addEventListener('transitionend', onEnd);
  const fallback = setTimeout(finish, 600); // transitionendが発火しない環境向けの保険
}

// ========== ④きょうのだいずカード ==========
// 当日(JST)のYOUSU最新1件(サムネ+時刻+冒頭) + 当日(JST)のDIARYをタイトル中心の
// コンパクト行で表示。YOUSU行タップで様子タブ、DIARY行タップで日記タブへ（T34）。
// [T29] 旧実装は posts[0](=最新1件)を日付無視で表示しており、昨日以前の投稿しか
// なくてもそれが表示され続けるバグがあった。当日(JST)のものだけを対象にする。

// createdAt(UTC ISO文字列)をJST日付文字列(yyyy-mm-dd)に変換
function homeJstDateStr(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.getUTCFullYear() + '-' + String(jst.getUTCMonth() + 1).padStart(2, '0') + '-' + String(jst.getUTCDate()).padStart(2, '0');
}

// 「今日」をJSTのyyyy-mm-ddで返す
function homeTodayJstStr() {
  const jstNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  return formatDateForApi(jstNow);
}

// タグ除去した先頭maxLen字の抜粋（DOMParserで解析=inert。diary.js の diaryExtractExcerpt と同じ方式。
// 本文HTMLは実体参照済み(&lt;等)のため、textContent経由でデコードしてから返さないと
// 表示時のescapeHtmlで二重エスケープされ「&lt;」のようにそのまま出てしまう）
function homeStripTagsExcerpt(html, maxLen) {
  if (!html) return '';
  var doc = new DOMParser().parseFromString(String(html), 'text/html');
  var text = (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLen ? text.substring(0, maxLen) : text;
}

// DIARY投稿の表示用タイトルと日付を抽出（新形式=title/body/date、旧形式=[TITLE:]/[DATE:]記法）。
// diary.js の parseDiaryPost 相当をこのカード用（タイトル/日付のみ）に最小化したもの。
function homeDiaryTitleAndDate(post) {
  if (post.body !== undefined) {
    var dateStr = post.date || homeJstDateStr(post.createdAt);
    var title = post.title || homeStripTagsExcerpt(post.body, 20) || '無題の日記';
    return { title: title, dateStr: dateStr };
  }
  var text = post.text || '';
  var dateMatch = text.match(/^\[DATE:(\d{4}-\d{2}-\d{2})\]/);
  var titleMatch = text.match(/\[TITLE:([^\]]+)\]/);
  var dateStr = dateMatch ? dateMatch[1] : homeJstDateStr(post.createdAt);
  var bodyOnly = text.replace(/^\[DATE:[^\]]+\]/, '').replace(/^\[TITLE:[^\]]+\]/, '').replace(/^\[PHOTO_POS:[^\]]+\]/, '').replace(/^\[CATCH_IMG:[^\]]+\]/, '');
  var title = titleMatch ? titleMatch[1] : (homeStripTagsExcerpt(bodyOnly, 20) || '無題の日記');
  return { title: title, dateStr: dateStr };
}

async function renderHomeDaizuCard() {
  const body = document.getElementById('homeDaizuCardBody');
  if (!body) return;

  const todayStr = homeTodayJstStr();
  let yousuData = null;
  let diaryData = null;

  const paint = function() {
    const yousuPosts = (yousuData && yousuData.posts) || [];
    const diaryPosts = (diaryData && diaryData.posts) || [];

    // posts はcreatedAt降順で返る前提（既存の posts[0]="最新" 仕様を踏襲）ので、
    // 最初に見つかった当日一致が「当日の最新」になる。
    const yousuPost = yousuPosts.find(function(p) { return homeJstDateStr(p.createdAt) === todayStr; });
    const todayDiaries = diaryPosts.filter(function(p) { return homeDiaryTitleAndDate(p).dateStr === todayStr; });

    if (!yousuPost && todayDiaries.length === 0) {
      body.innerHTML = '<div class="home-daizu-empty">今日の記録はまだありません</div>';
      return;
    }

    let html = '';
    if (yousuPost) {
      const postDate = yousuPost.createdAt ? new Date(yousuPost.createdAt) : null;
      const timeStr = postDate ? (String(postDate.getHours()).padStart(2, '0') + ':' + String(postDate.getMinutes()).padStart(2, '0')) : '';
      const imgSrc = safeImageSrc(yousuPost.imageUrl);
      const thumbHtml = imgSrc
        ? '<img class="home-daizu-thumb" src="' + imgSrc + '" alt="だいず" loading="lazy" decoding="async" onerror="this.style.display=\'none\'">'
        : '';
      html +=
        '<div class="home-daizu-entry" onclick="switchTab(\'yousu\')">' + thumbHtml +
        '<div class="home-daizu-entry-text">' +
        '<span class="home-daizu-entry-time"><i class="ph-bold ph-paw-print"></i>' + escapeHtml(timeStr) + '</span>' +
        '<p class="home-daizu-entry-body">' + escapeHtml(yousuPost.text || '') + '</p>' +
        '</div></div>';
    }

    if (todayDiaries.length > 0) {
      html += '<div class="home-daizu-diary-list">' + todayDiaries.map(function(post) {
        const info = homeDiaryTitleAndDate(post);
        return '<div class="home-daizu-diary-row" onclick="switchTab(\'diary\')">' +
          '<i class="ph-bold ph-book-open"></i>' +
          '<span class="home-daizu-diary-title">' + escapeHtml(info.title) + '</span>' +
          '</div>';
      }).join('') + '</div>';
    }

    body.innerHTML = html;
  };

  try {
    const results = await Promise.all([
      Api.getPosts('?type=YOUSU&limit=5', function(fresh) { yousuData = fresh; paint(); }),
      Api.getPosts('?type=DIARY&limit=5', function(fresh) { diaryData = fresh; paint(); })
    ]);
    yousuData = results[0];
    diaryData = results[1];
    paint();
  } catch (e) {
    console.error('Failed to load home daizu card:', e);
    body.innerHTML = '<div class="home-daizu-empty">読み込みに失敗しました</div>';
  }
}
