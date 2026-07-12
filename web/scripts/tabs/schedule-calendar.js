// [SCHED:CAL] ========== カレンダーサブタブ ==========
// 依存: core/state.js (familyMembers), core/utils.js (日付ヘルパー/escapeHtml),
//       core/account.js (getDisplayName), core/api.js (Api), schedule.js (switchScheduleSubTab),
//       schedule-weekview.js (scheduleStartEdit, .wv-grid/.wv-cell/.wv-badge-today 系CSSクラス)
let scheduleCalendarMonth = new Date();
let scheduleCalendarSelectedDate = null;
let scheduleCalendarData = {};
let calendarDiaryPosts = [];
let calendarYousuPosts = [];
let calendarDiaryDates = new Set();
let calendarYousuDates = new Set();

// ダイ日記の「その日」判定: [DATE:] タグ優先、なければ createdAt の先頭10文字（既存ロジック踏襲）
function diaryDateForPost(post) {
  const text = post.text || '';
  const dateMatch = text.match(/^\[DATE:(\d{4}-\d{2}-\d{2})\]/);
  if (dateMatch) return dateMatch[1];
  return post.createdAt ? post.createdAt.substring(0, 10) : null;
}

// 様子(YOUSU)投稿の createdAt(UTC ISO)をJST日付文字列に変換
function jstDateFromIso(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.getUTCFullYear() + '-' + String(jst.getUTCMonth() + 1).padStart(2, '0') + '-' + String(jst.getUTCDate()).padStart(2, '0');
}

function rebuildCalendarMarkSets() {
  calendarDiaryDates = new Set();
  calendarDiaryPosts.forEach(function(post) {
    const d = diaryDateForPost(post);
    if (d) calendarDiaryDates.add(d);
  });
  calendarYousuDates = new Set();
  calendarYousuPosts.forEach(function(post) {
    const d = jstDateFromIso(post.createdAt);
    if (d) calendarYousuDates.add(d);
  });
}

async function preloadCalendarPosts() {
  const [diaryResult, yousuResult] = await Promise.allSettled([
    Api.getPosts('?type=DIARY'),
    Api.getPosts('?type=YOUSU&limit=100')
  ]);
  if (diaryResult.status === 'fulfilled') {
    calendarDiaryPosts = diaryResult.value.posts || [];
  } else {
    console.error('Diary preload failed:', diaryResult.reason);
  }
  if (yousuResult.status === 'fulfilled') {
    calendarYousuPosts = yousuResult.value.posts || [];
  } else {
    console.error('Yousu preload failed:', yousuResult.reason);
  }
  rebuildCalendarMarkSets();
}

async function renderScheduleCalendar() {
  const container = document.getElementById('calendarContent');
  const year = scheduleCalendarMonth.getFullYear();
  const month = scheduleCalendarMonth.getMonth();
  const dayNames = AppConfig.SCHEDULE.DAYS;

  let html = '<div class="cal-card">';
  html += '<div class="cal-nav">';
  html += '<button class="cal-nav-btn" onclick="changeScheduleCalendarMonth(-1)"><i class="ph-bold ph-caret-left"></i></button>';
  html += `<h2 class="cal-month-title">${year}年${month + 1}月</h2>`;
  html += '<button class="cal-nav-btn" onclick="changeScheduleCalendarMonth(1)"><i class="ph-bold ph-caret-right"></i></button>';
  html += '</div>';

  html += '<div class="cal-weekday-row">';
  dayNames.forEach(function(name, i) {
    const cls = i === 0 ? 'su' : i === 6 ? 'sa' : '';
    html += `<div class="${cls}">${name}</div>`;
  });
  html += '</div>';

  html += '<div class="cal-grid" id="scheduleCalendarGrid"></div>';
  html += renderCalendarLegend();
  html += '</div>';
  html += '<div id="scheduleCalendarDetail" class="cal-detail"></div>';

  container.innerHTML = html;
  // 投稿(日記/様子)プリロードとグリッド描画を並列実行
  const postsPromise = preloadCalendarPosts();
  const gridPromise = renderScheduleCalendarGrid();
  await Promise.all([postsPromise, gridPromise]);
  // 投稿データが後から到着した場合、詳細を再描画（マークが最新化される）
  if (scheduleCalendarSelectedDate) {
    await showScheduleCalendarDetail(formatDateForApi(scheduleCalendarSelectedDate));
  }
}

function renderCalendarLegend() {
  let html = '<div class="cal-legend">';
  html += '<span class="cal-legend-item"><span class="cal-legend-dot full"></span>不在時間なし</span>';
  html += '<span class="cal-legend-item"><span class="cal-legend-dot partial"></span>一部不在あり</span>';
  html += '<span class="cal-legend-item"><span class="cal-legend-dot none"></span>終日不在</span>';
  html += '<span class="cal-legend-item"><i class="ph-bold ph-book-open cal-legend-icon diary"></i>日記あり</span>';
  html += '<span class="cal-legend-item"><i class="ph-bold ph-paw-print cal-legend-icon yousu"></i>様子あり</span>';
  html += '</div>';
  return html;
}

async function renderScheduleCalendarGrid() {
  const grid = document.getElementById('scheduleCalendarGrid');
  const year = scheduleCalendarMonth.getFullYear();
  const month = scheduleCalendarMonth.getMonth();
  const today = new Date();
  const todayStr = formatDateForApi(today);

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // 月の範囲のスケジュールデータをプリロード
  await preloadMonthScheduleData(year, month);

  let html = '';

  // 前月の日
  const startDayOfWeek = firstDay.getDay();
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    html += `<div class="cal-day dim">${prevMonthLastDay - i}</div>`;
  }

  // 当月の日
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date = new Date(year, month, day);
    const dateStr = formatDateForApi(date);
    html += renderCalendarDayCell(dateStr, day, dateStr === todayStr);
  }

  // 次月の日
  const endDayOfWeek = lastDay.getDay();
  for (let i = 1; i < 7 - endDayOfWeek; i++) {
    html += `<div class="cal-day dim">${i}</div>`;
  }

  grid.innerHTML = html;

  // 今日の詳細を表示
  if (!scheduleCalendarSelectedDate) {
    scheduleCalendarSelectedDate = today;
  }
  await showScheduleCalendarDetail(formatDateForApi(scheduleCalendarSelectedDate));
}

function renderCalendarDayCell(dateStr, day, isToday) {
  const isSelected = scheduleCalendarSelectedDate && formatDateForApi(scheduleCalendarSelectedDate) === dateStr;
  const date = new Date(dateStr + 'T00:00:00+09:00');
  const dow = date.getDay();
  const coverage = getDateCoverage(dateStr);
  const hasDiary = calendarDiaryDates.has(dateStr);
  const hasYousu = calendarYousuDates.has(dateStr);

  let cls = 'cal-day';
  if (dow === 0) cls += ' su';
  else if (dow === 6) cls += ' sa';
  if (isToday) cls += ' today';
  if (isSelected) cls += ' sel';

  let html = `<div class="${cls}" data-cal-date="${dateStr}" onclick="selectScheduleCalendarDate('${dateStr}')">`;
  html += `<span class="cal-day-num">${day}</span>`;
  if (coverage) {
    html += `<span class="cal-dot ${coverage}"></span>`;
  }
  if (hasDiary || hasYousu) {
    html += '<span class="cal-marks">';
    if (hasDiary) html += '<i class="ph-bold ph-book-open cal-mark diary"></i>';
    if (hasYousu) html += '<i class="ph-bold ph-paw-print cal-mark yousu"></i>';
    html += '</span>';
  }
  html += '</div>';
  return html;
}

async function preloadMonthScheduleData(year, month) {
  // 月の最初と最後の日を含む週のデータを取得
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const weekIds = new Set();
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    weekIds.add(getWeekId(new Date(d)));
  }

  // 未取得の週のみ並列フェッチ
  const uncached = [...weekIds].filter(id => !scheduleCalendarData[id]);
  if (uncached.length === 0) return;

  await Promise.allSettled(
    uncached.map(weekId =>
      Api.getWeek(weekId, null)
        .then(data => { if (data) scheduleCalendarData[weekId] = data; })
    )
  );
}

// 日別カバレッジ判定: 9/17/21/24 の4枠それぞれ「誰か1人でも◯がいるか」で full/partial/none を判定。
// 誰も入力していない日は null（ドット非表示）。
// [T13 self-review] allday:true のみが立っていて09/17/21/24が個別に展開されていないデータでも
// カバレッジを正しく認識できるよう、allday も各枠のカバレッジとして扱う（現行の全入力経路は
// allday→4枠へカスケードするため通常は発生しないが、過去データ互換のため防御的に対応）。
function getDateCoverage(dateStr) {
  var weekId = getWeekId(new Date(dateStr + 'T00:00:00+09:00'));
  var data = scheduleCalendarData[weekId];
  if (!data || !data.users) return null;
  var members = data.users.filter(function(u) { return u.userId !== 'daizu-status'; });
  var anyInput = members.some(function(u) {
    return Object.keys(u.slots || {}).some(function(k) { return k.indexOf(dateStr) === 0; });
  });
  if (!anyInput) return null;
  var covered = ['09', '17', '21', '24'].filter(function(slot) {
    return members.some(function(u) {
      var slots = u.slots || {};
      return slots[dateStr + ':' + slot] || slots[dateStr + ':allday'];
    });
  }).length;
  return covered === 4 ? 'full' : covered > 0 ? 'partial' : 'none';
}

function changeScheduleCalendarMonth(delta) {
  scheduleCalendarMonth.setMonth(scheduleCalendarMonth.getMonth() + delta);
  // ヘッダーの月表示を即時更新（グリッドのみ再描画されヘッダーが更新されないバグを修正）
  const year = scheduleCalendarMonth.getFullYear();
  const month = scheduleCalendarMonth.getMonth();
  const title = document.querySelector('#calendarContent .cal-month-title');
  if (title) title.textContent = `${year}年${month + 1}月`;
  renderScheduleCalendarGrid();
}

async function selectScheduleCalendarDate(dateStr) {
  const prevDate = scheduleCalendarSelectedDate ? formatDateForApi(scheduleCalendarSelectedDate) : null;
  scheduleCalendarSelectedDate = new Date(dateStr + 'T00:00:00+09:00');

  // 前の選択セルのスタイルをリセット（状態はクラスのみが担うので付け外しだけでよい）
  if (prevDate) {
    const prevCell = document.querySelector(`[data-cal-date="${prevDate}"]`);
    if (prevCell) prevCell.classList.remove('sel');
  }
  const newCell = document.querySelector(`[data-cal-date="${dateStr}"]`);
  if (newCell) newCell.classList.add('sel');

  await showScheduleCalendarDetail(dateStr);
}

// 週ビュー閲覧と同一クラス(.wv-grid/.wv-grid-cell/.wv-cell.on|.off等)を使った読み取り専用グリッド
function renderCalendarDetailGrid(dateStr, data) {
  const timeSlots = AppConfig.SCHEDULE.SLOTS;
  const timeLabels = AppConfig.SCHEDULE.LABEL_MAP;

  let html = '<div class="wv-grid">';
  html += '<div class="wv-grid-cell wv-grid-head"></div>';
  familyMembers.forEach(function(m) {
    html += '<div class="wv-grid-cell wv-grid-head">' + escapeHtml(getDisplayName(m)) + '</div>';
  });

  timeSlots.forEach(function(slot) {
    html += '<div class="wv-grid-cell wv-slot-label">' + timeLabels[slot] + '</div>';
    familyMembers.forEach(function(m) {
      const user = data.users.find(function(u) { return u.userId === m.userId; });
      const key = dateStr + ':' + slot;
      const on = !!(user && user.slots && user.slots[key]);
      html += '<div class="wv-grid-cell wv-cell ' + (on ? 'on' : 'off') + '">' + (on ? '◯' : '✕') + '</div>';
    });
  });
  html += '</div>';
  return html;
}

// その日が今週/来週(getCalendarWeekId/getNextWeekId)に該当すれば、該当サブタブへ切替して編集開始する
function calendarEditWeekFor(dateStr) {
  const weekId = getWeekId(new Date(dateStr + 'T00:00:00+09:00'));
  const target = weekId === getCalendarWeekId() ? 'thisWeek' : (weekId === getNextWeekId() ? 'nextWeek' : null);
  if (!target) return;
  switchScheduleSubTab(target).then(function() { scheduleStartEdit(); });
}

async function showScheduleCalendarDetail(dateStr) {
  const detail = document.getElementById('scheduleCalendarDetail');
  const date = new Date(dateStr + 'T00:00:00+09:00');
  const dayNames = AppConfig.SCHEDULE.DAYS;
  const dateDisplay = `${date.getMonth() + 1}/${date.getDate()}(${dayNames[date.getDay()]})`;
  const todayStr = formatDateForApi(new Date());
  const isToday = dateStr === todayStr;

  const weekId = getWeekId(date);
  const data = scheduleCalendarData[weekId];
  const canEditWeek = weekId === getCalendarWeekId() || weekId === getNextWeekId();

  let html = '<div class="cal-detail-head">';
  html += `<div class="cal-detail-date">${dateDisplay}`;
  if (isToday) html += ' <span class="wv-badge-today">きょう</span>';
  html += '</div>';
  if (canEditWeek) {
    html += `<button class="cal-detail-edit" onclick="calendarEditWeekFor('${dateStr}')"><i class="ph-bold ph-pencil-simple"></i>この週を編集</button>`;
  }
  html += '</div>';

  if (!data || !data.users) {
    html += '<p class="cal-empty">データがありません</p>';
  } else {
    html += renderCalendarDetailGrid(dateStr, data);

    // 備考表示（daizu-statusは除外）
    const notesHtml = [];
    data.users.forEach(function(user) {
      if (user.userId === 'daizu-status') return;
      if (user.notes && user.notes[dateStr]) {
        const calMember = familyMembers.find(function(m) { return m.userId === user.userId; });
        const calName = calMember ? getDisplayName(calMember) : user.displayName;
        notesHtml.push('<div class="wv-note-display"><strong>' + escapeHtml(calName) + '</strong>: ' + escapeHtml(user.notes[dateStr]) + '</div>');
      }
    });
    html += notesHtml.join('');
  }

  // だいずの様子（読み取り専用・ScheduleInputsのdaizu-status擬似ユーザー由来）
  if (data && data.users) {
    const daizuUser = data.users.find(function(u) { return u.userId === 'daizu-status'; });
    const daizuNote = daizuUser && daizuUser.notes ? (daizuUser.notes[dateStr] || '') : '';
    if (daizuNote) {
      html += '<div class="cal-daizu-note"><i class="ph-bold ph-paw-print"></i>';
      html += '<span><strong>だいずの様子</strong><div class="cal-daizu-note-text">' + escapeHtml(daizuNote) + '</div></span>';
      html += '</div>';
    }
  }

  // ダイ日記リンク（個別ジャンプ・既存ロジック維持）
  const dayDiaries = calendarDiaryPosts.filter(function(post) { return diaryDateForPost(post) === dateStr; });
  if (dayDiaries.length > 0) {
    html += '<div class="cal-section-title"><i class="ph-bold ph-book-open"></i>ダイ日記 (' + dayDiaries.length + '件)</div>';
    dayDiaries.forEach(function(post) {
      let text = post.text || '';
      const titleMatch = text.match(/\[TITLE:([^\]]+)\]/);
      const title = titleMatch ? titleMatch[1] : '';
      text = text.replace(/^\[DATE:[^\]]+\]/, '').replace(/^\[TITLE:[^\]]+\]/, '').replace(/^\[PHOTO_POS:[^\]]+\]/, '').replace(/^\[CATCH_IMG:[^\]]+\]/, '');
      const preview = text.replace(/<[^>]*>/g, '').substring(0, 60);
      const calMember = familyMembers.find(function(m) { return m.userId === post.userId; });
      const calName = calMember ? getDisplayName(calMember) : post.displayName;
      html += `<div class="cal-postlink diary" onclick="switchTab('diary');setTimeout(function(){diaryShowDetail('${post.postId}')},300)">`;
      html += '<i class="ph-bold ph-book-open"></i>';
      html += '<span class="cal-postlink-title"><strong>' + escapeHtml(title || calName) + '</strong>: ' + escapeHtml(preview) + (preview.length >= 60 ? '…' : '') + '</span>';
      html += '</div>';
    });
  }

  // 様子リンク（個別ジャンプ不要・一覧先頭へ）
  const dayYousu = calendarYousuPosts.filter(function(post) { return jstDateFromIso(post.createdAt) === dateStr; });
  if (dayYousu.length > 0) {
    const yousuPreview = (dayYousu[0].text || '').replace(/<[^>]*>/g, '').substring(0, 40);
    html += '<div class="cal-postlink yousu" onclick="switchTab(\'yousu\')">';
    html += '<i class="ph-bold ph-paw-print"></i>';
    html += '<span class="cal-postlink-title"><strong>様子</strong> (' + dayYousu.length + '件): ' + escapeHtml(yousuPreview) + (yousuPreview.length >= 40 ? '…' : '') + '</span>';
    html += '</div>';
  }

  detail.innerHTML = html;
}
