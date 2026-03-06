// [SCHED:CAL] ========== カレンダーサブタブ ==========
// 依存: core/state.js, core/utils.js, schedule.js (controller)
let scheduleCalendarMonth = new Date();
let scheduleCalendarSelectedDate = null;
let scheduleCalendarData = {};
let calendarDiaryPosts = [];
let calendarTsubuyakiPosts = [];

async function preloadCalendarPosts() {
  try {
    const [diaryRes, postRes] = await Promise.all([
      fetch(`${API_BASE_URL}${AppConfig.API.POSTS}?type=DIARY`),
      fetch(`${API_BASE_URL}${AppConfig.API.POSTS}?type=POST`)
    ]);
    if (diaryRes.ok) {
      const d = await diaryRes.json();
      calendarDiaryPosts = d.posts || [];
    }
    if (postRes.ok) {
      const p = await postRes.json();
      calendarTsubuyakiPosts = p.posts || [];
    }
  } catch (e) {
    console.error('Posts preload failed:', e);
  }
}

async function renderScheduleCalendar() {
  const container = document.getElementById('calendarContent');
  const year = scheduleCalendarMonth.getFullYear();
  const month = scheduleCalendarMonth.getMonth();

  let html = '<div class="calendar-container" style="background:#fff;border-radius:8px;padding:16px;margin-bottom:16px">';
  html += '<div class="calendar-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">';
  html += `<button onclick="changeScheduleCalendarMonth(-1)" style="background:${AppConfig.CALENDAR_COLORS.PRIMARY};color:#fff;border:none;padding:8px 12px;border-radius:4px;cursor:pointer;font-size:14px">◀</button>`;
  html += `<h2 style="font-size:16px;color:#495057;margin:0">${year}年${month + 1}月</h2>`;
  html += `<button onclick="changeScheduleCalendarMonth(1)" style="background:${AppConfig.CALENDAR_COLORS.PRIMARY};color:#fff;border:none;padding:8px 12px;border-radius:4px;cursor:pointer;font-size:14px">▶</button>`;
  html += '</div>';
  html += '<div class="calendar-grid" id="scheduleCalendarGrid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px"></div>';
  html += '</div>';
  html += '<div id="scheduleCalendarDetail" style="background:#fff;border-radius:8px;padding:16px"></div>';

  container.innerHTML = html;
  await preloadCalendarPosts();
  await renderScheduleCalendarGrid();
}

async function renderScheduleCalendarGrid() {
  const grid = document.getElementById('scheduleCalendarGrid');
  const year = scheduleCalendarMonth.getFullYear();
  const month = scheduleCalendarMonth.getMonth();
  const today = new Date();
  const todayStr = formatDateForApi(today);

  let html = '';
  const dayNames = AppConfig.SCHEDULE.DAYS;
  dayNames.forEach((name, i) => {
    const color = i === 0 ? AppConfig.CALENDAR_COLORS.SUNDAY : i === 6 ? AppConfig.CALENDAR_COLORS.SATURDAY : AppConfig.CALENDAR_COLORS.WEEKDAY;
    html += `<div style="text-align:center;font-size:12px;color:${color};padding:8px 0;font-weight:600">${name}</div>`;
  });

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // 月の範囲のスケジュールデータをプリロード
  await preloadMonthScheduleData(year, month);

  // 前月の日
  const startDayOfWeek = firstDay.getDay();
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    html += `<div style="text-align:center;padding:10px 4px;color:#ccc;font-size:14px">${prevMonthLastDay - i}</div>`;
  }

  // 当月の日
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date = new Date(year, month, day);
    const dateStr = formatDateForApi(date);
    const isToday = dateStr === todayStr;
    const isSelected = scheduleCalendarSelectedDate && formatDateForApi(scheduleCalendarSelectedDate) === dateStr;
    const dayOfWeek = date.getDay();

    let bgColor = isSelected ? AppConfig.CALENDAR_COLORS.PRIMARY : isToday ? AppConfig.CALENDAR_COLORS.TODAY_BG : '#fff';
    let textColor = isSelected ? '#fff' : dayOfWeek === 0 ? AppConfig.CALENDAR_COLORS.SUNDAY : dayOfWeek === 6 ? AppConfig.CALENDAR_COLORS.SATURDAY : '#333';
    let fontWeight = isToday || isSelected ? '600' : '400';

    // スケジュール状態インジケーター
    const status = getDateScheduleStatus(dateStr);
    let indicator = '';
    if (status === 'all') indicator = `<span style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:6px;height:6px;background:${AppConfig.CALENDAR_COLORS.STATUS_ALL};border-radius:50%"></span>`;
    else if (status === 'partial') indicator = `<span style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:6px;height:6px;background:${AppConfig.CALENDAR_COLORS.STATUS_PARTIAL};border-radius:50%"></span>`;
    else if (status === 'self') indicator = `<span style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:6px;height:6px;background:${AppConfig.CALENDAR_COLORS.STATUS_SELF};border-radius:50%"></span>`;
    else if (status === 'none') indicator = `<span style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:6px;height:6px;background:${AppConfig.CALENDAR_COLORS.STATUS_NONE};border-radius:50%"></span>`;

    html += `<div onclick="selectScheduleCalendarDate('${dateStr}')" style="position:relative;text-align:center;padding:10px 4px;border-radius:6px;cursor:pointer;font-size:14px;min-height:44px;display:flex;align-items:center;justify-content:center;background:${bgColor};color:${textColor};font-weight:${fontWeight}">${day}${indicator}</div>`;
  }

  // 次月の日
  const endDayOfWeek = lastDay.getDay();
  for (let i = 1; i < 7 - endDayOfWeek; i++) {
    html += `<div style="text-align:center;padding:10px 4px;color:#ccc;font-size:14px">${i}</div>`;
  }

  grid.innerHTML = html;

  // 今日の詳細を表示
  if (!scheduleCalendarSelectedDate) {
    scheduleCalendarSelectedDate = today;
  }
  await showScheduleCalendarDetail(formatDateForApi(scheduleCalendarSelectedDate));
}

async function preloadMonthScheduleData(year, month) {
  // 月の最初と最後の日を含む週のデータを取得
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const weekIds = new Set();
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    weekIds.add(getWeekId(new Date(d)));
  }

  for (const weekId of weekIds) {
    if (!scheduleCalendarData[weekId]) {
      try {
        const response = await fetch(`${API_BASE_URL}${AppConfig.API.SCHEDULE_WEEK}/${weekId}`);
        if (response.ok) {
          scheduleCalendarData[weekId] = await response.json();
        }
      } catch (e) {
        console.error('Failed to load schedule data:', e);
      }
    }
  }
}

function getDateScheduleStatus(dateStr) {
  const weekId = getWeekId(new Date(dateStr + 'T00:00:00+09:00'));
  const data = scheduleCalendarData[weekId];
  if (!data || !data.users || data.users.length === 0) return null;

  const usersWithSlots = data.users.filter(u => {
    if (u.userId === 'daizu-status') return false;
    const slots = u.slots || {};
    return Object.keys(slots).some(k => k.startsWith(dateStr) && slots[k]);
  });

  if (usersWithSlots.length === familyMembers.length) return 'all';
  if (usersWithSlots.length > 1) return 'partial';
  if (usersWithSlots.length === 1) return 'self';
  return 'none';
}

function changeScheduleCalendarMonth(delta) {
  scheduleCalendarMonth.setMonth(scheduleCalendarMonth.getMonth() + delta);
  renderScheduleCalendarGrid();
}

async function selectScheduleCalendarDate(dateStr) {
  scheduleCalendarSelectedDate = new Date(dateStr + 'T00:00:00+09:00');
  await renderScheduleCalendarGrid();
}

async function showScheduleCalendarDetail(dateStr) {
  const detail = document.getElementById('scheduleCalendarDetail');
  const date = new Date(dateStr + 'T00:00:00+09:00');
  const dayNames = AppConfig.SCHEDULE.DAYS;
  const dateDisplay = `${date.getMonth() + 1}/${date.getDate()}(${dayNames[date.getDay()]})`;

  const weekId = getWeekId(date);
  const data = scheduleCalendarData[weekId];

  let html = `<h3 style="font-size:14px;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid ${AppConfig.CALENDAR_COLORS.PRIMARY};color:#495057">${dateDisplay} の予定</h3>`;

  if (!data || !data.users) {
    html += `<p style="color:${AppConfig.CALENDAR_COLORS.WEEKDAY};text-align:center">データがありません</p>`;
  } else {
    const timeSlots = AppConfig.SCHEDULE.SLOTS;
    const timeLabels = AppConfig.SCHEDULE.LABEL_MAP;

    html += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    html += '<thead><tr><th style="padding:6px;text-align:left;border:1px solid #dee2e6;background:#f8f9fa">時間</th>';
    familyMembers.forEach(m => {
      html += `<th style="padding:6px;text-align:center;border:1px solid #dee2e6;background:#f8f9fa">${getDisplayName(m)}</th>`;
    });
    html += '</tr></thead><tbody>';

    timeSlots.forEach(slot => {
      html += `<tr><td style="padding:6px;border:1px solid #dee2e6;font-weight:600">${timeLabels[slot]}</td>`;
      familyMembers.forEach(member => {
        const user = data.users.find(u => u.userId === member.userId);
        const key = `${dateStr}:${slot}`;
        const isAvailable = user && user.slots && user.slots[key];
        const bgColor = isAvailable ? '#d4edda' : '#f8d7da';
        const textColor = isAvailable ? '#155724' : '#721c24';
        html += `<td style="padding:6px;text-align:center;border:1px solid #dee2e6;background:${bgColor};color:${textColor}">${isAvailable ? '◯' : '✕'}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';

    // 備考表示
    const notesHtml = [];
    data.users.forEach(user => {
      if (user.notes && user.notes[dateStr]) {
        const calMember = familyMembers.find(m => m.userId === user.userId);
        const calName = calMember ? getDisplayName(calMember) : user.displayName;
        notesHtml.push(`<div style="margin-top:8px;padding:8px;background:${AppConfig.CALENDAR_COLORS.TODAY_BG};border-left:3px solid ${AppConfig.CALENDAR_COLORS.STATUS_SELF};font-size:12px"><strong>${calName}:</strong> ${user.notes[dateStr]}</div>`);
      }
    });
    if (notesHtml.length > 0) {
      html += notesHtml.join('');
    }
  }

  // だいずの様子
  html += renderDaizuStatusSection(dateStr, data);

  // ダイ日記の表示
  const dayDiaries = calendarDiaryPosts.filter(post => {
    const dateMatch = (post.text || '').match(/^\[DATE:(\d{4}-\d{2}-\d{2})\]/);
    if (dateMatch) return dateMatch[1] === dateStr;
    return post.createdAt && post.createdAt.startsWith(dateStr);
  });

  if (dayDiaries.length > 0) {
    html += `<h4 style="margin-top:16px;font-size:13px;color:#8d6e63;border-bottom:1px solid #f0ebe6;padding-bottom:6px">📔 ダイ日記 (${dayDiaries.length}件)</h4>`;
    dayDiaries.forEach(post => {
      let text = post.text || '';
      const titleMatch = text.match(/\[TITLE:([^\]]+)\]/);
      const title = titleMatch ? titleMatch[1] : '';
      text = text.replace(/^\[DATE:[^\]]+\]/, '').replace(/^\[TITLE:[^\]]+\]/, '').replace(/^\[PHOTO_POS:[^\]]+\]/, '').replace(/^\[CATCH_IMG:[^\]]+\]/, '');
      const preview = text.replace(/<[^>]*>/g, '').substring(0, 60);
      const calMember = familyMembers.find(m => m.userId === post.userId);
      const calName = calMember ? getDisplayName(calMember) : post.displayName;
      html += `<div onclick="switchTab('diary');setTimeout(function(){diaryShowDetail('${post.postId}')},300)" style="padding:8px;margin:4px 0;background:#f5f0eb;border-radius:6px;cursor:pointer;font-size:12px">
        <strong>${escapeHtml(title || calName)}</strong>: ${escapeHtml(preview)}${preview.length >= 60 ? '...' : ''}
      </div>`;
    });
  }

  // つぶやきの表示
  const dayPosts = calendarTsubuyakiPosts.filter(post => {
    return post.createdAt && post.createdAt.startsWith(dateStr);
  });

  if (dayPosts.length > 0) {
    html += `<h4 style="margin-top:12px;font-size:13px;color:#1976d2;border-bottom:1px solid #e3f2fd;padding-bottom:6px">☁️ つぶやき (${dayPosts.length}件)</h4>`;
    dayPosts.forEach(post => {
      const calMember = familyMembers.find(m => m.userId === post.userId);
      const calName = calMember ? getDisplayName(calMember) : post.displayName;
      const preview = (post.text || '').substring(0, 60);
      html += `<div style="padding:8px;margin:4px 0;background:#e3f2fd;border-radius:6px;font-size:12px">
        <strong>${escapeHtml(calName)}</strong>: ${escapeHtml(preview)}${preview.length >= 60 ? '...' : ''}
      </div>`;
    });
  }

  detail.innerHTML = html;
}

/**
 * だいずの様子セクションを生成
 */
function renderDaizuStatusSection(dateStr, data) {
  const daizuUser = data && data.users ? data.users.find(u => u.userId === 'daizu-status') : null;
  const existingNote = daizuUser && daizuUser.notes ? (daizuUser.notes[dateStr] || '') : '';

  let html = '<div style="margin-top:16px;padding:12px;background:#fff8e1;border-radius:8px;border:1px solid #ffe082">';
  html += '<h4 style="font-size:13px;color:#f57f17;margin:0 0 8px 0">🐕 だいずの様子</h4>';

  if (existingNote) {
    html += `<div id="daizuStatusDisplay" style="font-size:13px;color:#333;line-height:1.5;white-space:pre-wrap;margin-bottom:8px">${escapeHtml(existingNote)}</div>`;
  }

  html += `<textarea id="daizuStatusInput" placeholder="今日のだいずの様子を入力..." style="width:100%;min-height:60px;padding:8px;border:1px solid #ffe082;border-radius:6px;font-size:13px;resize:vertical;box-sizing:border-box;font-family:inherit">${escapeHtml(existingNote)}</textarea>`;
  html += `<button onclick="saveDaizuStatus('${dateStr}')" style="margin-top:8px;background:#f57f17;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;width:100%">保存</button>`;
  html += '</div>';

  return html;
}

/**
 * だいずの様子を保存
 */
async function saveDaizuStatus(dateStr) {
  const input = document.getElementById('daizuStatusInput');
  const note = input.value.trim();
  const weekId = getWeekId(new Date(dateStr + 'T00:00:00+09:00'));

  // 既存のだいずデータを取得して notes をマージ
  const daizuUser = scheduleCalendarData[weekId] && scheduleCalendarData[weekId].users
    ? scheduleCalendarData[weekId].users.find(u => u.userId === 'daizu-status')
    : null;
  const existingNotes = daizuUser && daizuUser.notes ? { ...daizuUser.notes } : {};
  existingNotes[dateStr] = note;

  try {
    const response = await fetch(`${API_BASE_URL}${AppConfig.API.SCHEDULE_SUBMIT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weekId: weekId,
        userId: 'daizu-status',
        displayName: 'だいず',
        slots: {},
        notes: existingNotes,
        skipNotification: true
      })
    });

    if (response.ok) {
      // キャッシュを更新
      if (scheduleCalendarData[weekId]) {
        if (daizuUser) {
          daizuUser.notes = existingNotes;
        } else {
          scheduleCalendarData[weekId].users = scheduleCalendarData[weekId].users || [];
          scheduleCalendarData[weekId].users.push({
            userId: 'daizu-status',
            displayName: 'だいず',
            slots: {},
            notes: existingNotes
          });
        }
      }
      showToast('だいずの様子を保存しました');
    } else {
      showToast('保存に失敗しました');
    }
  } catch (e) {
    console.error('Failed to save daizu status:', e);
    showToast('保存に失敗しました');
  }
}
