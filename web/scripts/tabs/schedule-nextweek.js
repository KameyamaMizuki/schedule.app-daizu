// [SCHED:NW] ========== 来週の予定タブ ==========
// 依存: core/state.js, core/utils.js, schedule.js (formatWeekRange, weekPickerTarget)
let nextWeekSelectedWeekId = null;
let nextWeekEditMode = false;
let nextWeekSchedules = [];
let nextWeekFamilyNotes = {};

async function renderNextWeek() {
  const container = document.getElementById('nextWeekContent');
  try {
    if (!nextWeekSelectedWeekId) {
      nextWeekSelectedWeekId = getNextWeekId();
    }
    const { monday, sunday } = getWeekDateRange(nextWeekSelectedWeekId);
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

    let html = '<div class="week-selector-section">';
    html += `<span style="font-weight:600;font-size:14px;color:#495057">表示週: ${monday.getFullYear()}/${String(monday.getMonth() + 1).padStart(2, '0')}/${String(monday.getDate()).padStart(2, '0')}(${dayNames[monday.getDay()]})〜${sunday.getFullYear()}/${String(sunday.getMonth() + 1).padStart(2, '0')}/${String(sunday.getDate()).padStart(2, '0')}(${dayNames[sunday.getDay()]})</span>`;
    html += '<button class="period-change-btn" onclick="openNextWeekPicker()">期間変更</button>';
    html += '<button id="nextWeekEditBtn" class="period-change-btn" style="background:#e91e8c;margin-left:6px" onclick="toggleNextWeekEditMode()">編集</button>';
    html += '</div>';
    html += '<div id="nextWeekScheduleDisplay"></div>';
    container.innerHTML = html;
    await loadNextWeekSchedule();
  } catch (error) {
    console.error('Failed to render next week', error);
    container.innerHTML = '<div class="error">来週の予定の読み込みに失敗しました</div>';
  }
}

function toggleNextWeekEditMode() {
  nextWeekEditMode = !nextWeekEditMode;
  const btn = document.getElementById('nextWeekEditBtn');
  if (btn) {
    btn.textContent = nextWeekEditMode ? '編集中' : '編集';
    btn.style.background = nextWeekEditMode ? '#dc3545' : '#e91e8c';
  }
  loadNextWeekSchedule();
}

// 来週の備考入力欄の値をメモリに同期
function syncNextWeekNotes() {
  document.querySelectorAll('.next-week-note-input').forEach(input => {
    const userId = input.dataset.user;
    const dateStr = input.dataset.date;
    const value = input.value.trim();
    if (userId === 'family') {
      if (value) { nextWeekFamilyNotes[dateStr] = value; } else { delete nextWeekFamilyNotes[dateStr]; }
      return;
    }
    const schedule = nextWeekSchedules.find(s => s.userId === userId);
    if (schedule) {
      if (!schedule.notes) schedule.notes = {};
      if (value) { schedule.notes[dateStr] = value; } else { delete schedule.notes[dateStr]; }
    }
  });
}

function toggleNextWeekSlot(userId, slotKey) {
  if (!nextWeekEditMode) return;
  syncNextWeekNotes(); // 備考値を保持してからDOM再描画
  const schedule = nextWeekSchedules.find(s => s.userId === userId);
  if (schedule) {
    const newValue = !schedule.slots[slotKey];
    schedule.slots[slotKey] = newValue;

    // 終日をトグルした場合、他の時間スロットも連動
    if (slotKey.endsWith(':allday')) {
      const dateStr = slotKey.split(':')[0];
      const timeSlots = ['09', '17', '21', '24'];
      timeSlots.forEach(slot => {
        schedule.slots[`${dateStr}:${slot}`] = newValue;
      });
    }

    loadNextWeekSchedule(true);
  }
}

async function saveNextWeekEdits() {
  try {
    // 備考入力欄からデータを収集（DOM→メモリ同期）
    syncNextWeekNotes();

    const weekId = nextWeekSelectedWeekId || getNextWeekId();
    if (nextWeekSchedules.length === 0) {
      alert('保存するデータがありません');
      return;
    }

    for (const schedule of nextWeekSchedules) {
      const response = await fetch(`${API_BASE_URL}/schedule/submit`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          weekId: weekId,
          userId: schedule.userId,
          displayName: schedule.displayName,
          slots: schedule.slots,
          notes: schedule.notes || {}
        })
      });
      if (!response.ok) throw new Error(`${schedule.displayName}の保存に失敗`);
    }
    alert('保存しました');
    nextWeekEditMode = false;
    const btn = document.getElementById('nextWeekEditBtn');
    if (btn) {
      btn.textContent = '編集';
      btn.style.background = '#e91e8c';
    }
    // まずメモリのデータで即座に表示を更新（DB整合性遅延対策）
    loadNextWeekSchedule(true);
    // バックグラウンドでDBから最新を取得
    setTimeout(() => loadNextWeekSchedule(), 500);
  } catch (error) {
    console.error('saveNextWeekEdits error:', error);
    alert('保存に失敗しました: ' + error.message);
  }
}

function cancelNextWeekEdit() {
  nextWeekEditMode = false;
  const btn = document.getElementById('nextWeekEditBtn');
  if (btn) {
    btn.textContent = '編集';
    btn.style.background = '#e91e8c';
  }
  loadNextWeekSchedule();
}

async function loadNextWeekSchedule(skipFetch) {
  const display = document.getElementById('nextWeekScheduleDisplay');
  // weekIdがない場合はフォールバック
  if (!nextWeekSelectedWeekId) {
    nextWeekSelectedWeekId = getNextWeekId();
  }
  const targetWeekId = nextWeekSelectedWeekId;
  try {
    if (!skipFetch) {
    nextWeekSchedules = [];
    const response = await fetch(`${API_BASE_URL}/schedule/week/${targetWeekId}`);
    if (response.ok) {
      const data = await response.json();
      for (const member of familyMembers) {
        const userData = data.users.find(u => u.userId === member.userId);
        nextWeekSchedules.push(userData ? {
          userId: userData.userId,
          displayName: userData.displayName,
          slots: userData.slots || {},
          notes: userData.notes || {}
        } : {
          userId: member.userId,
          displayName: member.displayName,
          slots: member.hasDefaultSchedule ? buildAllTrueSlots(targetWeekId) : {},
          notes: {}
        });
      }
      // 家族の備考を取得
      const familyDataNw = data.users.find(u => u.userId === 'family');
      nextWeekFamilyNotes = familyDataNw ? (familyDataNw.notes || {}) : {};
    } else {
      for (const member of familyMembers) {
        nextWeekSchedules.push({
          userId: member.userId,
          displayName: member.displayName,
          slots: member.hasDefaultSchedule ? buildAllTrueSlots(targetWeekId) : {},
          notes: {}
        });
      }
      nextWeekFamilyNotes = {};
    }
    } // end skipFetch
    const weekSchedules = nextWeekSchedules;

    let html = '<div class="finalized-schedule">';
    html += `<h3>${formatWeekRange(nextWeekSelectedWeekId)}</h3>`;
    const dates = generate7DaysFromMonday(nextWeekSelectedWeekId);
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const timeSlots = ['allday', '09', '17', '21', '24'];
    const timeLabels = {allday: '終日', '09': '9時', '17': '17時', '21': '21時', '24': '24時'};

    const absentDays = [];
    dates.forEach((dateStr) => {
      let hasAnyoneAssigned = false;
      timeSlots.forEach(timeSlot => {
        weekSchedules.forEach(schedule => {
          if (schedule.slots[`${dateStr}:${timeSlot}`]) hasAnyoneAssigned = true;
        });
      });
      if (!hasAnyoneAssigned) {
        const date = new Date(dateStr + 'T00:00:00+09:00');
        absentDays.push(`${date.getMonth() + 1}/${date.getDate()}(${dayNames[date.getDay()]})`);
      }
    });

    if (absentDays.length > 0) {
      html += '<div style="background:#fff3cd;border-left:4px solid #ffc107;padding:12px;margin-bottom:16px;border-radius:4px;font-size:13px;color:#856404">';
      html += '⚠️ 担当者不在の日: ' + absentDays.join(', ');
      html += '</div>';
    }

    if (nextWeekEditMode) {
      html += '<div style="background:#e8f4fd;border-left:4px solid #e91e8c;padding:12px;margin-bottom:16px;border-radius:4px;font-size:13px;color:#495057">';
      html += '<strong>編集モード</strong><br>';
      html += '・◯/✕をタップで予定を切り替え<br>';
      html += '・備考欄に補足情報を入力できます<br>';
      html += '・完了したら「保存」を押してください';
      html += '</div>';
      html += '<div style="margin-bottom:16px;text-align:center">';
      html += `<button onclick="saveNextWeekEdits()" style="background:#e91e8c;color:#fff;border:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,.1)">保存</button>`;
      html += `<button onclick="cancelNextWeekEdit()" style="background:#6c757d;color:#fff;border:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,.1);margin-left:10px">キャンセル</button>`;
      html += '</div>';
    }

    dates.forEach((dateStr) => {
      const date = new Date(dateStr + 'T00:00:00+09:00');
      html += `<table class="summary-table"><caption style="text-align:left;font-weight:600;padding:8px 0;font-size:14px">${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}(${dayNames[date.getDay()]})</caption><thead><tr><th>時間帯</th>`;
      familyMembers.forEach(member => { html += `<th>${getDisplayName(member)}</th>`; });
      html += `</tr></thead><tbody>`;
      timeSlots.forEach(timeSlot => {
        html += `<tr><td>${timeLabels[timeSlot]}</td>`;
        weekSchedules.forEach(schedule => {
          const slotKey = `${dateStr}:${timeSlot}`;
          const isAvailable = schedule.slots[slotKey];
          const clickHandler = nextWeekEditMode ? `onclick="toggleNextWeekSlot('${schedule.userId}','${slotKey}')"` : '';
          const editStyle = nextWeekEditMode ? 'cursor:pointer' : '';
          html += `<td class="${isAvailable ? 'available' : 'unavailable'}" data-user="${schedule.userId}" data-slot="${slotKey}" style="${editStyle}" ${clickHandler}>${isAvailable ? '◯' : '✕'}</td>`;
        });
        html += `</tr>`;
      });
      html += `</tbody></table>`;

      // 備考表示・編集
      if (nextWeekEditMode) {
        // 編集モード: 各人の備考入力欄
        html += '<div style="margin:8px 0 16px 0;padding:8px;background:#f8f9fa;border-radius:4px">';
        html += `<div style="font-size:12px;color:#6c757d;margin-bottom:6px">備考（${date.getMonth() + 1}/${date.getDate()}）:</div>`;
        weekSchedules.forEach(schedule => {
          const noteValue = schedule.notes && schedule.notes[dateStr] ? schedule.notes[dateStr] : '';
          html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">`;
          html += `<span style="font-size:12px;min-width:60px">${getDisplayNameByUserId(schedule.userId)}:</span>`;
          html += `<input type="text" data-user="${schedule.userId}" data-date="${dateStr}" class="next-week-note-input" value="${noteValue.replace(/"/g, '&quot;')}" placeholder="備考を入力" style="flex:1;padding:6px;border:1px solid #ced4da;border-radius:4px;font-size:12px">`;
          html += `</div>`;
        });
        html += '</div>';
      } else {
        // 表示モード: 既存の備考表示
        weekSchedules.forEach(schedule => {
          if (schedule.notes && schedule.notes[dateStr]) {
            html += `<div class="note-display">${getDisplayNameByUserId(schedule.userId)}: ${schedule.notes[dateStr]}</div>`;
          }
        });
      }
    });

    if (nextWeekEditMode) {
      html += '<div style="margin-top:16px;text-align:center">';
      html += `<button onclick="saveNextWeekEdits()" style="background:#e91e8c;color:#fff;border:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,.1)">保存</button>`;
      html += `<button onclick="cancelNextWeekEdit()" style="background:#6c757d;color:#fff;border:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,.1);margin-left:10px">キャンセル</button>`;
      html += '</div>';
    }

    html += '</div>';
    display.innerHTML = html;
  } catch (error) {
    console.error('Failed to load next week schedule', error);
    display.innerHTML = '<div class="error">週データの読み込みに失敗しました</div>';
  }
}

function openNextWeekPicker() {
  weekPickerTarget = 'nextWeek';
  document.getElementById('weekPickerModal').classList.add('active');
  document.getElementById('weekPickerDate').value = nextWeekSelectedWeekId || getNextWeekId();
}
