// ========== [HOME:WANNADE] わんなでゲーム機能 ==========
// 依存（グローバル参照）:
//   state.js  : homeDogImages, homeDaizuImages, API_BASE_URL, currentUser, familyMembers
//   modals.js : getDisplayName, getAvatarPhoto, getAvatarEmoji
//   home.js   : homeState, homeHideAllAreas, updateHomeFab

// あそぶボタン: わんなでゲーム
function homeStartAsobu() {
  homeState = 'asobu';
  homeHideAllAreas();
  updateHomeFab();
  // ホーム画像と吹き出しを隠す
  document.getElementById('homeDogImage').style.display = 'none';
  document.getElementById('homeSpeechBubble').style.display = 'none';
  document.getElementById('homeWannadeArea').classList.add('active');
  wannadeReset();
  wannadeRandomizeDogs();
  loadWannadeRanking();
}

// ========== わんなで機能 ==========
let wannadeGameState = 'idle'; // idle, playing, finished
let wannadeCount = 0;
let wannadeTimer = null;
let wannadeTimeLeft = AppConfig.WANNADE.GAME_SECONDS;

function wannadeReset() {
  wannadeGameState = 'idle';
  wannadeCount = 0;
  wannadeTimeLeft = AppConfig.WANNADE.GAME_SECONDS;
  document.getElementById('wannadeTimer').textContent = String(AppConfig.WANNADE.GAME_SECONDS);
  document.getElementById('wannadeTimer').style.display = 'none';
  document.getElementById('wannadeCountNum').textContent = '0';
  document.getElementById('wannadeInstruction').textContent = 'タップしてなでなで！';
  document.getElementById('wannadeStartBtn').textContent = 'スタート！';
  document.getElementById('wannadeStartBtn').disabled = false;
  document.getElementById('wannadeStartBtn').style.display = 'inline-block';
  document.getElementById('wannadeStartBtn').onclick = wannadeStart;
}

function wannadeStart() {
  if (wannadeGameState === 'playing') return;

  wannadeGameState = 'playing';
  wannadeCount = 0;
  wannadeTimeLeft = AppConfig.WANNADE.GAME_SECONDS;
  document.getElementById('wannadeCountNum').textContent = '0';
  document.getElementById('wannadeInstruction').textContent = 'たくさんなでなでしよう！';
  document.getElementById('wannadeStartBtn').disabled = true;
  document.getElementById('wannadeStartBtn').textContent = 'ゲーム中...';
  document.getElementById('wannadeTimer').style.display = 'block';
  document.getElementById('wannadeTimer').textContent = String(AppConfig.WANNADE.GAME_SECONDS);

  // カウントダウン開始
  wannadeTimer = setInterval(() => {
    wannadeTimeLeft--;
    document.getElementById('wannadeTimer').textContent = wannadeTimeLeft;

    if (wannadeTimeLeft <= 0) {
      wannadeFinish();
    }
  }, AppConfig.TIMING.INTERVAL);
}

function wannadeTap(dog) {
  if (wannadeGameState !== 'playing') return;

  wannadeCount++;
  document.getElementById('wannadeCountNum').textContent = wannadeCount;

  // PHOTO_CHANGE_EVERY回ごとに写真を変更
  if (wannadeCount % AppConfig.WANNADE.PHOTO_CHANGE_EVERY === 0) {
    wannadeChangePhotos();
  }

  // タップエフェクト
  const dogEl = document.getElementById(dog === 'chirol' ? 'wannadeChirol' : 'wannadeDaizu');
  dogEl.classList.add('tapped');
  setTimeout(() => dogEl.classList.remove('tapped'), 150);

  // ハートエフェクト
  wannadeShowHeart(dogEl);
}

function wannadeChangePhotos() {
  // チロルの画像をランダムに変更
  const chirolImages = [...(homeDogImages.normal || []), ...(homeDogImages.happy || [])];
  if (chirolImages.length > 0) {
    const chirolImg = document.querySelector('#wannadeChirol img');
    if (chirolImg) chirolImg.src = chirolImages[Math.floor(Math.random() * chirolImages.length)];
  }
  // だいずの画像をランダムに変更
  const daizuImages = [...(homeDaizuImages.normal || []), ...(homeDaizuImages.happy || [])];
  if (daizuImages.length > 0) {
    const daizuImg = document.querySelector('#wannadeDaizu img');
    if (daizuImg) daizuImg.src = daizuImages[Math.floor(Math.random() * daizuImages.length)];
  }
}

function wannadeShowHeart(parentEl) {
  const heart = document.createElement('div');
  heart.className = 'wannade-heart';
  heart.textContent = '❤️';
  heart.style.left = (Math.random() * 60 + 20) + '%';
  parentEl.appendChild(heart);
  setTimeout(() => heart.remove(), 600);
}

function wannadeRandomizeDogs() {
  // ランダムに1匹だけ表示するか、両方表示
  const chirolEl = document.getElementById('wannadeChirol');
  const daizuEl = document.getElementById('wannadeDaizu');
  const random = Math.random();

  // チロルの画像をランダムに設定
  const allChirolImages = [
    ...(homeDogImages.normal || []),
    ...(homeDogImages.happy || [])
  ];
  if (allChirolImages.length > 0) {
    const chirolImg = chirolEl.querySelector('img');
    if (chirolImg) chirolImg.src = allChirolImages[Math.floor(Math.random() * allChirolImages.length)];
  }

  // だいずの画像をランダムに設定
  const allDaizuImages = [
    ...(homeDaizuImages.normal || []),
    ...(homeDaizuImages.happy || [])
  ];
  if (allDaizuImages.length > 0) {
    const daizuImg = daizuEl.querySelector('img');
    if (daizuImg) daizuImg.src = allDaizuImages[Math.floor(Math.random() * allDaizuImages.length)];
  }

  if (random < 0.33) {
    // チロルのみ
    chirolEl.style.display = 'flex';
    daizuEl.style.display = 'none';
  } else if (random < 0.66) {
    // だいずのみ
    chirolEl.style.display = 'none';
    daizuEl.style.display = 'flex';
  } else {
    // 両方
    chirolEl.style.display = 'flex';
    daizuEl.style.display = 'flex';
  }
}

async function wannadeFinish() {
  clearInterval(wannadeTimer);
  wannadeGameState = 'finished';
  document.getElementById('wannadeInstruction').textContent = `結果: ${wannadeCount}回！`;
  document.getElementById('wannadeStartBtn').textContent = 'もう一度';
  document.getElementById('wannadeStartBtn').disabled = false;
  document.getElementById('wannadeStartBtn').onclick = wannadeReset;

  // スコアを保存
  try {
    const response = await fetch(`${API_BASE_URL}${AppConfig.API.WANNADE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.userId,
        displayName: currentUser.displayName,
        score: wannadeCount
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.isInTop3) {
        document.getElementById('wannadeInstruction').innerHTML = `🎉 ${wannadeCount}回！<br>${data.rank}位にランクイン！`;
      }
      renderWannadeRanking(data.rankings);
    }
  } catch (error) {
    console.error('Wannade save error:', error);
  }
}

async function loadWannadeRanking() {
  try {
    const response = await fetch(`${API_BASE_URL}${AppConfig.API.WANNADE}`);
    if (response.ok) {
      const data = await response.json();
      renderWannadeRanking(data.rankings);
    }
  } catch (error) {
    console.error('Wannade ranking load error:', error);
  }
}

function renderWannadeRanking(rankings) {
  const container = document.getElementById('wannadeRankingList');
  if (!rankings || rankings.length === 0) {
    container.innerHTML = '<p style="color:#666;font-size:13px">まだランキングがありません</p>';
    return;
  }

  const medals = ['gold', 'silver', 'bronze'];
  const emojis = ['🥇', '🥈', '🥉'];

  container.innerHTML = rankings.map((r, i) => {
    // カスタム表示名を取得
    const member = familyMembers.find(m => m.userId === r.userId);
    const displayName = member ? getDisplayName(member) : r.displayName;

    // アバターを取得（写真 or 絵文字）
    const avatarPhoto = getAvatarPhoto(r.displayName);
    const avatarEmoji = getAvatarEmoji(r.displayName);
    const avatarHtml = avatarPhoto
      ? `<img src="${avatarPhoto}" class="wannade-rank-icon" onerror="this.style.display='none'">`
      : `<span class="wannade-rank-icon" style="display:flex;align-items:center;justify-content:center;background:#e8f5e9;font-size:18px">${avatarEmoji}</span>`;

    return `
      <div class="wannade-rank-item ${medals[i] || ''}">
        <span class="wannade-rank-num">${emojis[i] || (i + 1)}</span>
        ${avatarHtml}
        <span class="wannade-rank-name">${displayName}</span>
        <span class="wannade-rank-score">${r.score}回</span>
      </div>
    `;
  }).join('');
}

function wannadeBackToHome() {
  if (wannadeTimer) {
    clearInterval(wannadeTimer);
  }
  wannadeReset();
  // ホーム画像と吹き出しを復元
  document.getElementById('homeDogImage').style.display = '';
  document.getElementById('homeSpeechBubble').style.display = '';
  // 犬の表示をリセット
  document.getElementById('wannadeChirol').style.display = 'flex';
  document.getElementById('wannadeDaizu').style.display = 'flex';
  homeState = 'menu';
  homeHideAllAreas();
  homeShowMenu();
}
