// ========== [HOME:RECORD] 記録する機能 ==========
// 依存（グローバル参照）:
//   state.js : API_BASE_URL
//   utils.js : formatDateForApi
//   home.js  : homeState, homeCurrentRecordType, homeHideAllAreas,
//              homeSetRandomDogImage, homeSetSpeechText, homeShowThinking,
//              homeReturnToMenu, homeSetCurrentTime

// 記録する
function homeStartRecord() {
  homeState = 'record_type_select';
  homeSetRandomDogImage('normal');
  homeSetSpeechText('何を記録するんだ？');
  homeHideAllAreas();
  const el = document.getElementById('homeRecordTypeSelect');
  if (el) { el.style.display = 'block'; el.classList.add('active'); }
}

function homeSelectRecordType(type) {
  homeCurrentRecordType = type;
  homeState = 'record_input';
  const labels = {
    condition: { label: '様子', placeholder: '今日の様子を入力...', speech: 'オレの様子はどうだ？' },
    meal: { label: '食事', placeholder: '食事の内容を入力...', speech: '何を食べたんだ？' },
    toilet: { label: 'トイレ', placeholder: 'トイレの状況を入力...', speech: 'トイレはどうだった？' }
  };
  const cfg = labels[type];
  const labelEl = document.getElementById('homeRecordInputLabel');
  const textEl = document.getElementById('homeRecordText');
  if (labelEl) labelEl.textContent = cfg.label;
  if (textEl) { textEl.placeholder = cfg.placeholder; textEl.value = ''; }
  homeSetSpeechText(cfg.speech);
  homeHideAllAreas();
  homeSetCurrentTime();
  const el = document.getElementById('homeRecordInput');
  if (el) { el.style.display = 'block'; el.classList.add('active'); }
}

function homeBackToRecordType() {
  homeState = 'record_type_select';
  homeSetRandomDogImage('normal');
  homeSetSpeechText('何を記録するんだ？');
  homeHideAllAreas();
  const el = document.getElementById('homeRecordTypeSelect');
  if (el) { el.style.display = 'block'; el.classList.add('active'); }
}

async function homeSubmitRecord() {
  const hour = document.getElementById('homeRecordHour')?.value;
  const minute = document.getElementById('homeRecordMinute')?.value;
  const text = document.getElementById('homeRecordText')?.value.trim();
  if (!text) { alert('入力してくれ！'); return; }
  homeState = 'record_saving';
  const now = new Date();
  const dateStr = formatDateForApi(now);
  const recordData = {
    recordDate: dateStr,
    time: `${hour}:${minute}`,
    condition: homeCurrentRecordType === 'condition' ? text : '',
    meal: homeCurrentRecordType === 'meal' ? text : '',
    toilet: homeCurrentRecordType === 'toilet' ? text : ''
  };
  const [_] = await Promise.all([
    homeShowThinking(AppConfig.TIMING.MSG_DISPLAY),
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}${AppConfig.API.RECORDS}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(recordData)
        });
        if (!res.ok) throw new Error('保存失敗');
        homeState = 'record_done';
        homeSetRandomDogImage('happy');
        homeSetSpeechText('入力しといたぞ、<br>いつもありがとうな！');
        homeHideAllAreas();
        const textEl = document.getElementById('homeRecordText');
        if (textEl) textEl.value = '';
        homeReturnToMenu(AppConfig.TIMING.MSG_DISPLAY);
      } catch (e) {
        homeState = 'record_error';
        homeSetRandomDogImage('sad');
        homeSetSpeechText('すまん、保存できなかった...<br>もう一回試してくれ！');
        homeHideAllAreas();
        homeReturnToMenu(AppConfig.TIMING.MSG_DISPLAY);
      }
    })()
  ]);
}
