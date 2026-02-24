// ========== [HOME:URANAU] だいず占い機能 ==========
// 依存（グローバル参照）:
//   state.js  : homeDaizuImages, currentUser
//   utils.js  : hashCode, seededRandom
//   modals.js : getDisplayName
//   home.js   : homeState, homeHideAllAreas, updateHomeFab, homeBackToMenu
//   config.js  : AppConfig.STORAGE（FAMILY_BIRTHDAYS, fortune_lastMsg_* は動的キーのため直書き）

// だいず占いの画像をランダムに設定
function randomizeUranauDaizuImage() {
  const allDaizuImages = [
    ...(homeDaizuImages.normal || []),
    ...(homeDaizuImages.happy || []),
    ...(homeDaizuImages.thinking || [])
  ];
  if (allDaizuImages.length > 0) {
    const randomImg = allDaizuImages[Math.floor(Math.random() * allDaizuImages.length)];
    const imgEl = document.querySelector('.uranau-daizu-img');
    if (imgEl) imgEl.src = randomImg;
  }
}

// うらなうボタン: だいず占い（ログインユーザーを占う）
function homeStartUranau() {
  homeState = 'uranau';
  homeHideAllAreas();
  updateHomeFab();

  // ホームの犬画像と吹き出しを非表示
  document.getElementById('homeDogImage').style.display = 'none';
  document.getElementById('homeSpeechBubble').style.display = 'none';

  // だいず画像をランダムに設定
  setUranauDaizuImage('normal');

  // だいず占いを表示
  const uranauArea = document.getElementById('homeUranauArea');
  uranauArea.classList.add('active');

  // ログインユーザーの生年月日をチェック
  const savedBirthdays = JSON.parse(localStorage.getItem(AppConfig.STORAGE.FAMILY_BIRTHDAYS) || '{}');
  const userName = currentUser?.displayName || '';
  const birthday = savedBirthdays[userName];

  if (!birthday) {
    // 生年月日が未登録の場合は入力画面を表示
    showBirthdayInput(userName, getDisplayName(currentUser));
  } else {
    // 占い種類選択を表示
    renderUranauTypeSelection();
  }
}

function setUranauDaizuImage(expression) {
  const images = homeDaizuImages[expression] || homeDaizuImages.normal || [];
  if (images.length > 0) {
    const randomImg = images[Math.floor(Math.random() * images.length)];
    const imgEl = document.querySelector('.uranau-daizu-img');
    if (imgEl) imgEl.src = randomImg;
  }
}

function renderUranauTypeSelection() {
  const container = document.getElementById('uranauPersonSelect');
  const userName = getDisplayName(currentUser);

  // だいずの画像サイズをデフォルトに戻す
  const daizuImg = document.querySelector('.uranau-daizu-img');
  if (daizuImg) {
    daizuImg.style.width = '200px';
    daizuImg.style.height = '200px';
  }

  let html = `<p style="text-align:center;margin-bottom:16px;color:#fff;font-weight:600">${userName}さん、何を占う？</p>`;
  html += '<div class="uranau-types">';

  const fortuneTypes = [
    { id: 'general', emoji: '🌟', name: '総合運' },
    { id: 'love', emoji: '💕', name: '恋愛運' },
    { id: 'work', emoji: '💼', name: '仕事運' },
    { id: 'health', emoji: '💪', name: '健康運' }
  ];

  fortuneTypes.forEach(type => {
    html += `<button class="uranau-type-btn" onclick="startFortune('${type.id}')">
      <span class="emoji">${type.emoji}</span>
      <span class="name">${type.name}</span>
    </button>`;
  });

  html += '</div>';
  container.innerHTML = html;

  document.getElementById('uranauResult').style.display = 'none';
  container.style.display = 'block';
}

function startFortune(fortuneType) {
  const savedBirthdays = JSON.parse(localStorage.getItem(AppConfig.STORAGE.FAMILY_BIRTHDAYS) || '{}');
  const userName = currentUser?.displayName || '';
  const birthday = savedBirthdays[userName];

  if (!birthday) return;

  showUranauLoading(userName, birthday, getDisplayName(currentUser), fortuneType);
}

// 旧関数（互換性のため残す）
function renderUranauSelection(savedBirthdays) {
  renderUranauTypeSelection();
}

let currentUranauDisplayName = '';

function selectUranauPerson(storageKey, displayName) {
  currentUranauDisplayName = displayName || storageKey;
  const savedBirthdays = JSON.parse(localStorage.getItem(AppConfig.STORAGE.FAMILY_BIRTHDAYS) || '{}');

  if (!savedBirthdays[storageKey]) {
    showBirthdayInput(storageKey, currentUranauDisplayName);
  } else {
    // 占い結果を表示
    showUranauResult(storageKey, savedBirthdays[storageKey], currentUranauDisplayName);
  }
}

function showBirthdayInput(storageKey, displayName) {
  const container = document.getElementById('uranauPersonSelect');
  container.innerHTML = `
    <div style="background:rgba(255,255,255,0.95);padding:20px;border-radius:16px;text-align:center">
      <p style="margin-bottom:16px;color:#ad1457;font-weight:600">${displayName}さんの<br>生年月日を教えてワン！</p>
      <input type="date" id="uranauBirthdayInput" style="padding:12px;font-size:16px;border:2px solid #f8bbd9;border-radius:8px;width:200px;background:#fff">
      <br><br>
      <button class="uranau-submit-btn" onclick="saveBirthdayAndFortune('${storageKey}', '${displayName}')">登録して占う！</button>
      <p style="margin-top:12px;font-size:11px;color:#888">※後からアカウント設定で変更できるワン</p>
    </div>
  `;
}

function saveBirthdayAndFortune(storageKey, displayName) {
  const birthday = document.getElementById('uranauBirthdayInput').value;
  if (!birthday) {
    alert('生年月日を入力してください');
    return;
  }

  const savedBirthdays = JSON.parse(localStorage.getItem(AppConfig.STORAGE.FAMILY_BIRTHDAYS) || '{}');
  savedBirthdays[storageKey] = birthday;
  localStorage.setItem(AppConfig.STORAGE.FAMILY_BIRTHDAYS, JSON.stringify(savedBirthdays));

  // 占い種類選択画面を表示
  renderUranauTypeSelection();
}

let currentFortuneType = 'general';

function showUranauLoading(storageKey, birthday, displayName, fortuneType = 'general') {
  currentFortuneType = fortuneType;
  document.getElementById('uranauPersonSelect').style.display = 'none';
  const resultDiv = document.getElementById('uranauResult');

  // だいずの画像をthinkingに変更（占い中エフェクト）
  setUranauDaizuImage('thinking');
  const daizuImg = document.querySelector('.uranau-daizu-img');
  if (daizuImg) {
    daizuImg.style.animation = 'uranau-fortune 3s ease-in-out';
  }

  const typeNames = { general: '総合運', love: '恋愛運', work: '仕事運', health: '健康運' };

  // ローディング表示
  resultDiv.innerHTML = `
    <div class="uranau-result-card" style="background:${AppConfig.FORTUNE.LOADING_BG}">
      <h3 style="color:#ad1457">🔮 ${typeNames[fortuneType]}を占い中... 🔮</h3>
      <div style="margin:24px 0">
        <div style="width:100%;height:10px;background:rgba(255,255,255,0.5);border-radius:5px;overflow:hidden">
          <div style="width:0%;height:100%;background:${AppConfig.FORTUNE.LOADING_BAR};border-radius:5px;animation:uranau-loading 3s ease-in-out forwards"></div>
        </div>
      </div>
      <p style="color:#880e4f;font-size:14px">だいずが一生懸命占っています...</p>
    </div>
  `;
  resultDiv.style.display = 'block';

  // 3秒後に結果表示
  setTimeout(() => {
    showUranauResult(storageKey, birthday, displayName, fortuneType);
  }, AppConfig.TIMING.MSG_DISPLAY);
}

function showUranauResult(storageKey, birthday, displayName, fortuneType = 'general') {
  const showName = displayName || storageKey;
  const result = generateFortune(storageKey, birthday, fortuneType);
  const resultDiv = document.getElementById('uranauResult');

  // だいずの画像を運勢に応じた表情に（結果表示時はやや小さく）
  setUranauDaizuImage(result.daizuExpression);
  const daizuImg = document.querySelector('.uranau-daizu-img');
  if (daizuImg) {
    daizuImg.style.width = '140px';
    daizuImg.style.height = '140px';
    daizuImg.style.animation = 'dog-shake 2.5s ease-in-out infinite';
  }

  const typeNames = { general: '総合運', love: '恋愛運', work: '仕事運', health: '健康運' };
  const fortuneBgColors = AppConfig.FORTUNE.BG;

  resultDiv.innerHTML = `
    <div class="uranau-result-card">
      <p style="font-size:12px;color:#888;margin-bottom:4px">${typeNames[fortuneType]}</p>
      <h3 style="color:#ad1457;font-size:14px">✨ ${showName}さんの運勢 ✨</h3>
      <div style="margin:10px 0;padding:12px;background:${fortuneBgColors[result.fortune]};border-radius:10px">
        <span style="font-size:32px">${result.fortuneEmoji}</span>
        <div style="font-size:26px;font-weight:700;color:#fff;text-shadow:2px 2px 4px rgba(0,0,0,0.2)">${result.fortune}</div>
      </div>
      <div class="uranau-details" style="margin-bottom:10px">
        <p style="margin:4px 0;font-size:13px"><span class="label">🎨 ラッキーカラー:</span> <span class="value">${result.luckyColor}</span></p>
        <p style="margin:4px 0;font-size:13px"><span class="label">🍀 ラッキーアイテム:</span> <span class="value">${result.luckyItem}</span></p>
      </div>
      <div class="uranau-message" style="padding:12px;font-size:13px">${result.message}</div>
    </div>
    <div class="uranau-buttons" style="gap:8px">
      <button class="uranau-btn" onclick="renderUranauTypeSelection()" style="padding:10px 16px;font-size:13px">他の運勢を占う</button>
      <button class="uranau-btn primary" onclick="uranauBackToHome()" style="padding:10px 16px;font-size:13px">ホームに戻る</button>
    </div>
  `;
  resultDiv.style.display = 'block';
}

function generateFortune(name, birthday, fortuneType = 'general') {
  // 誕生日 + 今日の日付 + 占い種類でシード生成（1日1回固定）
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const seed = hashCode(birthday + todayStr + name + fortuneType);

  const random = seededRandom(seed);

  // 大吉〜大凶の7段階
  const fortuneRank = Math.floor(random() * 100);
  let fortune, fortuneEmoji, daizuExpression;
  if (fortuneRank < 5) {
    fortune = '大凶'; fortuneEmoji = '😱'; daizuExpression = 'sad';
  } else if (fortuneRank < 15) {
    fortune = '凶'; fortuneEmoji = '😢'; daizuExpression = 'sad';
  } else if (fortuneRank < 30) {
    fortune = '末吉'; fortuneEmoji = '😐'; daizuExpression = 'normal';
  } else if (fortuneRank < 50) {
    fortune = '小吉'; fortuneEmoji = '🙂'; daizuExpression = 'thinking';
  } else if (fortuneRank < 70) {
    fortune = '吉'; fortuneEmoji = '😊'; daizuExpression = 'thinking';
  } else if (fortuneRank < 90) {
    fortune = '中吉'; fortuneEmoji = '😄'; daizuExpression = 'happy';
  } else {
    fortune = '大吉'; fortuneEmoji = '🎉'; daizuExpression = 'happy';
  }

  const colors = ['赤', '青', '黄色', '緑', 'ピンク', 'オレンジ', '紫', '白', '水色', '金色'];
  const luckyColor = colors[Math.floor(random() * colors.length)];

  const items = ['りんご', 'コーヒー', 'お花', '本', 'チョコレート', 'ハンカチ', 'ぬいぐるみ', '写真', '音楽', '手紙', 'おやつ', '散歩'];
  const luckyItem = items[Math.floor(random() * items.length)];

  // 占い種類別メッセージ（各タイプ10個以上に拡充）
  const messagesByType = {
    general: [
      '今日は新しいことを始めるといいワン！',
      '周りの人に優しくすると良いことがあるワン！',
      'ゆっくり休むのも大事だワン！',
      '思い切って行動すると吉だワン！',
      '美味しいものを食べると運気アップだワン！',
      '家族との時間を大切にするといいワン！',
      '今日は直感を信じてみるワン！',
      '小さな幸せを見つけてみるワン！',
      '掃除や片付けで運気が上がるワン！',
      '誰かに「ありがとう」を伝えるといいワン！',
      '深呼吸して一日を始めるといいワン！',
      '今日は早めに寝ると明日が輝くワン！'
    ],
    love: [
      '素直な気持ちを伝えるといいワン！',
      '相手の話をよく聞くと仲良くなれるワン！',
      '笑顔でいると良い出会いがあるワン！',
      '優しい気持ちで接するといいワン！',
      '手紙やメッセージを送ると喜ばれるワン！',
      '一緒にご飯を食べると絆が深まるワン！',
      'ちょっとしたサプライズが吉だワン！',
      '相手の良いところを褒めてあげるワン！',
      '今日は甘えてみるのもいいワン！',
      '思い出の場所に行くといいワン！'
    ],
    work: [
      '集中して取り組むと成果が出るワン！',
      '周りと協力すると上手くいくワン！',
      '新しいアイデアが浮かぶかもワン！',
      '丁寧にやると認められるワン！',
      '優先順位を整理するといいワン！',
      '思い切って提案してみるワン！',
      'メモを取ると大事なことを逃さないワン！',
      '休憩も仕事のうちだワン！',
      '人に頼ることも大切だワン！',
      '小さな目標を立てると達成感があるワン！'
    ],
    health: [
      '早寝早起きがオススメだワン！',
      '水分補給を忘れずにワン！',
      'ストレッチすると調子が良くなるワン！',
      '美味しいご飯で元気になるワン！',
      'お散歩で気分転換するといいワン！',
      '今日は野菜を多めに食べるワン！',
      'ゆっくりお風呂に浸かるといいワン！',
      '深い呼吸で心を落ち着けるワン！',
      '好きな音楽を聴いてリラックスワン！',
      '姿勢を正すと体が楽になるワン！'
    ]
  };
  const messages = messagesByType[fortuneType] || messagesByType.general;
  // ランダム選択（直近と同一メッセージを避ける）
  const lastMsgKey = `fortune_lastMsg_${fortuneType}`;
  const lastMsgIdx = parseInt(localStorage.getItem(lastMsgKey) || '-1');
  let msgIdx = Math.floor(Math.random() * messages.length);
  if (messages.length > 1 && msgIdx === lastMsgIdx) {
    msgIdx = (msgIdx + 1) % messages.length;
  }
  localStorage.setItem(lastMsgKey, String(msgIdx));
  const message = messages[msgIdx];

  return { fortune, fortuneEmoji, luckyColor, luckyItem, message, daizuExpression };
}

function uranauBackToHome() {
  // 犬画像と吹き出しのdisplayを復元してからhomeBackToMenuで完全復元
  document.getElementById('homeDogImage').style.display = '';
  document.getElementById('homeSpeechBubble').style.display = '';
  homeBackToMenu();
}
