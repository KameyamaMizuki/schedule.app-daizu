// ui/user-select.js — 認証完了後のUI更新のみ担当
// 認証フロー自体は core/auth.js が管理する

/**
 * ヘッダーアバターを現在のユーザー設定で更新
 */
function updateHeaderAvatar() {
  var el = document.getElementById('headerUserAvatar');
  if (!currentUser || !el) return;
  var photo = getAvatarPhoto(currentUser.userId);
  var emoji = getAvatarEmoji(currentUser.userId);
  el.textContent = '';
  if (photo) {
    var img = document.createElement('img');
    img.className = 'header-avatar-img';
    img.onerror = function() { el.textContent = emoji; };
    el.appendChild(img);
    img.src = photo;
  } else {
    el.textContent = emoji;
  }
}

/**
 * 認証完了後に呼ばれるコールバック（auth.jsから呼ばれる）
 */
function onAuthComplete() {
  updateHeaderAvatar();
  window.yousuLoaded = false;
  window.diaryLoaded = false;
}

// 後方互換: dashboard.page.js の initCurrentUser() 呼び出しを auth.js に委譲
function initCurrentUser() {
  if (typeof initAuth === 'function') {
    initAuth();
  }
}
