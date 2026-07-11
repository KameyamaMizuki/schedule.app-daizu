// ========== dashboard.page.js — ページ初期化・タブ切り替え ==========
// 現在のタブ
let currentTab = 'thisWeek';

async function init() {
  await initAuth();

  // クエリパラメータからタブを読み取る（リッチメニュー/LIFF経由）
  var urlParams = new URLSearchParams(window.location.search);
  var queryTab = urlParams.get('tab');
  var queryAction = urlParams.get('action');

  // hashからタブを読み取る（デフォルトはschedule）
  var _route = AppRoutes.parseHash(window.location.hash);
  var startTab = queryTab || _route.tab || 'schedule';

  // 該当タブに切り替え
  await switchTab(startTab);
  if (startTab === 'schedule' && _route.subTab) {
    await switchScheduleSubTab(_route.subTab);
  }

  // action=new: 対応タブの新規投稿画面を自動表示
  if (queryAction === 'new') {
    setTimeout(function() {
      if (startTab === 'diary' && typeof toggleDiaryInput === 'function') {
        toggleDiaryInput();
      }
    }, 500);
  }

  // 他タブのデータとホームの資材を先読み（タブ切替を速くする）
  prewarmAppData();
  prewarmSiblingPage('dashboard');
}

async function switchTab(tab) {
  // 開いているモーダルを閉じる
  const cropModal = document.getElementById('cropModal');
  const diaryCropModal = document.getElementById('diaryCropModal');
  if (cropModal) cropModal.classList.remove('active');
  if (diaryCropModal) diaryCropModal.classList.remove('active');

  document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));

  currentTab = tab;

  // 下部タブのアクティブ状態を更新
  document.querySelectorAll('.bn-item').forEach(function(el) {
    el.classList.toggle('active', el.dataset.tab === tab);
  });

  // サブタブ（チップ）表示/非表示
  const scheduleSubTabs = document.getElementById('scheduleSubTabs');
  if (scheduleSubTabs) scheduleSubTabs.style.display = (tab === 'schedule') ? 'flex' : 'none';

  // ヘッダータイトル更新
  const headerTitle = document.getElementById('headerTitle');
  const tabTitles = { home: 'ホーム', schedule: '予定', yousu: '様子', diary: '日記', wansta: 'WANsta' };
  if (headerTitle) headerTitle.textContent = tabTitles[tab] || '予定';

  // FABをタブに応じて切り替え
  updateFab(tab);

  // hash更新
  history.replaceState(null, '', AppRoutes.buildHash(tab,
    tab === 'schedule' ? currentScheduleSubTab : null));

  // タブ切り替え時に遅延読み込み
  if (tab === 'schedule') {
    // スケジュールタブ：サブタブに応じてコンテンツ表示
    await switchScheduleSubTab(currentScheduleSubTab);
  } else if (tab === 'yousu') {
    document.getElementById('yousuContent').classList.add('active');
    if (!window.yousuLoaded) {
      await initYousuTab();
      window.yousuLoaded = true;
    } else {
      // 再訪問時は最新データで再描画
      await initYousuTab();
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
  if (window.rescanReveal) window.rescanReveal();
}

// 共有FAB（タブごとにアイコン/挙動を差し替え）
function updateFab(tab) {
  const fab = document.getElementById('fabBtn');
  if (!fab) return;

  if (tab === 'home') {
    fab.style.display = 'none';
    fab.onclick = null;
    return;
  }

  if (tab === 'schedule') {
    if (typeof scheduleStartEdit === 'function') {
      fab.style.display = '';
      fab.innerHTML = '<i class="ph-bold ph-pencil-simple"></i>';
      fab.onclick = function() { scheduleStartEdit(); };
    } else {
      // T12でscheduleStartEdit実装まではFAB非表示
      fab.style.display = 'none';
      fab.onclick = null;
    }
    return;
  }

  fab.style.display = '';
  fab.innerHTML = '<i class="ph-bold ph-plus"></i>';
  if (tab === 'yousu') {
    fab.onclick = function() { if (typeof yousuFocusInput === 'function') yousuFocusInput(); };
  } else if (tab === 'diary') {
    fab.onclick = function() { toggleDiaryInput(); };
  } else if (tab === 'wansta') {
    fab.onclick = function() { wanstaFabClick(); };
  } else {
    fab.style.display = 'none';
    fab.onclick = null;
  }
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
