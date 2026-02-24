// ========== ホームタブ — コントローラー ==========
// 依存読み込み順: routes.js → core/state.js → core/utils.js → ui/modals.js → home.js(本ファイル)
//   → home.record.js → home.schedule.js → home.tsubuyaki.js
//   → home.uranau.js → home.wannade.js → home.chirolinfo.js → home.page.js
//
// このファイルが担う責務:
//   - データ読み込み (loadChirolImagesFromDB / loadHitokotoFromDB)
//   - 共有状態変数 (homeState / homeExpression / homeHitokotoList)
//   - 初期化 (initHomeTab / initHomeTimeSelectors / homeSetCurrentTime)
//   - 今日情報 (updateHomeTodayInfo / homeGetTodayPerson)
//   - 共有UI (homeHideAllAreas / homeShowMenu / homeSetSpeechText / homeSetRandomDogImage / homeChangeDogImage)
//   - メニューナビゲーション (homeBackToMenu / homeReturnToMenu / homeShowThinking / updateHomeFab)
//   - 犬タップ一言 (homeDogTapped)

// ========== データ読み込み ==========

// DynamoDBから追加された画像を読み込み
async function loadChirolImagesFromDB() {
  try {
    const res = await fetch(`${API_BASE_URL}${AppConfig.API.CHIROL_IMAGES}`);
    if (res.ok) {
      const data = await res.json();
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
    const res = await fetch(`${API_BASE_URL}${AppConfig.API.CHIROL_HITOKOTO}`);
    if (res.ok) {
      const data = await res.json();
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

let homeState = 'menu';
let homeExpression = 'normal';
// 以下は各機能ファイルからも参照するためここで宣言
let homeCalendarMonth = new Date();
let homeSelectedCalendarDate = null;
let homeScheduleDataCache = {};
let homeCurrentRecordType = null;

// ========== 初期化 ==========

function initHomeTab() {
  initHomeTimeSelectors();
  updateHomeTodayInfo();
  homeSetRandomDogImage('normal');
  loadHitokotoFromDB();
  loadChirolImagesFromDB();
}

function initHomeTimeSelectors() {
  const hourSelect = document.getElementById('homeRecordHour');
  const minuteSelect = document.getElementById('homeRecordMinute');
  if (!hourSelect || hourSelect.options.length > 0) return;
  for (let h = 0; h < 24; h++) {
    const opt = document.createElement('option');
    opt.value = String(h).padStart(2, '0');
    opt.textContent = `${h}時`;
    hourSelect.appendChild(opt);
  }
  for (let m = 0; m < 60; m += 5) {
    const opt = document.createElement('option');
    opt.value = String(m).padStart(2, '0');
    opt.textContent = `${m}分`;
    minuteSelect.appendChild(opt);
  }
  homeSetCurrentTime();
}

function homeSetCurrentTime() {
  const now = new Date();
  const hourEl = document.getElementById('homeRecordHour');
  const minEl = document.getElementById('homeRecordMinute');
  if (hourEl) hourEl.value = String(now.getHours()).padStart(2, '0');
  if (minEl) minEl.value = String(Math.round(now.getMinutes() / 5) * 5 % 60).padStart(2, '0');
}

// ========== 今日情報 ==========

async function updateHomeTodayInfo() {
  const now = new Date();
  const dayNames = AppConfig.SCHEDULE.DAYS;
  const todayStr = `${now.getMonth() + 1}/${now.getDate()}(${dayNames[now.getDay()]})`;
  const todayDateEl = document.getElementById('homeTodayDate');
  if (todayDateEl) todayDateEl.textContent = todayStr;
  const personEl = document.getElementById('homeTodayPerson');
  try {
    const weekId = getWeekId(now);
    const response = await fetch(`${API_BASE_URL}${AppConfig.API.SCHEDULE_WEEK}/${weekId}`);
    if (response.ok) {
      const data = await response.json();
      const dateStr = formatDateForApi(now);
      const person = homeGetTodayPerson(data, dateStr);
      if (personEl) personEl.textContent = person || '未定';
    } else {
      if (personEl) personEl.textContent = '未定';
    }
  } catch (e) {
    console.error('Failed to load today info:', e);
    if (personEl) personEl.textContent = '未定';
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

// ========== 共有UI — 犬画像・吹き出し ==========

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
    const fallbackSrc = 'images/dog/chirol/normal/IMG_3707.webp';
    dogImg.src = fallbackSrc;
    homeExpression = 'normal';
  };
}

function homeHideAllAreas() {
  ['homeMenuButtons', 'homeProgressContainer', 'homeRecordTypeSelect', 'homeRecordInput',
   'homeChoiceButtons', 'homeCalendarArea', 'homeScheduleDisplay', 'homeScheduleEdit',
   'dogSelectArea', 'chirolChoiceArea', 'chirolHitokotoArea', 'chirolImageArea',
   'homeTsubuyakiArea', 'homeUranauArea', 'homeWannadeArea'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = '';
      el.classList.remove('active');
    }
  });
}

function homeShowMenu() {
  homeHideAllAreas();
  const menu = document.getElementById('homeMenuButtons');
  if (menu) {
    menu.style.display = '';
    menu.classList.add('active');
  }
}

function homeTsubuyakiCancel() {
  homeState = 'menu';
  homeSetRandomDogImage('normal');
  homeSetSpeechText('また何かあったら<br>言ってくれよな！');
  homeHideAllAreas();
  homeShowMenu();
}

function homeSetSpeechText(text) {
  const bubble = document.getElementById('homeSpeechBubble');
  const textEl = document.getElementById('homeSpeechText');
  if (bubble && textEl) {
    bubble.classList.add('fade-out');
    setTimeout(() => {
      textEl.innerHTML = text;
      bubble.classList.remove('fade-out');
    }, AppConfig.TIMING.DOG_FADE);
  }
}

// ========== メニューナビゲーション ==========

async function homeShowThinking(minDuration = AppConfig.TIMING.MSG_DISPLAY) {
  homeHideAllAreas();
  homeSetRandomDogImage('thinking');
  homeSetSpeechText('ちょっと待ってくれ...');
  const prog = document.getElementById('homeProgressContainer');
  if (prog) {
    prog.style.display = 'block';
    prog.classList.add('active');
    const bar = prog.querySelector('.progress-bar-inner');
    if (bar) {
      bar.style.animation = 'none';
      bar.offsetHeight;
      bar.style.animation = `progress ${minDuration}ms ease-in-out`;
    }
  }
  return new Promise(r => setTimeout(r, minDuration));
}

function homeReturnToMenu(delay = AppConfig.TIMING.MSG_DISPLAY) {
  setTimeout(() => {
    // 犬画像と吹き出しの表示を復元
    const dogImg = document.getElementById('homeDogImage');
    const speechBubble = document.getElementById('homeSpeechBubble');
    if (dogImg) dogImg.style.display = '';
    if (speechBubble) speechBubble.style.display = '';
    homeState = 'menu';
    homeSetRandomDogImage('normal');
    const now = new Date();
    const dayNames = AppConfig.SCHEDULE.DAYS;
    const todayStr = `${now.getMonth() + 1}/${now.getDate()}(${dayNames[now.getDay()]})`;
    homeSetSpeechText(`今日は <span class="highlight">${todayStr}</span> ！<br>担当は <span class="highlight" id="homeTodayPerson">-</span>だぜ！`);
    homeShowMenu();
    // speechText設定後にupdateHomeTodayInfoを呼ぶ
    setTimeout(() => updateHomeTodayInfo(), AppConfig.TIMING.DOG_CHANGE);
  }, delay);
}

function homeBackToMenu() {
  homeState = 'menu';
  // 犬画像と吹き出しの表示を確実に復元（占い/あそぶ等で非表示にされている場合）
  const dogImg = document.getElementById('homeDogImage');
  const speechBubble = document.getElementById('homeSpeechBubble');
  if (dogImg) dogImg.style.display = '';
  if (speechBubble) speechBubble.style.display = '';
  homeSetRandomDogImage('normal');
  const now = new Date();
  const dayNames = AppConfig.SCHEDULE.DAYS;
  const todayStr = `${now.getMonth() + 1}/${now.getDate()}(${dayNames[now.getDay()]})`;
  homeSetSpeechText(`今日は <span class="highlight">${todayStr}</span> ！<br>担当は <span class="highlight" id="homeTodayPerson">-</span>だぜ！`);
  homeShowMenu();
  updateHomeFab();
  // speechText設定後にupdateHomeTodayInfoを呼ぶ
  setTimeout(() => updateHomeTodayInfo(), 600);
}

function homeReturnToInitial() {
  homeHideAllAreas();
  homeBackToMenu();
}

function updateHomeFab() {
  const fab = document.getElementById('homeFab');
  if (!fab) return;
  // メニュー表示時はFAB非表示、それ以外では表示
  if (homeState === 'menu') {
    fab.classList.remove('active');
  } else {
    fab.classList.add('active');
  }
}

// ========== 犬タップ — 一言表示 ==========

// 犬の画像タップで一言表示
function homeDogTapped() {
  if (homeState !== 'menu') return; // メニュー表示中のみ有効
  homeState = 'hitokoto';
  // 吹き出しのみ変更（画像はそのまま）
  const hitokoto = homeHitokotoList[Math.floor(Math.random() * homeHitokotoList.length)];
  homeSetSpeechText(hitokoto);
  homeHideAllAreas();
  // 3秒後に画像を変えてホームに戻る
  setTimeout(() => {
    homeBackToMenu();
  }, AppConfig.TIMING.MSG_DISPLAY);
}
