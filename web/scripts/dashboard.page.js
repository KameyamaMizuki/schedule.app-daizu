// ========== dashboard.page.js — ページ初期化・タブ切り替え ==========
// 現在のタブ（ヘッダー色切り替え用）
let currentTab = 'thisWeek';

function navigateTo(tab) {
  toggleSidebar();
  if (tab === 'home') {
    window.location.href = 'home.html';
  } else {
    switchTab(tab);
  }
}

function goToHome() {
  window.location.href = 'home.html';
}

async function init() {
  initCurrentUser();

  // hashからタブを読み取る（デフォルトはschedule）
  var _route = AppRoutes.parseHash(window.location.hash);
  var startTab = _route.tab || 'schedule';

  // 該当タブに切り替え
  await switchTab(startTab);
  if (startTab === 'schedule' && _route.subTab) {
    await switchScheduleSubTab(_route.subTab);
  }
}

async function switchTab(tab) {
  // 開いているモーダルを閉じる
  const cropModal = document.getElementById('cropModal');
  const diaryCropModal = document.getElementById('diaryCropModal');
  if (cropModal) cropModal.classList.remove('active');
  if (diaryCropModal) diaryCropModal.classList.remove('active');

  document.querySelectorAll('.tab').forEach(t => {
    t.classList.remove('active');
    t.classList.remove('pink');
    t.classList.remove('green');
  });
  document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));

  currentTab = tab;

  // タブのインデックスとコンテンツを決定
  const tabNames = ['home', 'schedule', 'tsubuyaki', 'diary', 'wansta'];
  const tabColors = { home: 'green', schedule: 'pink', tsubuyaki: 'sky', diary: 'brown', wansta: 'purple' };
  const index = tabNames.indexOf(tab);
  if (index !== -1) {
    const tabEl = document.querySelectorAll('.tab')[index];
    tabEl.classList.add('active');
    if (tabColors[tab]) {
      tabEl.classList.add(tabColors[tab]);
    }
  }

  // サブタブ表示/非表示
  const scheduleSubTabs = document.getElementById('scheduleSubTabs');
  scheduleSubTabs.style.display = (tab === 'schedule') ? 'flex' : 'none';

  // ヘッダーの色切り替え
  const header = document.getElementById('mainHeader');
  const headerTitle = document.getElementById('headerTitle');
  header.classList.remove('pink', 'green', 'wansta', 'sky', 'brown', 'purple');
  if (tabColors[tab]) {
    header.classList.add(tabColors[tab]);
  }
  const tabTitles = { home: 'ホーム', schedule: 'スケジュール', tsubuyaki: 'つぶやき', diary: 'ダイ日記', wansta: 'WANsta' };
  headerTitle.textContent = tabTitles[tab] || 'スケジュール';

  // hash更新
  history.replaceState(null, '', AppRoutes.buildHash(tab,
    tab === 'schedule' ? currentScheduleSubTab : null));

  // タブ切り替え時に遅延読み込み
  if (tab === 'schedule') {
    // スケジュールタブ：サブタブに応じてコンテンツ表示
    await switchScheduleSubTab(currentScheduleSubTab);
  } else if (tab === 'tsubuyaki') {
    document.getElementById('tsubuyakiContent').classList.add('active');
    if (!window.tsubuyakiLoaded) {
      await initTsubuyakiTab();
      window.tsubuyakiLoaded = true;
    } else {
      updateTsubuyakiSkyBackground();
    }
  } else if (tab === 'diary') {
    document.getElementById('diaryContent').classList.add('active');
    if (!window.diaryLoaded) {
      await initDiaryTab();
      window.diaryLoaded = true;
    }
  } else if (tab === 'wansta') {
    document.getElementById('wanstaContent').classList.add('active');
    if (!window.wanstaLoaded) {
      await initWanstaTab();
      window.wanstaLoaded = true;
    }
  }

  // タブ切り替え後にアバターを再描画（ヘッダー色変更で上書きされるのを防ぐ）
  updateHeaderAvatar();
}

// bfcache（ブラウザ戻るキャッシュ）から復元された場合にWANstaをリセット
window.addEventListener('pageshow', function(event) {
  if (event.persisted) {
    window.wanstaLoaded = false;
    if (currentTab === 'wansta') {
      initWanstaTab();
    }
  }
});

// 初期化実行
init();
