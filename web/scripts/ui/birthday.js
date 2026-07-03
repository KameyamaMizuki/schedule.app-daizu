// ========== チロル誕生日オーバーレイ ==========
// 毎年7月3日から1週間、ホームを開くとお祝いカードを表示する。
// シーン1: お祝いカード →「おめでとう！」でクラッカー演出
// シーン2: smileチロル + 「これからも大好きだよ」→「閉じる」
// 「今日はもう表示しない」→ localStorage に当日の日付を保存し、同日中は再表示しない
// （翌日〜期間中は再び表示される）。

var CHIROL_BIRTHDAY = { month: 7, day: 3 };
var BIRTHDAY_SHOW_DAYS = 7; // 誕生日から1週間表示
var BIRTHDAY_HIDE_KEY = 'chirolBirthdayHidden';

function birthdayTodayKey(now) {
  return now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
}

// 誕生日から1週間以内か（時刻を切り捨てて日数で判定）
function isChirolBirthdayWeek(now) {
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var start = new Date(now.getFullYear(), CHIROL_BIRTHDAY.month - 1, CHIROL_BIRTHDAY.day);
  var diffDays = Math.round((today - start) / 86400000);
  return diffDays >= 0 && diffDays < BIRTHDAY_SHOW_DAYS;
}

function birthdayReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function birthdayRandomImage(tag) {
  var images = (typeof homeDogImages !== 'undefined' && homeDogImages[tag]) || [];
  if (images.length === 0) return null;
  return images[Math.floor(Math.random() * images.length)];
}

function maybeShowChirolBirthday() {
  var now = new Date();
  if (!isChirolBirthdayWeek(now)) return;

  try {
    if (localStorage.getItem(BIRTHDAY_HIDE_KEY) === birthdayTodayKey(now)) return;
  } catch (e) { /* localStorage不可でも表示は続行 */ }

  var overlay = document.getElementById('birthdayOverlay');
  if (!overlay) return;

  // シーン1はnormal、シーン2(大好きだよ)はsmile(happy)で表情を変える
  var photo = document.getElementById('birthdayPhoto');
  var src = birthdayRandomImage('normal');
  if (photo && src) photo.src = src;

  birthdayBuildConfetti(overlay.querySelector('.birthday-confetti'));
  overlay.classList.add('active');
}

// 舞い落ちる紙吹雪を生成（アプリのパレット + 肉球）
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

// 「おめでとう！」→ クラッカー → シーン2へ
function chirolBirthdayCongrats(btn) {
  btn.disabled = true;
  var reduced = birthdayReducedMotion();
  if (!reduced) birthdayFireCracker(btn);
  setTimeout(birthdayShowScene2, reduced ? 150 : 950);
}

// ボタンの位置からクラッカーの紙吹雪を放射
function birthdayFireCracker(btn) {
  var card = btn.closest('.birthday-card');
  var burst = document.getElementById('birthdayBurst');
  if (!card || !burst) return;
  var cardRect = card.getBoundingClientRect();
  var btnRect = btn.getBoundingClientRect();
  var cx = btnRect.left + btnRect.width / 2 - cardRect.left;
  var cy = btnRect.top + btnRect.height / 2 - cardRect.top;
  var colors = ['#3F6E5B', '#C66A3D', '#C99A33', '#8d6e63', '#F1E9DA'];
  var emojis = ['🎉', '🐾', '⭐'];
  for (var i = 0; i < 28; i++) {
    var p = document.createElement('span');
    if (i % 6 === 5) {
      p.className = 'bp-emoji';
      p.textContent = emojis[i % emojis.length];
    } else {
      p.className = i % 2 === 0 ? 'bp-dot' : 'bp-ribbon';
      p.style.background = colors[i % colors.length];
    }
    // 上方向に扇状（-90°±100°）へ飛ばす
    var angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI * 1.1);
    var dist = 70 + Math.random() * 120;
    p.style.left = cx + 'px';
    p.style.top = cy + 'px';
    p.style.setProperty('--tx', (Math.cos(angle) * dist) + 'px');
    p.style.setProperty('--ty', (Math.sin(angle) * dist + 40) + 'px'); // +40で放物線ぽく落とす
    p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
    p.style.animationDelay = (Math.random() * 0.12) + 's';
    burst.appendChild(p);
  }
  setTimeout(function () { burst.innerHTML = ''; }, 1800);
}

function birthdayShowScene2() {
  var scene1 = document.getElementById('birthdayScene1');
  var scene2 = document.getElementById('birthdayScene2');
  if (!scene1 || !scene2) return;
  var photo = document.getElementById('birthdayPhoto2');
  var src = birthdayRandomImage('happy');
  if (photo && src) photo.src = src;
  scene1.style.display = 'none';
  scene2.style.display = 'block';
  scene2.classList.add('scene-in');
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
