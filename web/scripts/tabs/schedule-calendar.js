// [SCHED:CAL] ========== カレンダーサブタブ ==========
// 依存: core/state.js, core/utils.js, schedule.js (controller)
let scheduleCalendarMonth = new Date();
let scheduleCalendarSelectedDate = null;
let scheduleCalendarData = {};

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

  detail.innerHTML = html;
}
