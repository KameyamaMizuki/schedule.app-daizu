// ========== [HOME:SCHEDULE] スケジュール確認/編集機能 ==========
// 依存（グローバル参照）:
//   state.js  : API_BASE_URL, familyMembers
//   utils.js  : formatDateForApi, getWeekId
//   home.js   : homeState, homeCalendarMonth, homeSelectedCalendarDate,
//               homeScheduleDataCache, homeHideAllAreas, homeSetRandomDogImage,
//               homeSetSpeechText, homeShowThinking, homeReturnToMenu

// スケジュール確認
function homeStartSchedule() {
  homeState = 'schedule_ask';
  homeSetRandomDogImage('normal');
  homeSetSpeechText('いつの予定が知りたいんだ？');
  homeHideAllAreas();
  homeCalendarMonth = new Date();
  homeSelectedCalendarDate = null;
  homeRenderCalendar();
  const el = document.getElementById('homeCalendarArea');
  if (el) { el.style.display = 'block'; el.classList.add('active'); }
}

function homeRenderCalendar() {
  const year = homeCalendarMonth.getFullYear();
  const month = homeCalendarMonth.getMonth();
  const titleEl = document.getElementById('homeCalendarTitle');
  if (titleEl) titleEl.textContent = `${year}年${month + 1}月`;
  const grid = document.getElementById('homeCalendarGrid');
  if (!grid) return;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const today = new Date();
  let html = '';
  ['日', '月', '火', '水', '木', '金', '土'].forEach(n => { html += `<div class="calendar-day-header">${n}</div>`; });
  const startDow = firstDay.getDay();
  const prevLastDay = new Date(year, month, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--) html += `<div class="calendar-day other-month">${prevLastDay - i}</div>`;
  const todayStr = formatDateForApi(today);
  const selectedStr = homeSelectedCalendarDate ? formatDateForApi(homeSelectedCalendarDate) : null;
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d);
    const dateStr = formatDateForApi(date);
    let cls = 'calendar-day';
    if (dateStr === todayStr) cls += ' today';
    if (dateStr === selectedStr) cls += ' selected';
    html += `<div class="${cls}" onclick="homeSelectCalendarDate('${dateStr}')">${d}</div>`;
  }
  const endDow = lastDay.getDay();
  for (let i = 1; i < 7 - endDow; i++) html += `<div class="calendar-day other-month">${i}</div>`;
  grid.innerHTML = html;
}

function homeChangeCalendarMonth(delta) {
  homeCalendarMonth.setMonth(homeCalendarMonth.getMonth() + delta);
  homeRenderCalendar();
}

function homeSelectCalendarDate(dateStr) {
  homeSelectedCalendarDate = new Date(dateStr + 'T00:00:00');
  homeRenderCalendar();
}

async function homeConfirmCalendarSelection() {
  if (!homeSelectedCalendarDate) { alert('日付を選んでくれ！'); return; }
  homeState = 'schedule_loading';
  const dateStr = formatDateForApi(homeSelectedCalendarDate);
  const weekId = getWeekId(homeSelectedCalendarDate);
  const [_, scheduleData] = await Promise.all([
    homeShowThinking(3000),
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/schedule/week/${weekId}`);
        if (res.ok) return await res.json();
      } catch (e) { console.error(e); }
      return null;
    })()
  ]);
  if (scheduleData) {
    homeScheduleDataCache = scheduleData;
    homeShowScheduleResult(dateStr, scheduleData);
  } else {
    homeState = 'schedule_error';
    homeSetRandomDogImage('sad');
    homeSetSpeechText('すまん、取得できなかった...');
    homeHideAllAreas();
    homeReturnToMenu(3000);
  }
}

function homeShowScheduleResult(dateStr, data) {
  homeState = 'schedule_show';
  homeSetRandomDogImage('normal');
  const date = new Date(dateStr + 'T00:00:00');
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const dateDisplay = `${date.getMonth() + 1}/${date.getDate()}(${dayNames[date.getDay()]})`;
  const timeSlots = ['allday', '09', '17', '21', '24'];
  const timeLabels = { allday: '終日', '09': '9時', '17': '17時', '21': '21時', '24': '24時' };
  let tableHtml = '<table class="schedule-table"><thead><tr><th>時間</th>';
  familyMembers.forEach(m => { tableHtml += `<th>${m.displayName}</th>`; });
  tableHtml += '</tr></thead><tbody>';
  timeSlots.forEach(slot => {
    tableHtml += `<tr><td>${timeLabels[slot]}</td>`;
    familyMembers.forEach(member => {
      const user = (data.users || []).find(u => u.userId === member.userId);
      const key = `${dateStr}:${slot}`;
      const avail = user && user.slots && user.slots[key];
      tableHtml += `<td class="${avail ? 'available' : 'unavailable'}">${avail ? '◯' : '✕'}</td>`;
    });
    tableHtml += '</tr>';
  });
  tableHtml += '</tbody></table>';
  homeSetSpeechText(`<span class="highlight">${dateDisplay}</span> の予定は<br>こんな感じだぜ！変更するか？`);
  homeHideAllAreas();
  const titleEl = document.getElementById('homeScheduleTitle');
  const contentEl = document.getElementById('homeScheduleContent');
  if (titleEl) titleEl.textContent = `${dateDisplay} の予定`;
  if (contentEl) contentEl.innerHTML = tableHtml;
  const display = document.getElementById('homeScheduleDisplay');
  if (display) { display.style.display = 'block'; display.classList.add('active'); }
  const choice = document.getElementById('homeChoiceButtons');
  if (choice) {
    choice.innerHTML = `
      <button class="choice-btn primary" onclick="homeStartScheduleEdit('${dateStr}')">変更したい！</button>
      <button class="choice-btn" onclick="homeConfirmScheduleDone()">そのままで！</button>
      <button class="back-btn" onclick="homeBackToCalendar()">別の日を確認</button>
    `;
    choice.style.display = 'flex';
    choice.classList.add('active');
  }
}

function homeBackToCalendar() {
  homeState = 'schedule_ask';
  homeSetRandomDogImage('normal');
  homeSetSpeechText('いつの予定が知りたいんだ？');
  homeHideAllAreas();
  homeRenderCalendar();
  const el = document.getElementById('homeCalendarArea');
  if (el) { el.style.display = 'block'; el.classList.add('active'); }
}

function homeBackToScheduleDisplay() {
  homeState = 'schedule_show';
  homeSetRandomDogImage('normal');
  const dateStr = formatDateForApi(homeSelectedCalendarDate);
  homeShowScheduleResult(dateStr, homeScheduleDataCache);
}

function homeConfirmScheduleDone() {
  homeState = 'schedule_done';
  homeSetRandomDogImage('happy');
  homeSetSpeechText('確認できたんだな！<br>いつもありがとうな！');
  homeHideAllAreas();
  homeReturnToMenu(3000);
}

function homeStartScheduleEdit(dateStr) {
  homeState = 'schedule_edit';
  homeSetRandomDogImage('normal');
  const date = new Date(dateStr + 'T00:00:00');
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const dateDisplay = `${date.getMonth() + 1}/${date.getDate()}(${dayNames[date.getDay()]})`;
  homeSetSpeechText(`${dateDisplay} の予定を変更するぜ！<br>誰の予定を変えるんだ？`);
  homeHideAllAreas();
  let html = '<div style="margin-bottom:16px">';
  html += '<label style="display:block;font-size:13px;color:#666;margin-bottom:8px;font-weight:600">メンバーを選択</label>';
  html += `<select id="homeEditMember" style="width:100%;padding:12px;border:2px solid #e0e0e0;border-radius:8px;font-size:14px" onchange="homeShowMemberSlots('${dateStr}')">`;
  html += '<option value="">選んでくれ</option>';
  familyMembers.forEach(m => { html += `<option value="${m.userId}">${m.displayName}</option>`; });
  html += '</select></div><div id="homeMemberSlots"></div>';
  const editContent = document.getElementById('homeScheduleEditContent');
  if (editContent) editContent.innerHTML = html;
  const edit = document.getElementById('homeScheduleEdit');
  if (edit) { edit.style.display = 'block'; edit.classList.add('active'); }
}

function homeShowMemberSlots(dateStr) {
  const userId = document.getElementById('homeEditMember')?.value;
  const slotsEl = document.getElementById('homeMemberSlots');
  if (!userId || !slotsEl) { if (slotsEl) slotsEl.innerHTML = ''; return; }
  const user = (homeScheduleDataCache.users || []).find(u => u.userId === userId);
  const timeSlots = ['allday', '09', '17', '21', '24'];
  const timeLabels = { allday: '終日', '09': '9時', '17': '17時', '21': '21時', '24': '24時' };
  let html = '<div class="home-slot-group">';
  timeSlots.forEach(slot => {
    const key = `${dateStr}:${slot}`;
    const checked = user && user.slots && user.slots[key];
    html += `<label class="home-slot-checkbox"><input type="checkbox" data-slot="${key}" ${checked ? 'checked' : ''}><span>${timeLabels[slot]}</span></label>`;
  });
  html += '</div>';
  slotsEl.innerHTML = html;
}

async function homeSubmitScheduleEdit() {
  const userId = document.getElementById('homeEditMember')?.value;
  if (!userId) { alert('メンバーを選んでくれ！'); return; }
  const member = familyMembers.find(m => m.userId === userId);
  const checkboxes = document.querySelectorAll('#homeMemberSlots input[type="checkbox"]');
  const slots = {};
  checkboxes.forEach(cb => { slots[cb.dataset.slot] = cb.checked; });
  homeState = 'schedule_saving';
  const weekId = getWeekId(homeSelectedCalendarDate);
  const user = (homeScheduleDataCache.users || []).find(u => u.userId === userId);
  const existingSlots = user ? { ...user.slots } : {};
  const mergedSlots = { ...existingSlots, ...slots };
  const [_] = await Promise.all([
    homeShowThinking(3000),
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/schedule/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            weekId, userId, displayName: member.displayName,
            slots: mergedSlots, notes: user?.notes || {}
          })
        });
        if (!res.ok) throw new Error('保存失敗');
        homeState = 'schedule_edit_done';
        homeSetRandomDogImage('happy');
        homeSetSpeechText('予定を変更しといたぞ！<br>いつもありがとうな！');
        homeHideAllAreas();
        homeReturnToMenu(3000);
      } catch (e) {
        homeState = 'schedule_edit_error';
        homeSetRandomDogImage('sad');
        homeSetSpeechText('すまん、保存できなかった...<br>もう一回試してくれ！');
        homeHideAllAreas();
        homeReturnToMenu(3000);
      }
    })()
  ]);
}
