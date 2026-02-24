// ========== [HOME:TSUBUYAKI] ホームからつぶやく機能 ==========
// 依存（グローバル参照）:
//   state.js : API_BASE_URL, currentUser
//   home.js  : homeState, homeHideAllAreas, updateHomeFab,
//              homeSetRandomDogImage, homeSetSpeechText, homeBackToMenu

// ========== ホームメニュー機能 ==========

// つぶやくボタン: ホームからつぶやき入力
function homeStartTsubuyaku() {
  homeState = 'tsubuyaku';
  homeSetRandomDogImage('happy');
  homeSetSpeechText('なんか言いたいことあるのか？<br>聞いてやるぜ！');
  homeHideAllAreas();
  updateHomeFab();
  document.getElementById('homeTsubuyakiArea').classList.add('active');
  document.getElementById('homeTsubuyakiInput').value = '';
  document.getElementById('homeTsubuyakiCount').textContent = '0';
}

async function homeSubmitTsubuyaki() {
  const text = document.getElementById('homeTsubuyakiInput').value.trim();
  if (!text) return;

  // つぶやきエリアを非表示にして、犬画像と吹き出しを表示
  homeHideAllAreas();
  document.getElementById('homeDogImage').style.display = 'block';
  document.getElementById('homeSpeechBubble').style.display = 'block';

  // ①つぶやき中の画面（3秒）
  homeSetRandomDogImage('thinking');
  homeSetSpeechText('<div style="text-align:center"><strong>つぶやき中...</strong><div style="margin-top:12px;height:6px;background:#e0e0e0;border-radius:3px;overflow:hidden"><div style="width:0%;height:100%;background:linear-gradient(90deg,#4fc3f7,#29b6f6);animation:tsubuyaki-progress 3s ease-in-out forwards"></div></div></div>');

  try {
    const [response] = await Promise.all([
      fetch(`${API_BASE_URL}${AppConfig.API.POSTS}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'POST',
          userId: currentUser.userId,
          displayName: currentUser.displayName,
          text: text
        })
      }),
      new Promise(r => setTimeout(r, AppConfig.TIMING.MSG_DISPLAY)) // 最低3秒表示
    ]);

    if (response.ok) {
      // ②完了画面（3秒）
      homeSetRandomDogImage('happy');
      homeSetSpeechText('つぶやいといたぜ！<br>みんなに届くといいな！');
      setTimeout(() => {
        homeBackToMenu();
      }, AppConfig.TIMING.MSG_DISPLAY);
    } else {
      throw new Error('Failed to post');
    }
  } catch (error) {
    console.error('Tsubuyaki post error:', error);
    homeSetRandomDogImage('sad');
    homeSetSpeechText('すまん、つぶやけなかった...<br>もう一回試してくれ！');
    setTimeout(() => {
      homeBackToMenu();
    }, AppConfig.TIMING.MSG_DISPLAY);
  }

  // 入力をクリア
  document.getElementById('homeTsubuyakiInput').value = '';
  document.getElementById('homeTsubuyakiCount').textContent = '0';
}
