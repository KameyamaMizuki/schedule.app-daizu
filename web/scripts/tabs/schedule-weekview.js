// [SCHED:WEEKVIEW] ========== 今週/来週の予定タブ — 共通ファクトリ ==========
// 依存: core/state.js, core/utils.js, schedule.js (formatWeekRange, weekPickerTarget)
//
// createWeekView(config) で「今週」「来週」の2インスタンスを生成する。
// 違いはデフォルト weekId の取得関数と DOM 要素 ID だけ。

function createWeekView(config) {
  // config = {
  //   name:            'thisWeek' | 'nextWeek'
  //   getDefaultWeekId: getCalendarWeekId | getNextWeekId
  //   containerId:     'thisWeekContent' | 'nextWeekContent'
  //   displayId:       'finalizedScheduleDisplay' | 'nextWeekScheduleDisplay'
  //   editBtnId:       'thisWeekEditBtn' | 'nextWeekEditBtn'
  //   noteInputClass:  'this-week-note-input' | 'next-week-note-input'
  //   saveFnName:      'saveThisWeekEdits' | 'saveNextWeekEdits'
  //   cancelFnName:    'cancelThisWeekEdit' | 'cancelNextWeekEdit'
  //   toggleSlotFnName:'toggleThisWeekSlot' | 'toggleNextWeekSlot'
  // }

  var selectedWeekId = null;
  var editMode = false;
  var schedules = [];
  var familyNotes = {};

  async function render() {
    var container = document.getElementById(config.containerId);
    try {
      if (!selectedWeekId) {
        selectedWeekId = config.getDefaultWeekId();
      }
      var range = getWeekDateRange(selectedWeekId);
      var monday = range.monday;
      var sunday = range.sunday;
      var dayNames = AppConfig.SCHEDULE.DAYS;

      var html = '<div class="week-selector-section">';
      html += '<span style="font-weight:600;font-size:14px;color:var(--color-text-strong)">表示週: ';
      html += monday.getFullYear() + '/' + String(monday.getMonth() + 1).padStart(2, '0') + '/' + String(monday.getDate()).padStart(2, '0') + '(' + dayNames[monday.getDay()] + ')';
      html += '〜';
      html += sunday.getFullYear() + '/' + String(sunday.getMonth() + 1).padStart(2, '0') + '/' + String(sunday.getDate()).padStart(2, '0') + '(' + dayNames[sunday.getDay()] + ')';
      html += '</span>';
      html += '<button class="period-change-btn" onclick="open' + capitalize(config.name) + 'Picker()">期間変更</button>';
      html += '<button id="' + config.editBtnId + '" class="period-change-btn" style="background:#e91e8c;margin-left:6px" onclick="toggle' + capitalize(config.name) + 'EditMode()">編集</button>';
      html += '</div>';
      html += '<div id="' + config.displayId + '"></div>';

      container.innerHTML = html;
      await load();
    } catch (error) {
      console.error('Failed to render ' + config.name, error);
      container.innerHTML = '<div class="error">スケジュールの読み込みに失敗しました</div>';
    }
  }

  function openPicker() {
    weekPickerTarget = config.name;
    document.getElementById('weekPickerModal').classList.add('active');
    document.getElementById('weekPickerDate').value = selectedWeekId || config.getDefaultWeekId();
  }

  function toggleEditMode() {
    editMode = !editMode;
    var btn = document.getElementById(config.editBtnId);
    if (btn) {
      btn.textContent = editMode ? '編集中' : '編集';
      btn.style.background = editMode ? '#dc3545' : '#e91e8c';
    }
    load();
  }

  function syncNotes() {
    document.querySelectorAll('.' + config.noteInputClass).forEach(function(input) {
      var userId = input.dataset.user;
      var dateStr = input.dataset.date;
      var value = input.value.trim();
      if (userId === 'family') {
        if (value) { familyNotes[dateStr] = value; } else { delete familyNotes[dateStr]; }
        return;
      }
      var schedule = schedules.find(function(s) { return s.userId === userId; });
      if (schedule) {
        if (!schedule.notes) schedule.notes = {};
        if (value) { schedule.notes[dateStr] = value; } else { delete schedule.notes[dateStr]; }
      }
    });
  }

  function toggleSlot(userId, slotKey) {
    if (!editMode) return;
    syncNotes();
    var schedule = schedules.find(function(s) { return s.userId === userId; });
    if (schedule) {
      var newValue = !schedule.slots[slotKey];
      schedule.slots[slotKey] = newValue;

      // allday cascade
      if (slotKey.endsWith(':allday')) {
        var dateStr = slotKey.split(':')[0];
        ['09', '17', '21', '24'].forEach(function(slot) {
          schedule.slots[dateStr + ':' + slot] = newValue;
        });
      }

      load(true);
    }
  }

  async function save() {
    try {
      syncNotes();

      var weekId = selectedWeekId || config.getDefaultWeekId();
      if (schedules.length === 0) {
        alert('保存するデータがありません');
        return;
      }

      var editorName = currentUser ? getDisplayName(currentUser) : '';
      for (var i = 0; i < schedules.length; i++) {
        var schedule = schedules[i];
        var isLast = (i === schedules.length - 1);
        var response = await fetch(API_BASE_URL + AppConfig.API.SCHEDULE_SUBMIT, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            weekId: weekId,
            userId: schedule.userId,
            displayName: schedule.displayName,
            slots: schedule.slots,
            notes: schedule.notes || {},
            skipNotification: !isLast,
            notifierName: isLast ? editorName : undefined
          })
        });
        if (!response.ok) throw new Error(schedule.displayName + 'の保存に失敗');
      }
      alert('保存しました');
      editMode = false;
      var btn = document.getElementById(config.editBtnId);
      if (btn) {
        btn.textContent = '編集';
        btn.style.background = '#e91e8c';
      }
      // カレンダータブの日別表示が古いキャッシュを参照し続けるバグを修正
      // （保存した週のキャッシュを破棄し、表示中ならグリッド・詳細を再描画）
      if (typeof scheduleCalendarData !== 'undefined') {
        delete scheduleCalendarData[weekId];
        if (window.calendarLoaded && typeof renderScheduleCalendarGrid === 'function') {
          renderScheduleCalendarGrid();
        }
      }
      // まずメモリのデータで即座に表示を更新（DB整合性遅延対策）
      load(true);
      // バックグラウンドでDBから最新を取得
      setTimeout(function() { load(); }, 500);
    } catch (error) {
      console.error('save ' + config.name + ' error:', error);
      alert('保存に失敗しました: ' + error.message);
    }
  }

  function cancel() {
    editMode = false;
    var btn = document.getElementById(config.editBtnId);
    if (btn) {
      btn.textContent = '編集';
      btn.style.background = '#e91e8c';
    }
    load();
  }

  async function load(skipFetch) {
    var currentWeekId = selectedWeekId || config.getDefaultWeekId();
    var display = document.getElementById(config.displayId);

    try {
      if (!skipFetch) {
        schedules = [];
        var response = await fetch(API_BASE_URL + AppConfig.API.SCHEDULE_WEEK + '/' + currentWeekId);
        if (response.ok) {
          var data = await response.json();
          for (var mi = 0; mi < familyMembers.length; mi++) {
            var member = familyMembers[mi];
            var userData = data.users.find(function(u) { return u.userId === member.userId; });
            if (userData) {
              schedules.push({
                userId: userData.userId,
                displayName: userData.displayName,
                slots: userData.slots || {},
                notes: userData.notes || {},
                startDate: data.startDate,
                endDate: data.endDate
              });
            } else {
              schedules.push({
                userId: member.userId,
                displayName: member.displayName,
                slots: member.hasDefaultSchedule ? buildAllTrueSlots(currentWeekId) : {},
                notes: {},
                startDate: data.startDate,
                endDate: data.endDate
              });
            }
          }
          // 家族の備考を取得
          var familyData = data.users.find(function(u) { return u.userId === 'family'; });
          familyNotes = familyData ? (familyData.notes || {}) : {};
        } else {
          for (var mi2 = 0; mi2 < familyMembers.length; mi2++) {
            var member2 = familyMembers[mi2];
            schedules.push({
              userId: member2.userId,
              displayName: member2.displayName,
              slots: member2.hasDefaultSchedule ? buildAllTrueSlots(currentWeekId) : {},
              notes: {},
              startDate: '',
              endDate: ''
            });
          }
          familyNotes = {};
        }
      } // end skipFetch

      var weekSchedules = schedules;

      var html = '<div class="finalized-schedule">';
      html += '<h3>' + formatWeekRange(currentWeekId) + '</h3>';

      var dates = generate7DaysFromMonday(currentWeekId);
      var dayNames = AppConfig.SCHEDULE.DAYS;
      var timeSlots = AppConfig.SCHEDULE.SLOTS;
      var timeLabels = AppConfig.SCHEDULE.LABEL_MAP;

      var absentDays = [];
      dates.forEach(function(dateStr) {
        var hasAnyoneAssigned = false;
        timeSlots.forEach(function(timeSlot) {
          weekSchedules.forEach(function(schedule) {
            var slotKey = dateStr + ':' + timeSlot;
            if (schedule.slots[slotKey]) {
              hasAnyoneAssigned = true;
            }
          });
        });

        if (!hasAnyoneAssigned) {
          var date = new Date(dateStr + 'T00:00:00+09:00');
          var dayOfWeek = dayNames[date.getDay()];
          var month = date.getMonth() + 1;
          var day = date.getDate();
          absentDays.push(month + '/' + day + '(' + dayOfWeek + ')');
        }
      });

      if (absentDays.length > 0) {
        html += '<div style="background:var(--color-note-bg);border-left:4px solid #ffc107;padding:12px;margin-bottom:16px;border-radius:4px;font-size:13px;color:var(--color-note-text)">';
        html += '⚠️ 担当者不在の日: ' + absentDays.join(', ');
        html += '</div>';
      }

      if (editMode) {
        html += '<div style="background:var(--color-surface-alt);border-left:4px solid #e91e8c;padding:12px;margin-bottom:16px;border-radius:4px;font-size:13px;color:var(--color-text-strong)">';
        html += '<strong>編集モード</strong><br>';
        html += '・◯/✕をタップで予定を切り替え<br>';
        html += '・備考欄に補足情報を入力できます<br>';
        html += '・完了したら「保存」を押してください';
        html += '</div>';
        html += '<div style="margin-bottom:16px;text-align:center">';
        html += '<button onclick="' + config.saveFnName + '()" style="background:#e91e8c;color:#fff;border:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,.1)">保存</button>';
        html += '<button onclick="' + config.cancelFnName + '()" style="background:#6c757d;color:#fff;border:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,.1);margin-left:10px">キャンセル</button>';
        html += '</div>';
      }

      dates.forEach(function(dateStr) {
        var date = new Date(dateStr + 'T00:00:00+09:00');
        var dayOfWeek = dayNames[date.getDay()];
        var year = date.getFullYear();
        var month = String(date.getMonth() + 1).padStart(2, '0');
        var day = String(date.getDate()).padStart(2, '0');

        html += '<table class="summary-table"><caption style="text-align:left;font-weight:600;padding:8px 0;font-size:14px">' + year + '/' + month + '/' + day + '(' + dayOfWeek + ')</caption><thead><tr><th>時間帯</th>';
        familyMembers.forEach(function(member) {
          html += '<th>' + getDisplayName(member) + '</th>';
        });
        html += '</tr></thead><tbody>';

        timeSlots.forEach(function(timeSlot) {
          html += '<tr><td>' + timeLabels[timeSlot] + '</td>';
          weekSchedules.forEach(function(schedule) {
            var slotKey = dateStr + ':' + timeSlot;
            var isAvailable = schedule.slots[slotKey];
            var cellClass = isAvailable ? 'available' : 'unavailable';
            var cellText = isAvailable ? '◯' : '✕';
            var clickHandler = editMode ? 'onclick="' + config.toggleSlotFnName + '(\'' + schedule.userId + '\',\'' + slotKey + '\')"' : '';
            var editStyle = editMode ? 'cursor:pointer' : '';
            html += '<td class="' + cellClass + '" data-user="' + schedule.userId + '" data-slot="' + slotKey + '" style="' + editStyle + '" ' + clickHandler + '>' + cellText + '</td>';
          });
          html += '</tr>';
        });

        html += '</tbody></table>';

        // 備考表示・編集
        if (editMode) {
          html += '<div style="margin:8px 0 16px 0;padding:8px;background:var(--color-surface-alt);border-radius:4px">';
          html += '<div style="font-size:12px;color:var(--color-text-faint);margin-bottom:6px">備考（' + (date.getMonth() + 1) + '/' + date.getDate() + '）:</div>';
          weekSchedules.forEach(function(schedule) {
            var noteValue = schedule.notes && schedule.notes[dateStr] ? schedule.notes[dateStr] : '';
            html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">';
            html += '<span style="font-size:12px;min-width:60px">' + getDisplayNameByUserId(schedule.userId) + ':</span>';
            html += '<input type="text" data-user="' + schedule.userId + '" data-date="' + dateStr + '" class="' + config.noteInputClass + '" value="' + noteValue.replace(/"/g, '&quot;') + '" placeholder="備考を入力" style="flex:1;padding:6px;border:1px solid var(--color-border-soft);border-radius:4px;font-size:12px">';
            html += '</div>';
          });
          html += '</div>';
        } else {
          weekSchedules.forEach(function(schedule) {
            if (schedule.notes && schedule.notes[dateStr]) {
              html += '<div class="note-display">' + getDisplayNameByUserId(schedule.userId) + ': ' + schedule.notes[dateStr] + '</div>';
            }
          });
        }
      });

      if (editMode) {
        html += '<div style="margin-top:16px;text-align:center">';
        html += '<button onclick="' + config.saveFnName + '()" style="background:#e91e8c;color:#fff;border:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,.1)">保存</button>';
        html += '<button onclick="' + config.cancelFnName + '()" style="background:#6c757d;color:#fff;border:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,.1);margin-left:10px">キャンセル</button>';
        html += '</div>';
      }

      html += '</div>';
      display.innerHTML = html;
    } catch (error) {
      console.error('Failed to load ' + config.name, error);
      display.innerHTML = '<div class="error">週データの読み込みに失敗しました</div>';
    }
  }

  // Public API
  return {
    render: render,
    openPicker: openPicker,
    toggleEditMode: toggleEditMode,
    syncNotes: syncNotes,
    toggleSlot: toggleSlot,
    save: save,
    cancel: cancel,
    load: load,
    getSelectedWeekId: function() { return selectedWeekId; },
    setSelectedWeekId: function(v) { selectedWeekId = v; },
    getEditMode: function() { return editMode; },
    setEditMode: function(v) { editMode = v; }
  };
}

// ========== ヘルパー ==========
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ========== 2つのインスタンスを生成 ==========

var thisWeekView = createWeekView({
  name: 'thisWeek',
  getDefaultWeekId: getCalendarWeekId,
  containerId: 'thisWeekContent',
  displayId: 'finalizedScheduleDisplay',
  editBtnId: 'thisWeekEditBtn',
  noteInputClass: 'this-week-note-input',
  saveFnName: 'saveThisWeekEdits',
  cancelFnName: 'cancelThisWeekEdit',
  toggleSlotFnName: 'toggleThisWeekSlot'
});

var nextWeekView = createWeekView({
  name: 'nextWeek',
  getDefaultWeekId: getNextWeekId,
  containerId: 'nextWeekContent',
  displayId: 'nextWeekScheduleDisplay',
  editBtnId: 'nextWeekEditBtn',
  noteInputClass: 'next-week-note-input',
  saveFnName: 'saveNextWeekEdits',
  cancelFnName: 'cancelNextWeekEdit',
  toggleSlotFnName: 'toggleNextWeekSlot'
});

// ========== HTML onclick 用のグローバルブリッジ関数 ==========
// 既存の関数名をそのまま維持して後方互換性を保つ

// --- 今週 ---
function renderThisWeek() { return thisWeekView.render(); }
function openThisWeekPicker() { thisWeekView.openPicker(); }
function toggleThisWeekEditMode() { thisWeekView.toggleEditMode(); }
function syncThisWeekNotes() { thisWeekView.syncNotes(); }
function toggleThisWeekSlot(userId, slotKey) { thisWeekView.toggleSlot(userId, slotKey); }
function saveThisWeekEdits() { return thisWeekView.save(); }
function cancelThisWeekEdit() { thisWeekView.cancel(); }
function loadSelectedWeek(skipFetch) { return thisWeekView.load(skipFetch); }

// --- 来週 ---
function renderNextWeek() { return nextWeekView.render(); }
function openNextWeekPicker() { nextWeekView.openPicker(); }
function toggleNextWeekEditMode() { nextWeekView.toggleEditMode(); }
function syncNextWeekNotes() { nextWeekView.syncNotes(); }
function toggleNextWeekSlot(userId, slotKey) { nextWeekView.toggleSlot(userId, slotKey); }
function saveNextWeekEdits() { return nextWeekView.save(); }
function cancelNextWeekEdit() { nextWeekView.cancel(); }
function loadNextWeekSchedule(skipFetch) { return nextWeekView.load(skipFetch); }
