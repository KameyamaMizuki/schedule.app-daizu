// ========== ホームタブ — コントローラー ==========
// 依存読み込み順（dashboard.bundle.js内）: routes.js → core/state.js → core/utils.js → home.js(本ファイル)
//   → home.schedule.js → home.chirolinfo.js → home.daizu-liff.js
//   → dashboard.page.js（homeタブ表示時に initHomeTab() を呼ぶ）
//
// このファイルが担う責務（T16でホーム画面を4ブロック構成に刷新）:
//   - データ読み込み (loadChirolImagesFromDB / loadHitokotoFromDB)
//   - 共有状態変数 (homeExpression / homeHitokotoList)
//   - 初期化 (initHomeTab)
//   - ①チロル円形写真+吹き出し (updateHomeTodayInfo / homeGetTodayPerson /
//     homeSetRandomDogImage / homeChangeDogImage / homeSetSpeechText / homeDogTapped)
//   - ③今週のよていサマリーカード (renderHomeScheduleSummary)
//   - ④きょうのだいずカード (renderHomeDaizuCard)
// おさんぽ日和カード（②）は #walkCard のプレースホルダーのみ用意（Task 17で実装）。
//
// home.schedule.js / home.chirolinfo.js / home.daizu-liff.js は削除対象ではない
// （chirolinfo=WANstaタブの写真/一言投稿に機能移行済みで現状呼び出し元なし、
//   daizu-liff=?mode=daizu の独立LIFFフォームで本ファイルとは無関係に動作）。

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
  renderHomeScheduleSummary();
  renderHomeDaizuCard();
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
function homeDogTapped() {
  if (homeDogTapBusy) return;
  homeDogTapBusy = true;
  const hitokoto = homeHitokotoList[Math.floor(Math.random() * homeHitokotoList.length)];
  homeSetSpeechText(hitokoto);
  setTimeout(() => {
    homeSetSpeechText(homeSpeechDefaultHtml(), updateHomeTodayInfo);
    homeDogTapBusy = false;
  }, AppConfig.TIMING.MSG_DISPLAY);
}

// ========== ③今週のよていサマリーカード ==========
// きょう・あすの「担当」を homeGetTodayPerson と同じロジックで要約表示。タップで予定タブへ。

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

  let todayData = null;
  let tomorrowData = null;

  const paint = function() {
    const todayPerson = todayData ? homeGetTodayPerson(todayData, todayStr) : null;
    const tomorrowPerson = tomorrowData ? homeGetTodayPerson(tomorrowData, tomorrowStr) : null;
    body.innerHTML =
      '<div class="home-summary-row"><span class="home-summary-label">きょう</span><span class="home-summary-value">' + escapeHtml(todayPerson || '未定') + '</span></div>' +
      '<div class="home-summary-row"><span class="home-summary-label">あす</span><span class="home-summary-value">' + escapeHtml(tomorrowPerson || '未定') + '</span></div>';
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

// ========== ④きょうのだいずカード ==========
// 最新YOUSU 1件のサムネ+時刻+冒頭を表示。タップで様子タブへ。

async function renderHomeDaizuCard() {
  const body = document.getElementById('homeDaizuCardBody');
  if (!body) return;

  const paint = function(data) {
    const posts = (data && data.posts) || [];
    if (posts.length === 0) {
      body.innerHTML = '<div class="home-daizu-empty">まだ記録がありません</div>';
      return;
    }
    const post = posts[0];
    const postDate = post.createdAt ? new Date(post.createdAt) : null;
    const timeStr = postDate ? (String(postDate.getHours()).padStart(2, '0') + ':' + String(postDate.getMinutes()).padStart(2, '0')) : '';
    const thumbHtml = post.imageUrl
      ? '<img class="home-daizu-thumb" src="' + escapeHtml(post.imageUrl) + '" alt="だいず" onerror="this.style.display=\'none\'">'
      : '';
    body.innerHTML =
      '<div class="home-daizu-entry">' + thumbHtml +
      '<div class="home-daizu-entry-text">' +
      '<span class="home-daizu-entry-time">' + escapeHtml(timeStr) + '</span>' +
      '<p class="home-daizu-entry-body">' + escapeHtml(post.text || '') + '</p>' +
      '</div></div>';
  };

  try {
    const data = await Api.getPosts('?type=YOUSU&limit=1', paint);
    paint(data);
  } catch (e) {
    console.error('Failed to load home daizu card:', e);
    body.innerHTML = '<div class="home-daizu-empty">読み込みに失敗しました</div>';
  }
}
