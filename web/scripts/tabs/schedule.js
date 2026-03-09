// [SCHED:COMMON] ========== スケジュールタブ — 共通状態・サブタブ切替 ==========
let thisWeekId = '';
let allSchedules = [];
let currentWeekInfo = {};

function updateWeekStatus() {
  const startDate = new Date(currentWeekInfo.startDate);
  const endDate = new Date(currentWeekInfo.endDate);
  const deadline = new Date(currentWeekInfo.deadline);
  const startStr = `${startDate.getMonth() + 1}/${startDate.getDate()}`;
  const endStr = `${endDate.getMonth() + 1}/${endDate.getDate()}`;
  const deadlineStr = `${deadline.getMonth() + 1}/${deadline.getDate()} ${deadline.getHours()}:${String(deadline.getMinutes()).padStart(2, '0')}`;

  const statusText = currentWeekInfo.isLocked ? '集計済' : `集計中（締切 ${deadlineStr}）`;
  window.weekStatusText = `${startStr}〜${endStr} ${statusText}`;
}

var currentScheduleSubTab = 'calendar'; // var: dashboard.js からも参照される

async function switchScheduleSubTab(subTab) {
  currentScheduleSubTab = subTab;

  // サブタブのアクティブ状態を更新
  document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
  const subTabNames = ['calendar', 'thisWeek', 'nextWeek'];
  const index = subTabNames.indexOf(subTab);
  if (index !== -1) {
    document.querySelectorAll('.sub-tab')[index].classList.add('active');
  }

  // 全コンテンツを非表示にしてから該当コンテンツを表示
  document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));

  if (subTab === 'calendar') {
    document.getElementById('calendarContent').classList.add('active');
    if (!window.calendarLoaded) {
      await renderScheduleCalendar();
      window.calendarLoaded = true;
    }
  } else if (subTab === 'thisWeek') {
    document.getElementById('thisWeekContent').classList.add('active');
    // 週IDをリセットして最新の週を再取得（日曜境界対策）
    thisWeekSelectedWeekId = null;
    await renderThisWeek();
    window.thisWeekLoaded = true;
  } else if (subTab === 'nextWeek') {
    document.getElementById('nextWeekContent').classList.add('active');
    // 週IDをリセットして最新の週を再取得（日曜境界対策）
    nextWeekSelectedWeekId = null;
    await renderNextWeek();
    window.nextWeekLoaded = true;
  }
}

// ========== 共有ユーティリティ（サブタブ間で使用） ==========

// hasDefaultSchedule なメンバー向け: 週全スロットを全て true で返す
function buildAllTrueSlots(weekId) {
  const slots = {};
  const dates = generate7DaysFromMonday(weekId);
  ['allday', '09', '17', '21', '24'].forEach(function(slot) {
    dates.forEach(function(dateStr) {
      slots[dateStr + ':' + slot] = true;
    });
  });
  return slots;
}

function formatWeekRange(weekId) {
  const { monday, sunday } = getWeekDateRange(weekId);
  const dayNames = AppConfig.SCHEDULE.DAYS;
  const startDow = dayNames[monday.getDay()];
  const endDow = dayNames[sunday.getDay()];
  const startStr = `${monday.getFullYear()}/${String(monday.getMonth() + 1).padStart(2, '0')}/${String(monday.getDate()).padStart(2, '0')}(${startDow})`;
  const endStr = `${sunday.getFullYear()}/${String(sunday.getMonth() + 1).padStart(2, '0')}/${String(sunday.getDate()).padStart(2, '0')}(${endDow})`;
  return `${startStr}～${endStr}`;
}

let weekPickerTarget = 'adjust';

// [SCHED:PICKER] ========== 週選択ピッカー（共有） ==========
function openWeekPicker() {
  weekPickerTarget = 'adjust';
  document.getElementById('weekPickerModal').classList.add('active');
  document.getElementById('weekPickerDate').value = selectedInputWeekId || getNextWeekId();
}

function closeWeekPicker() {
  document.getElementById('weekPickerModal').classList.remove('active');
}

async function confirmWeekSelection() {
  const dateInput = document.getElementById('weekPickerDate').value;
  if (!dateInput) return;

  const selectedDate = new Date(dateInput + 'T00:00:00+09:00');
  const day = selectedDate.getDay();
  const daysFromMonday = (day === 0) ? -6 : (1 - day);
  selectedDate.setDate(selectedDate.getDate() + daysFromMonday);

  const year = selectedDate.getFullYear();
  const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
  const date = String(selectedDate.getDate()).padStart(2, '0');
  const newWeekId = `${year}-${month}-${date}`;

  closeWeekPicker();

  if (weekPickerTarget === 'thisWeek') {
    thisWeekSelectedWeekId = newWeekId;
    thisWeekEditMode = false;
    await renderThisWeek();
  } else if (weekPickerTarget === 'nextWeek') {
    nextWeekSelectedWeekId = newWeekId;
    nextWeekEditMode = false;
    await renderNextWeek();
  } else {
    selectedInputWeekId = newWeekId;
    await loadAllSchedulesForWeek(selectedInputWeekId);
    renderAdjust();
  }
}

// [SCHED:INPUT] ========== スケジュール入力タブ ==========
let selectedInputWeekId = null;
let currentMemberFilter = 'all';

async function loadAllSchedulesForWeek(targetWeekId) {
  allSchedules = [];
  try {
    const response = await fetch(`${API_BASE_URL}${AppConfig.API.SCHEDULE_WEEK}/${targetWeekId}`);
    if (!response.ok) {
      for (const member of familyMembers) {
        allSchedules.push({userId: member.userId, displayName: member.displayName, weekId: targetWeekId, startDate: '', endDate: '', deadline: '', isLocked: false, slots: {}, notes: {}});
      }
      return;
    }

    const data = await response.json();
    for (const member of familyMembers) {
      const userData = data.users.find(u => u.userId === member.userId);
      if (userData) {
        allSchedules.push({
          userId: userData.userId,
          displayName: userData.displayName,
          weekId: data.weekId,
          startDate: data.startDate,
          endDate: data.endDate,
          deadline: data.deadline,
          isLocked: data.isLocked,
          slots: userData.slots || {},
          notes: userData.notes || {}
        });
      } else {
        allSchedules.push({userId: member.userId, displayName: member.displayName, weekId: data.weekId, startDate: data.startDate, endDate: data.endDate, deadline: data.deadline, isLocked: data.isLocked, slots: {}, notes: {}});
      }
    }

    if (allSchedules.length > 0 && allSchedules[0].startDate) {
      currentWeekInfo = allSchedules[0];
    }
  } catch (error) {
    for (const member of familyMembers) {
      allSchedules.push({userId: member.userId, displayName: member.displayName, weekId: targetWeekId, startDate: '', endDate: '', deadline: '', isLocked: false, slots: {}, notes: {}});
    }
  }
}

function filterByMember() {
  const filter = document.getElementById('memberFilter').value;
  currentMemberFilter = filter;
  const sections = document.querySelectorAll('.member-section');
  sections.forEach(section => {
    const userId = section.dataset.userId;
    section.style.display = (filter === 'all' || userId === filter) ? 'block' : 'none';
  });
}


function renderAdjust() {
  const container = document.getElementById('adjustContent');
  if (allSchedules.length === 0) {
    container.innerHTML = '<div class="error">データがありません</div>';
    return;
  }

  const currentWeek = selectedInputWeekId || weekId;
  const { monday, sunday } = getWeekDateRange(currentWeek);
  const dayNames = AppConfig.SCHEDULE.DAYS;

  let html = '';

  html += '<div class="week-selector-section">';
  html += `<span id="currentWeekDisplay" style="font-weight:600;font-size:14px;color:#495057">入力週: ${monday.getFullYear()}/${String(monday.getMonth() + 1).padStart(2, '0')}/${String(monday.getDate()).padStart(2, '0')}(${dayNames[monday.getDay()]})〜${sunday.getFullYear()}/${String(sunday.getMonth() + 1).padStart(2, '0')}/${String(sunday.getDate()).padStart(2, '0')}(${dayNames[sunday.getDay()]})</span>`;
  html += '<button class="period-change-btn" onclick="openWeekPicker()">期間変更</button>';
  html += '</div>';

  html += '<div class="filter-section">';
  html += '<select id="memberFilter" onchange="filterByMember()">';
  html += `<option value="all" ${currentMemberFilter === 'all' ? 'selected' : ''}>全員</option>`;
  familyMembers.forEach(member => {
    const selected = currentMemberFilter === member.userId ? 'selected' : '';
    html += `<option value="${member.userId}" ${selected}>${getDisplayName(member)}</option>`;
  });
  html += '</select>';
  html += '</div>';

  allSchedules.forEach(schedule => {
    const displayStyle = (currentMemberFilter === 'all' || currentMemberFilter === schedule.userId) ? 'block' : 'none';
    html += `<div class="member-section" data-user-id="${schedule.userId}" style="display:${displayStyle}">`;
    const memberConfig = familyMembers.find(m => m.userId === schedule.userId);
    const hasDefaultBtn = memberConfig && memberConfig.hasDefaultSchedule;
    const defaultBtn = hasDefaultBtn ? `<button class="save-btn" style="background:#4CAF50;margin-right:6px" onclick="applySaikoDefaults('${schedule.userId}')">デフォルト</button>` : '';
    html += `<div class="member-header">${getDisplayNameByUserId(schedule.userId)}${defaultBtn}<button class="save-btn" onclick="saveSchedule('${schedule.userId}')">保存</button></div>`;

    const currentWeekForDates = selectedInputWeekId || weekId;
    const dates = generate7DaysFromMonday(currentWeekForDates);

    dates.forEach((dateStr) => {
      const date = new Date(dateStr + 'T00:00:00+09:00');
      const dayOfWeek = dayNames[date.getDay()];
      html += `<div class="day-section">`;
      html += `<div class="day-title">${formatDate(dateStr)}(${dayOfWeek})</div>`;
      html += `<div class="slot-group">`;
      html += renderSlotCheckbox(schedule.userId, dateStr, 'allday', '終日', schedule.slots);
      html += renderSlotCheckbox(schedule.userId, dateStr, '09', '9時', schedule.slots);
      html += renderSlotCheckbox(schedule.userId, dateStr, '17', '17時', schedule.slots);
      html += renderSlotCheckbox(schedule.userId, dateStr, '21', '21時', schedule.slots);
      html += renderSlotCheckbox(schedule.userId, dateStr, '24', '24時', schedule.slots);
      html += `</div>`;

      const noteValue = schedule.notes[dateStr] || '';
      html += `<input type="text" class="note-input" placeholder="備考" data-user="${schedule.userId}" data-date="${dateStr}" value="${noteValue}" style="width:100%;padding:6px;border:1px solid #dee2e6;border-radius:4px;font-size:12px;margin-top:6px">`;

      html += `</div>`;
    });

    html += `</div>`;
  });

  container.innerHTML = html;

  const alldayCheckboxes = container.querySelectorAll('input[data-slot$=":allday"]');
  alldayCheckboxes.forEach(alldayCheckbox => {
    alldayCheckbox.addEventListener('change', function() {
      if (this.checked) {
        const slotKey = this.dataset.slot;
        const dateStr = slotKey.split(':')[0];
        const userId = this.dataset.user;
        const otherSlots = container.querySelectorAll(`input[data-user="${userId}"][data-slot^="${dateStr}:"]:not([data-slot$=":allday"])`);
        otherSlots.forEach(slot => slot.checked = true);
      }
    });
  });
}

function renderSlotCheckbox(userId, dateStr, timeSlot, label, slots) {
  const slotKey = `${dateStr}:${timeSlot}`;
  const checked = slots[slotKey] ? 'checked' : '';
  const onchangeHandler = timeSlot === 'allday'
    ? `onchange="toggleAllDaySlots('${userId}','${dateStr}',this.checked)"`
    : '';
  return `<label class="slot-checkbox"><input type="checkbox" data-user="${userId}" data-slot="${slotKey}" ${checked} ${onchangeHandler}><span>${label}</span></label>`;
}

function toggleAllDaySlots(userId, dateStr, checked) {
  const timeSlots = ['09', '17', '21', '24'];
  timeSlots.forEach(slot => {
    const slotKey = `${dateStr}:${slot}`;
    const checkbox = document.querySelector(`input[data-user="${userId}"][data-slot="${slotKey}"]`);
    if (checkbox) {
      checkbox.checked = checked;
    }
  });
}

// 才子のデフォルト設定を適用
// 平日: 21時=○、24時=○
// 土日: 終日=○（全スロット=○）
function applySaikoDefaults(userId) {
  const currentWeek = selectedInputWeekId || weekId;
  const dates = generate7DaysFromMonday(currentWeek);

  dates.forEach(dateStr => {
    const date = new Date(dateStr + 'T00:00:00+09:00');
    const dayOfWeek = date.getDay(); // 0=日, 6=土
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

    // 全スロットを取得
    const alldayCheckbox = document.querySelector(`input[data-user="${userId}"][data-slot="${dateStr}:allday"]`);
    const slot09 = document.querySelector(`input[data-user="${userId}"][data-slot="${dateStr}:09"]`);
    const slot17 = document.querySelector(`input[data-user="${userId}"][data-slot="${dateStr}:17"]`);
    const slot21 = document.querySelector(`input[data-user="${userId}"][data-slot="${dateStr}:21"]`);
    const slot24 = document.querySelector(`input[data-user="${userId}"][data-slot="${dateStr}:24"]`);

    if (isWeekend) {
      // 土日: 終日=○、全スロット=○
      if (alldayCheckbox) alldayCheckbox.checked = true;
      if (slot09) slot09.checked = true;
      if (slot17) slot17.checked = true;
      if (slot21) slot21.checked = true;
      if (slot24) slot24.checked = true;
    } else {
      // 平日: 終日=×、9時=×、17時=×、21時=○、24時=○
      if (alldayCheckbox) alldayCheckbox.checked = false;
      if (slot09) slot09.checked = false;
      if (slot17) slot17.checked = false;
      if (slot21) slot21.checked = true;
      if (slot24) slot24.checked = true;
    }
  });
}

async function saveSchedule(userId) {
  try {
    const member = familyMembers.find(m => m.userId === userId);
    const displayName = member ? member.displayName : userId;
    const currentWeekToSave = selectedInputWeekId || weekId;
    const checkboxes = document.querySelectorAll(`input[data-user="${userId}"][data-slot]`);
    const slots = {};
    checkboxes.forEach(cb => {
      slots[cb.dataset.slot] = cb.checked;
    });

    const noteInputs = document.querySelectorAll(`input[data-user="${userId}"][data-date]`);
    const notes = {};
    noteInputs.forEach(input => {
      if (input.value.trim()) {
        notes[input.dataset.date] = input.value.trim();
      }
    });

    const response = await fetch(`${API_BASE_URL}${AppConfig.API.SCHEDULE_SUBMIT}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({weekId: currentWeekToSave, userId, displayName, slots, notes})
    });

    if (!response.ok) throw new Error('保存に失敗しました');

    alert(`${getDisplayNameByUserId(userId)}さんのスケジュールを保存しました`);
    await loadAllSchedulesForWeek(currentWeekToSave);
    renderAdjust();
  } catch (error) {
    alert('保存に失敗しました: ' + error.message);
  }
}


// [SCHED:EDIT] ========== 編集モーダル ==========
let editingWeekId = '';

async function openEditModal(weekId) {
  editingWeekId = weekId;
  const modal = document.getElementById('editModal');
  const modalBody = document.getElementById('editModalBody');
  const modalTitle = document.getElementById('editModalTitle');
  modal.classList.add('active');
  modalTitle.textContent = `スケジュール編集 - ${formatWeekRange(weekId)}`;
  modalBody.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    const schedules = [];
    const response = await fetch(`${API_BASE_URL}${AppConfig.API.SCHEDULE_WEEK}/${weekId}`);
    if (response.ok) {
      const data = await response.json();
      for (const member of familyMembers) {
        const userData = data.users.find(u => u.userId === member.userId);
        if (userData) {
          schedules.push({
            userId: userData.userId,
            displayName: userData.displayName,
            weekId: data.weekId,
            startDate: data.startDate,
            endDate: data.endDate,
            slots: userData.slots || {},
            notes: userData.notes || {}
          });
        } else {
          schedules.push({
            userId: member.userId,
            displayName: member.displayName,
            weekId: data.weekId,
            startDate: data.startDate,
            endDate: data.endDate,
            slots: {},
            notes: {}
          });
        }
      }
    }

    if (schedules.length === 0) {
      modalBody.innerHTML = '<div class="error">データが見つかりません</div>';
      return;
    }
    renderEditForm(schedules, modalBody);
  } catch (error) {
    modalBody.innerHTML = '<div class="error">読み込み失敗</div>';
  }
}

let editMemberFilter = 'all';

function filterEditMembers() {
  const filter = document.getElementById('editMemberFilter').value;
  editMemberFilter = filter;
  const sections = document.querySelectorAll('#editModalBody .member-section');
  sections.forEach(section => {
    const userId = section.dataset.userId;
    section.style.display = (filter === 'all' || userId === filter) ? 'block' : 'none';
  });
}

function renderEditForm(schedules, container) {
  const firstSchedule = schedules[0];
  const dates = getDatesArray(firstSchedule.startDate, firstSchedule.endDate);
  const dayNames = AppConfig.SCHEDULE.DAYS;

  let html = '';

  html += '<div class="filter-section">';
  html += '<select id="editMemberFilter" onchange="filterEditMembers()">';
  html += `<option value="all" ${editMemberFilter === 'all' ? 'selected' : ''}>全員</option>`;
  familyMembers.forEach(member => {
    const selected = editMemberFilter === member.userId ? 'selected' : '';
    html += `<option value="${member.userId}" ${selected}>${member.displayName}</option>`;
  });
  html += '</select>';
  html += '</div>';

  schedules.forEach(schedule => {
    const displayStyle = (editMemberFilter === 'all' || editMemberFilter === schedule.userId) ? 'block' : 'none';
    html += `<div class="member-section" data-user-id="${schedule.userId}" style="display:${displayStyle}">`;
    html += `<div class="member-header">${schedule.displayName}</div>`;

    dates.forEach((dateStr) => {
      const date = new Date(dateStr + 'T00:00:00+09:00');
      const dayOfWeek = dayNames[date.getDay()];
      html += `<div class="day-section">`;
      html += `<div class="day-title">${formatDate(dateStr)}(${dayOfWeek})</div>`;
      html += `<div class="slot-group">`;
      html += renderSlotCheckbox(schedule.userId, dateStr, 'allday', '終日', schedule.slots);
      html += renderSlotCheckbox(schedule.userId, dateStr, '09', '9時', schedule.slots);
      html += renderSlotCheckbox(schedule.userId, dateStr, '17', '17時', schedule.slots);
      html += renderSlotCheckbox(schedule.userId, dateStr, '21', '21時', schedule.slots);
      html += renderSlotCheckbox(schedule.userId, dateStr, '24', '24時', schedule.slots);
      html += `</div>`;

      const noteValue = schedule.notes[dateStr] || '';
      html += `<input type="text" class="note-input" placeholder="備考" data-user="${schedule.userId}" data-date="${dateStr}" value="${noteValue}" style="width:100%;padding:6px;border:1px solid #dee2e6;border-radius:4px;font-size:12px;margin-top:6px">`;
      html += `</div>`;
    });

    html += `</div>`;
  });

  container.innerHTML = html;

  const alldayCheckboxes = container.querySelectorAll('input[data-slot$=":allday"]');
  alldayCheckboxes.forEach(alldayCheckbox => {
    alldayCheckbox.addEventListener('change', function() {
      if (this.checked) {
        const slotKey = this.dataset.slot;
        const dateStr = slotKey.split(':')[0];
        const userId = this.dataset.user;
        const otherSlots = container.querySelectorAll(`input[data-user="${userId}"][data-slot^="${dateStr}:"]:not([data-slot$=":allday"])`);
        otherSlots.forEach(slot => slot.checked = true);
      }
    });
  });
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('active');
  editingWeekId = '';
}

async function saveEditedSchedule() {
  if (!editingWeekId) return;
  try {
    for (const member of familyMembers) {
      const checkboxes = document.querySelectorAll(`input[data-user="${member.userId}"][data-slot]`);
      const slots = {};
      checkboxes.forEach(cb => {slots[cb.dataset.slot] = cb.checked;});
      const noteInputs = document.querySelectorAll(`input[data-user="${member.userId}"][data-date]`);
      const notes = {};
      noteInputs.forEach(input => {if (input.value.trim()) {notes[input.dataset.date] = input.value.trim();}});
      const response = await fetch(`${API_BASE_URL}${AppConfig.API.SCHEDULE_SUBMIT}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({weekId: editingWeekId, userId: member.userId, displayName: member.displayName, slots, notes})
      });
      if (!response.ok) throw new Error(`${member.displayName}の保存失敗`);
    }
    alert('保存完了');
    closeEditModal();
    await loadSelectedWeek();
  } catch (error) {
    alert('保存失敗: ' + error.message);
  }
}
