// ========== チロル誕生日オーバーレイ ==========
// 毎年7月3日にホームを開くと、お祝いカードを表示する。
// 「今日はもう表示しない」→ localStorage に当日の日付を保存し、同日中は再表示しない
// （翌年の誕生日には再び表示される）。
// 「閉じる」→ 保存しないので、同日中でもアプリを開き直すと再表示される。

var CHIROL_BIRTHDAY = { month: 7, day: 3 };
var BIRTHDAY_HIDE_KEY = 'chirolBirthdayHidden';

function birthdayTodayKey(now) {
  return now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
}

function maybeShowChirolBirthday() {
  var now = new Date();
  if (now.getMonth() + 1 !== CHIROL_BIRTHDAY.month || now.getDate() !== CHIROL_BIRTHDAY.day) return;

  try {
    if (localStorage.getItem(BIRTHDAY_HIDE_KEY) === birthdayTodayKey(now)) return;
  } catch (e) { /* localStorage不可でも表示は続行 */ }

  var overlay = document.getElementById('birthdayOverlay');
  if (!overlay) return;

  // チロルのhappy写真からランダムに1枚
  var photo = document.getElementById('birthdayPhoto');
  var happyImages = (typeof homeDogImages !== 'undefined' && homeDogImages.happy) || [];
  if (photo && happyImages.length > 0) {
    photo.src = happyImages[Math.floor(Math.random() * happyImages.length)];
  }

  birthdayBuildConfetti(overlay.querySelector('.birthday-confetti'));
  overlay.classList.add('active');
}

// 紙吹雪を生成（アプリのパレット + 肉球）
function birthdayBuildConfetti(container) {
  if (!container || container.children.length > 0) return;
  var colors = ['#3F6E5B', '#C66A3D', '#C99A33', '#8d6e63', '#F1E9DA'];
  for (var i = 0; i < 20; i++) {
    var piece = document.createElement('span');
    if (i % 5 === 4) {
      piece.className = 'cf-emoji';
      piece.textContent = '🐾';
    } else {
      piece.className = i % 2 === 0 ? 'cf-dot' : 'cf-ribbon';
      piece.style.background = colors[i % colors.length];
    }
    piece.style.left = (Math.random() * 100) + '%';
    var duration = 5 + Math.random() * 4;
    piece.style.animationDuration = duration + 's';
    // 負のdelayで最初から画面全体に舞っている状態にする
    piece.style.animationDelay = (-Math.random() * duration) + 's';
    container.appendChild(piece);
  }
}

function chirolBirthdayClose() {
  var overlay = document.getElementById('birthdayOverlay');
  if (overlay) overlay.classList.remove('active');
}

function chirolBirthdayHideToday() {
  try {
    localStorage.setItem(BIRTHDAY_HIDE_KEY, birthdayTodayKey(new Date()));
  } catch (e) { /* 保存できなくても閉じる */ }
  chirolBirthdayClose();
}
