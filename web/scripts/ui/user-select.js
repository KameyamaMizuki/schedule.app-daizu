// ui/user-select.js — ユーザー選択モーダル
// 依存: core/config.js, core/state.js, ui/account-edit.js (getAvatarPhoto, getAvatarEmoji)

function initCurrentUser() {
  var savedUserId = localStorage.getItem(AppConfig.STORAGE.CURRENT_USER_ID);
  if (savedUserId) {
    currentUser = familyMembers.find(function(m) { return m.userId === savedUserId; });
  }
  if (!currentUser && familyMembers.length > 0) {
    showUserSelectModal();
  } else if (currentUser) {
    updateHeaderAvatar();
  }
}

function showUserSelectModal() {
  var modal = document.getElementById('userSelectModal');
  var buttonsContainer = document.getElementById('userSelectButtons');

  buttonsContainer.innerHTML = familyMembers.map(function(member) {
    var photoUrl = getAvatarPhoto(member.displayName);
    var avatarHtml = photoUrl
      ? '<img src="' + photoUrl + '" style="width:40px;height:40px;border-radius:50%;object-fit:cover">'
      : '<span style="font-size:24px">' + getAvatarEmoji(member.displayName) + '</span>';
    return '<button class="user-select-btn" onclick="selectUser(\'' + member.userId + '\')" style="display:flex;align-items:center;justify-content:center;gap:10px">'
      + avatarHtml
      + '<span>' + getDisplayName(member) + '</span>'
      + '</button>';
  }).join('');

  modal.classList.add('active');
}

function selectUser(userId) {
  currentUser = familyMembers.find(function(m) { return m.userId === userId; });
  if (currentUser) {
    localStorage.setItem(AppConfig.STORAGE.CURRENT_USER_ID, currentUser.userId);
    document.getElementById('userSelectModal').classList.remove('active');
    updateHeaderAvatar();
    // タブキャッシュをリセット（isOwner チェックを正しく再計算するため）
    window.yousuLoaded = false;
    window.diaryLoaded = false;
  }
}

function updateHeaderAvatar() {
  var el = document.getElementById('headerUserAvatar');
  if (!currentUser || !el) return;
  var photo = getAvatarPhoto(currentUser.displayName);
  var emoji = getAvatarEmoji(currentUser.displayName);
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
