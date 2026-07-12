// [SCHED:WEEKVIEW] ========== 今週/来週の予定タブ — 共通ファクトリ ==========
// 依存: core/state.js, core/utils.js, core/api.js, core/account.js, schedule.js (formatWeekRange, weekPickerTarget)
//
// createWeekView(config) で「今週」「来週」の2インスタンスを生成する。
// 違いはデフォルト weekId の取得関数とグローバルブリッジ関数名だけ。
//
// 表示: 日カード(時間帯×3人グリッド)。閲覧時は淡色の読み取り専用、
// 編集モード(FAB鉛筆 → scheduleStartEdit())ではセルがタップ可能になり
// 上部に時短バー(先週コピー/マイパターン)、下部に「変更がn件 取り消し/保存」バーが出る。

// ========== マイパターン（localStorage、両ビュー共有） ==========
var SCHEDULE_PATTERNS_KEY = 'schedulePatterns';

function loadSchedulePatterns() {
  try {
    var raw = JSON.parse(localStorage.getItem(SCHEDULE_PATTERNS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (e) { return []; }
}

function saveSchedulePatterns(patterns) {
  try { localStorage.setItem(SCHEDULE_PATTERNS_KEY, JSON.stringify(patterns)); } catch (e) { /* 容量オーバー等は無視 */ }
}

// パターン名に絵文字が含まれるか（UI装飾は絵文字禁止・Phosphorのみの方針に合わせる）
function containsEmoji(str) {
  return /[\u{1F1E6}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}️]/u.test(str);
}

function createWeekView(config) {
  // config = {
  //   name:              'thisWeek' | 'nextWeek'
  //   getDefaultWeekId:  getCalendarWeekId | getNextWeekId
  //   containerId:       'thisWeekContent' | 'nextWeekContent'
  //   displayId:         'finalizedScheduleDisplay' | 'nextWeekScheduleDisplay'
  //   noteInputClass:    'this-week-note-input' | 'next-week-note-input'
  //   saveFnName:        'saveThisWeekEdits' | 'saveNextWeekEdits'
  //   cancelFnName:      'cancelThisWeekEdit' | 'cancelNextWeekEdit'
  //   toggleSlotFnName:  'toggleThisWeekSlot' | 'toggleNextWeekSlot'
  //   headerTapFnName:   'thisWeekHeaderTap' | 'nextWeekHeaderTap'
  //   patternChipFnName: 'thisWeekPatternChip' | 'nextWeekPatternChip'
  //   patternRegisterFnName: 'thisWeekPatternRegister' | 'nextWeekPatternRegister'
  //   copyLastWeekFnName: 'copyThisWeekLastWeek' | 'copyNextWeekLastWeek'
  // }

  var selectedWeekId = null;
  var editMode = false;
  var schedules = [];
  var snapshot = null;       // 編集開始時点のスナップショット（取り消し・差分カウント用）
  var patternMode = null;    // null | {type:'apply', index} | {type:'register'}

  function currentWeekId() { return selectedWeekId || config.getDefaultWeekId(); }

  async function render() {
    var container = document.getElementById(config.containerId);
    try {
      if (!selectedWeekId) {
        selectedWeekId = config.getDefaultWeekId();
      }
      // サブタブ/アプリタブへの再訪問時は必ず再フェッチするため、
      // 編集途中の状態(スナップショット含む)が残っていると誤った差分表示になる。
      // 再入場時は編集セッションを破棄しておく。
      if (editMode) {
        editMode = false;
        snapshot = null;
        patternMode = null;
      }
      container.innerHTML = '<div id="' + config.displayId + '"></div>';
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

  function syncNotes() {
    document.querySelectorAll('.' + config.noteInputClass).forEach(function(input) {
      var userId = input.dataset.user;
      var dateStr = input.dataset.date;
      var value = input.value.trim();
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

      // allday cascade（既存ロジックをそのまま維持）
      if (slotKey.endsWith(':allday')) {
        var dateStr = slotKey.split(':')[0];
        ['09', '17', '21', '24'].forEach(function(slot) {
          schedule.slots[dateStr + ':' + slot] = newValue;
        });
      }

      renderView();
    }
  }

  // 内部セッター（cascadeなし。copyMyLastWeek/パターン適用は5枠すべてを明示的に設定するため不要）
  function setSlotValue(userId, slotKey, value) {
    var schedule = schedules.find(function(s) { return s.userId === userId; });
    if (schedule) schedule.slots[slotKey] = !!value;
  }

  function rerenderEditGrid() { renderView(); }

  // 先週コピー: 現在表示中の週の前週データから自分のslotsを複製
  async function copyMyLastWeek() {
    if (!currentUser) { showToast('ユーザー情報が取得できません'); return; }
    syncNotes();
    var weekId = currentWeekId();
    var prevWeekId = formatDateToWeekId(new Date(new Date(weekId + 'T00:00:00+09:00').getTime() - 7 * 86400000));
    var data;
    try {
      data = await Api.getWeek(prevWeekId, null, { force: true });
    } catch (e) {
      showToast('先週のデータ取得に失敗しました');
      return;
    }
    var me = (data.users || []).find(function(u) { return u.userId === currentUser.userId; });
    if (!me || !me.slots) { showToast('先週の入力がありません'); return; }
    var days = generate7DaysFromMonday(weekId);
    var prevDays = generate7DaysFromMonday(prevWeekId);
    days.forEach(function(d, i) {
      ['allday', '09', '17', '21', '24'].forEach(function(s) {
        setSlotValue(currentUser.userId, d + ':' + s, !!me.slots[prevDays[i] + ':' + s]);
      });
    });
    rerenderEditGrid();
    showToast('先週の予定をコピーしました');
  }

  // マイパターンの自分の列見出しタップ（適用 or 登録の対象日選択）
  function headerTap(dateStr) {
    if (!editMode || !currentUser || !patternMode) return;
    syncNotes();

    if (patternMode.type === 'apply') {
      var patterns = loadSchedulePatterns();
      var pattern = patterns[patternMode.index];
      if (!pattern) { patternMode = null; renderView(); return; }
      ['allday', '09', '17', '21', '24'].forEach(function(s) {
        setSlotValue(currentUser.userId, dateStr + ':' + s, !!pattern.slots[s]);
      });
      showToast('「' + pattern.name + '」を適用しました');
      renderView();
      return;
    }

    if (patternMode.type === 'register') {
      var name = prompt('パターン名を入力してください（絵文字不可）');
      if (name === null) { patternMode = null; renderView(); return; }
      name = name.trim();
      if (!name) { showToast('名前を入力してください'); return; }
      if (containsEmoji(name)) { showToast('絵文字は使用できません'); return; }
      var schedule = schedules.find(function(s) { return s.userId === currentUser.userId; });
      if (!schedule) { patternMode = null; renderView(); return; }
      var slots = {};
      ['allday', '09', '17', '21', '24'].forEach(function(s) {
        slots[s] = !!schedule.slots[dateStr + ':' + s];
      });
      var patterns2 = loadSchedulePatterns();
      patterns2.push({ name: name, slots: slots });
      saveSchedulePatterns(patterns2);
      showToast('「' + name + '」を登録しました');
      patternMode = null;
      renderView();
    }
  }

  function patternChipTap(index) {
    if (!editMode) return;
    if (patternMode && patternMode.type === 'apply' && patternMode.index === index) {
      patternMode = null;
    } else {
      patternMode = { type: 'apply', index: index };
    }
    renderView();
  }

  function patternRegisterTap() {
    if (!editMode) return;
    if (patternMode && patternMode.type === 'register') {
      patternMode = null;
    } else {
      patternMode = { type: 'register' };
    }
    renderView();
  }

  function startEdit() {
    syncNotes();
    snapshot = JSON.parse(JSON.stringify(schedules));
    editMode = true;
    patternMode = null;
    renderView();
  }

  function cancel() {
    if (snapshot) { schedules = JSON.parse(JSON.stringify(snapshot)); }
    snapshot = null;
    editMode = false;
    patternMode = null;
    renderView();
  }

  async function save() {
    syncNotes();
    try {
      var weekId = currentWeekId();
      if (schedules.length === 0) {
        showToast('保存するデータがありません');
        return;
      }

      var editorName = currentUser ? getDisplayName(currentUser) : '';
      for (var i = 0; i < schedules.length; i++) {
        var schedule = schedules[i];
        var isLast = (i === schedules.length - 1);
        await Api.submitSchedule({
          weekId: weekId,
          userId: schedule.userId,
          displayName: schedule.displayName,
          slots: schedule.slots,
          notes: schedule.notes || {},
          skipNotification: !isLast,
          notifierName: isLast ? editorName : undefined
        });
      }
      showToast('保存しました');
      editMode = false;
      snapshot = null;
      patternMode = null;

      // カレンダータブの日別表示が古いキャッシュを参照し続けるバグを修正
      // （保存した週のキャッシュを破棄し、表示中ならグリッド・詳細を再描画）
      if (typeof scheduleCalendarData !== 'undefined') {
        delete scheduleCalendarData[weekId];
        if (window.calendarLoaded && typeof renderScheduleCalendarGrid === 'function') {
          renderScheduleCalendarGrid();
        }
      }
      // まずメモリのデータで即座に表示を更新（DB整合性遅延対策）
      renderView();
      // バックグラウンドでDBから最新を取得（保存直後なのでキャッシュを使わない）
      setTimeout(function() { load(false, true); }, 500);
    } catch (error) {
      console.error('save ' + config.name + ' error:', error);
      showToast('保存に失敗しました: ' + error.message);
    }
  }

  // 取得した週データを schedules に反映する（data=null はフォールバック）
  function applyWeekData(data, weekId) {
    schedules = [];
    familyMembers.forEach(function(member) {
      var userData = (data && data.users) ? data.users.find(function(u) { return u.userId === member.userId; }) : null;
      if (userData) {
        schedules.push({
          userId: userData.userId,
          displayName: userData.displayName,
          slots: userData.slots || {},
          notes: userData.notes || {}
        });
      } else {
        schedules.push({
          userId: member.userId,
          displayName: member.displayName,
          slots: member.hasDefaultSchedule ? buildAllTrueSlots(weekId) : {},
          notes: {}
        });
      }
    });
  }

  async function load(skipFetch, forceNetwork) {
    var weekId = currentWeekId();
    var display = document.getElementById(config.displayId);

    try {
      if (!skipFetch) {
        // SWR: キャッシュ即表示→裏で最新化。差分があれば反映して再描画。
        // 編集中はユーザーの入力を上書きしないためスキップする。
        var data = null;
        try {
          data = await Api.getWeek(weekId, function(fresh) {
            if (editMode) return;
            applyWeekData(fresh, weekId);
            renderView();
          }, { force: forceNetwork });
        } catch (e) {
          data = null;
        }
        applyWeekData(data, weekId);
      }
      renderView();
    } catch (error) {
      console.error('Failed to load ' + config.name, error);
      if (display) display.innerHTML = '<div class="error">週データの読み込みに失敗しました</div>';
    }
  }

  // ---------- 描画 ----------

  function isDirty(userId, slotKey, currentVal) {
    if (!snapshot) return false;
    var snapUser = snapshot.find(function(s) { return s.userId === userId; });
    var snapVal = snapUser ? !!snapUser.slots[slotKey] : false;
    return snapVal !== !!currentVal;
  }

  function countDirty() {
    if (!snapshot) return 0;
    var count = 0;
    schedules.forEach(function(schedule) {
      var snapUser = snapshot.find(function(s) { return s.userId === schedule.userId; });
      var snapSlots = snapUser ? snapUser.slots : {};
      var keys = {};
      Object.keys(schedule.slots).forEach(function(k) { keys[k] = 1; });
      Object.keys(snapSlots).forEach(function(k) { keys[k] = 1; });
      Object.keys(keys).forEach(function(k) {
        if (!!schedule.slots[k] !== !!snapSlots[k]) count++;
      });
    });
    return count;
  }

  function computeAbsentDays(dates) {
    var timeSlots = AppConfig.SCHEDULE.SLOTS;
    var dayNames = AppConfig.SCHEDULE.DAYS;
    var absentDays = [];
    dates.forEach(function(dateStr) {
      var hasAnyoneAssigned = timeSlots.some(function(timeSlot) {
        return schedules.some(function(schedule) { return !!schedule.slots[dateStr + ':' + timeSlot]; });
      });
      if (!hasAnyoneAssigned) {
        var date = new Date(dateStr + 'T00:00:00+09:00');
        absentDays.push((date.getMonth() + 1) + '/' + date.getDate() + '(' + dayNames[date.getDay()] + ')');
      }
    });
    return absentDays;
  }

  function renderDayCard(dateStr, isToday) {
    var date = new Date(dateStr + 'T00:00:00+09:00');
    var dayNames = AppConfig.SCHEDULE.DAYS;
    var dateLabel = (date.getMonth() + 1) + '/' + date.getDate() + '(' + dayNames[date.getDay()] + ')';
    var timeSlots = AppConfig.SCHEDULE.SLOTS;
    var timeLabels = AppConfig.SCHEDULE.LABEL_MAP;

    var html = '<div class="wv-daycard' + (isToday ? ' is-today' : '') + '">';
    html += '<div class="wv-daycard-head"><span class="wv-daycard-date">' + dateLabel + '</span>';
    if (isToday) html += '<span class="wv-badge-today">きょう</span>';
    html += '</div>';

    html += '<div class="wv-grid">';
    html += '<div class="wv-grid-cell wv-grid-head"></div>';
    schedules.forEach(function(schedule) {
      var isMe = !!(currentUser && schedule.userId === currentUser.userId);
      var name = getDisplayNameByUserId(schedule.userId) || schedule.displayName;
      var cls = 'wv-grid-cell wv-grid-head';
      var attrs = '';
      if (editMode && isMe) {
        cls += ' wv-me wv-editable';
        name += '（自分）';
        attrs = ' onclick="' + config.headerTapFnName + '(\'' + dateStr + '\')"';
      }
      html += '<div class="' + cls + '" data-header-user="' + schedule.userId + '"' + attrs + '>' + escapeHtml(name) + '</div>';
    });

    timeSlots.forEach(function(slot) {
      html += '<div class="wv-grid-cell wv-slot-label">' + timeLabels[slot] + '</div>';
      schedules.forEach(function(schedule) {
        var slotKey = dateStr + ':' + slot;
        var on = !!schedule.slots[slotKey];
        var dirty = editMode && isDirty(schedule.userId, slotKey, on);
        var cls = 'wv-grid-cell wv-cell ' + (on ? 'on' : 'off');
        if (editMode) cls += ' edit';
        if (dirty) cls += ' dirty';
        var attrs = ' data-user="' + schedule.userId + '" data-slot="' + slotKey + '"';
        if (editMode) {
          attrs += ' onclick="' + config.toggleSlotFnName + '(\'' + schedule.userId + '\',\'' + slotKey + '\')"';
        }
        html += '<div class="' + cls + '"' + attrs + '>' + (on ? '◯' : '✕') + '</div>';
      });
    });
    html += '</div>'; // .wv-grid

    if (editMode) {
      html += '<div class="wv-notes">';
      schedules.forEach(function(schedule) {
        var noteValue = (schedule.notes && schedule.notes[dateStr]) ? schedule.notes[dateStr] : '';
        html += '<div class="wv-note-row"><span class="wv-note-name">' + escapeHtml(getDisplayNameByUserId(schedule.userId) || schedule.displayName) + '</span>';
        html += '<input type="text" data-user="' + schedule.userId + '" data-date="' + dateStr + '" class="' + config.noteInputClass + '" value="' + noteValue.replace(/"/g, '&quot;') + '" placeholder="備考を入力"></div>';
      });
      html += '</div>';
    } else {
      var noteHtml = '';
      schedules.forEach(function(schedule) {
        if (schedule.notes && schedule.notes[dateStr]) {
          noteHtml += '<div class="wv-note-display"><strong>' + escapeHtml(getDisplayNameByUserId(schedule.userId) || schedule.displayName) + '</strong>: ' + escapeHtml(schedule.notes[dateStr]) + '</div>';
        }
      });
      html += noteHtml;
    }

    html += '</div>'; // .wv-daycard
    return html;
  }

  function renderQuickBar() {
    var html = '<div class="wv-quickbar">';
    html += '<div class="wv-quickbar-row">';
    html += '<span class="wv-quickbar-label">自分の列を先週と同じにする</span>';
    html += '<button class="wv-copy-btn" onclick="' + config.copyLastWeekFnName + '()"><i class="ph-bold ph-copy"></i>コピー</button>';
    html += '</div>';

    var patterns = loadSchedulePatterns();
    html += '<div class="wv-pattern-chips">';
    patterns.forEach(function(p, i) {
      var active = !!(patternMode && patternMode.type === 'apply' && patternMode.index === i);
      html += '<button class="wv-pattern-chip' + (active ? ' active' : '') + '" onclick="' + config.patternChipFnName + '(' + i + ')">' + escapeHtml(p.name) + '</button>';
    });
    var registering = !!(patternMode && patternMode.type === 'register');
    html += '<button class="wv-pattern-chip add' + (registering ? ' active' : '') + '" onclick="' + config.patternRegisterFnName + '()"><i class="ph-bold ph-plus"></i>登録</button>';
    html += '</div>';

    if (patternMode) {
      var hint = patternMode.type === 'register' ? '保存したい日の「(自分)」見出しをタップ' : '適用したい日の「(自分)」見出しをタップ';
      html += '<div class="wv-quickbar-hint">' + hint + '</div>';
    }
    html += '</div>';
    return html;
  }

  function renderSaveBar() {
    var count = countDirty();
    var html = '<div class="wv-savebar">';
    html += '<span class="wv-savebar-count">変更が' + count + '件</span>';
    html += '<div class="wv-savebar-actions">';
    html += '<button class="wv-btn-cancel" onclick="' + config.cancelFnName + '()">取り消し</button>';
    html += '<button class="wv-btn-save" onclick="' + config.saveFnName + '()">保存</button>';
    html += '</div></div>';
    return html;
  }

  // タブ/編集モードに応じて共有FAB(#fabBtn)を同期する
  // （どのタブが今表示されているかを見て判断するため、他タブ表示中は触らない）
  function syncFabWithEditMode() {
    if (typeof currentTab === 'undefined' || currentTab !== 'schedule') return;
    var fab = document.getElementById('fabBtn');
    if (!fab) return;
    if (editMode) {
      fab.style.display = 'none';
      fab.onclick = null;
    } else if (typeof updateFab === 'function') {
      updateFab('schedule');
    }
  }

  function renderView() {
    var display = document.getElementById(config.displayId);
    if (!display) return;
    var weekId = currentWeekId();
    var dates = generate7DaysFromMonday(weekId);
    var todayStr = formatDateForApi(new Date());

    var html = '<div class="wv-topbar">';
    html += '<span class="wv-range">' + formatWeekRange(weekId) + '</span>';
    html += '<button class="wv-period-btn" onclick="open' + capitalize(config.name) + 'Picker()"><i class="ph-bold ph-calendar-blank"></i>期間変更</button>';
    html += '</div>';

    var absentDays = computeAbsentDays(dates);
    if (absentDays.length > 0) {
      html += '<div class="wv-warn"><i class="ph-bold ph-warning"></i> 担当者不在の日: ' + absentDays.join('、') + '</div>';
    }

    if (editMode) {
      html += renderQuickBar();
    }

    dates.forEach(function(dateStr) {
      html += renderDayCard(dateStr, dateStr === todayStr);
    });

    if (editMode) {
      html += renderSaveBar();
    }

    display.innerHTML = html;
    syncFabWithEditMode();
  }

  // Public API
  return {
    render: render,
    openPicker: openPicker,
    toggleSlot: toggleSlot,
    save: save,
    cancel: cancel,
    cancelEdit: cancel,
    load: load,
    startEdit: startEdit,
    headerTap: headerTap,
    patternChip: patternChipTap,
    patternRegister: patternRegisterTap,
    copyLastWeek: copyMyLastWeek,
    getSelectedWeekId: function() { return selectedWeekId; },
    setSelectedWeekId: function(v) { selectedWeekId = v; },
    getEditMode: function() { return editMode; },
    setEditMode: function(v) {
      editMode = !!v;
      if (!editMode) { snapshot = null; patternMode = null; }
    }
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
  noteInputClass: 'this-week-note-input',
  saveFnName: 'saveThisWeekEdits',
  cancelFnName: 'cancelThisWeekEdit',
  toggleSlotFnName: 'toggleThisWeekSlot',
  headerTapFnName: 'thisWeekHeaderTap',
  patternChipFnName: 'thisWeekPatternChip',
  patternRegisterFnName: 'thisWeekPatternRegister',
  copyLastWeekFnName: 'copyThisWeekLastWeek'
});

var nextWeekView = createWeekView({
  name: 'nextWeek',
  getDefaultWeekId: getNextWeekId,
  containerId: 'nextWeekContent',
  displayId: 'nextWeekScheduleDisplay',
  noteInputClass: 'next-week-note-input',
  saveFnName: 'saveNextWeekEdits',
  cancelFnName: 'cancelNextWeekEdit',
  toggleSlotFnName: 'toggleNextWeekSlot',
  headerTapFnName: 'nextWeekHeaderTap',
  patternChipFnName: 'nextWeekPatternChip',
  patternRegisterFnName: 'nextWeekPatternRegister',
  copyLastWeekFnName: 'copyNextWeekLastWeek'
});

// ========== HTML onclick 用のグローバルブリッジ関数 ==========
// 既存の関数名をそのまま維持して後方互換性を保つ

// --- 今週 ---
function renderThisWeek() { return thisWeekView.render(); }
function openThisWeekPicker() { thisWeekView.openPicker(); }
function toggleThisWeekSlot(userId, slotKey) { thisWeekView.toggleSlot(userId, slotKey); }
function saveThisWeekEdits() { return thisWeekView.save(); }
function cancelThisWeekEdit() { thisWeekView.cancel(); }
function loadSelectedWeek(skipFetch) { return thisWeekView.load(skipFetch); }
function thisWeekHeaderTap(dateStr) { thisWeekView.headerTap(dateStr); }
function thisWeekPatternChip(index) { thisWeekView.patternChip(index); }
function thisWeekPatternRegister() { thisWeekView.patternRegister(); }
function copyThisWeekLastWeek() { return thisWeekView.copyLastWeek(); }

// --- 来週 ---
function renderNextWeek() { return nextWeekView.render(); }
function openNextWeekPicker() { nextWeekView.openPicker(); }
function toggleNextWeekSlot(userId, slotKey) { nextWeekView.toggleSlot(userId, slotKey); }
function saveNextWeekEdits() { return nextWeekView.save(); }
function cancelNextWeekEdit() { nextWeekView.cancel(); }
function loadNextWeekSchedule(skipFetch) { return nextWeekView.load(skipFetch); }
function nextWeekHeaderTap(dateStr) { nextWeekView.headerTap(dateStr); }
function nextWeekPatternChip(index) { nextWeekView.patternChip(index); }
function nextWeekPatternRegister() { nextWeekView.patternRegister(); }
function copyNextWeekLastWeek() { return nextWeekView.copyLastWeek(); }

// --- FAB entrypoint（現在表示中の週サブタブで編集開始。カレンダー表示中は今週へ切り替えてから開始） ---
function scheduleStartEdit() {
  var sub = (typeof currentScheduleSubTab !== 'undefined') ? currentScheduleSubTab : 'calendar';
  if (sub === 'nextWeek') { nextWeekView.startEdit(); return; }
  if (sub === 'thisWeek') { thisWeekView.startEdit(); return; }
  switchScheduleSubTab('thisWeek').then(function() { thisWeekView.startEdit(); });
}
