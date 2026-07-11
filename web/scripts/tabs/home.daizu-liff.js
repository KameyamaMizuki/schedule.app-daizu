// home.daizu-liff.js — LIFF だいず入力フォーム
(function() {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  if (params.get('mode') !== 'daizu') return;

  // 通常UIを非表示
  document.addEventListener('DOMContentLoaded', function() {
    var hide = ['mainHeader', 'sidebar', 'sidebarOverlay', 'homeContent', 'userSelectModal'];
    hide.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    var tabs = document.querySelector('.tabs');
    if (tabs) tabs.style.display = 'none';

    // フォーム表示
    var form = document.getElementById('daizuLiffForm');
    if (form) form.style.display = 'flex';

    // 今日の日付を表示
    var now = new Date();
    var month = now.getMonth() + 1;
    var day = now.getDate();
    var dayNames = ['日','月','火','水','木','金','土'];
    var dayOfWeek = dayNames[now.getDay()];
    var dateEl = document.getElementById('daizuLiffDate');
    if (dateEl) dateEl.textContent = month + '月' + day + '日(' + dayOfWeek + ')';

    // 既存の記録を読み込み、あればテキストエリアに表示
    var textarea = document.getElementById('daizuLiffInput');
    loadExistingDaizuNote(now, textarea);
  });
})();

async function loadExistingDaizuNote(now, textarea) {
  if (!textarea) return;
  var dateStr = formatDateForApi(now);
  var weekId = getWeekId(now);
  try {
    var data = await Api.getWeek(weekId, null, { force: true });
    var daizuUser = data.users ? data.users.find(function(u) { return u.userId === 'daizu-status'; }) : null;
    if (daizuUser && daizuUser.notes && daizuUser.notes[dateStr]) {
      textarea.value = daizuUser.notes[dateStr];
      // 文字数カウンター更新
      var charcount = document.querySelector('.daizu-liff-charcount');
      if (charcount) charcount.textContent = textarea.value.length + '/200';
    }
  } catch (e) {
    // 読み込み失敗は無視、空欄のまま入力可能
  }
  setTimeout(function() { textarea.focus(); }, 300);
}

async function submitDaizuLiffForm() {
  var input = document.getElementById('daizuLiffInput');
  var note = input.value.trim();
  if (!note) { alert('だいずの様子を入力してください'); return; }

  var btn = document.getElementById('daizuLiffSubmitBtn');
  btn.disabled = true;
  btn.textContent = '保存中...';

  var now = new Date();
  var dateStr = formatDateForApi(now);
  var weekId = getWeekId(now);

  try {
    // 既存のだいずデータを取得してnotesをマージ
    var existingNotes = {};
    try {
      var data = await Api.getWeek(weekId, null, { force: true });
      var daizuUser = data.users ? data.users.find(function(u) { return u.userId === 'daizu-status'; }) : null;
      if (daizuUser && daizuUser.notes) {
        existingNotes = Object.assign({}, daizuUser.notes);
      }
    } catch (e2) { /* 既存データ取得失敗は無視、新規として保存を続行 */ }
    existingNotes[dateStr] = note;

    await Api.submitSchedule({
      weekId: weekId,
      userId: 'daizu-status',
      displayName: 'だいず',
      slots: {},
      notes: existingNotes,
      skipNotification: false
    });

    input.style.display = 'none';
    btn.style.display = 'none';
    var charcount = document.querySelector('.daizu-liff-charcount');
    if (charcount) charcount.style.display = 'none';
    document.getElementById('daizuLiffResult').style.display = 'block';
  } catch (e) {
    alert('保存に失敗しました: ' + e.message);
    btn.disabled = false;
    btn.textContent = '保存する';
  }
}

function closeDaizuLiff() {
  try { window.close(); } catch (e) { /* ignore */ }
  // window.close() が効かない場合のフォールバック
  var container = document.querySelector('.daizu-liff-container');
  if (container) {
    container.innerHTML = '<p style="color:var(--color-text-muted);font-size:16px;margin-top:40px">この画面を閉じてLINEに戻ってください</p>';
  }
}
