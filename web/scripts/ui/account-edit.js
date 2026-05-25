// ui/account-edit.js — アカウントモーダル（表示・編集・切り替え）
// 依存: core/config.js, core/state.js, core/utils.js (compressImage), ui/user-select.js (updateHeaderAvatar)

// アイコン選択肢
var availableEmojis = ['👧', '👩', '👨', '🧒', '👶', '🐕', '🐈', '🌸', '⭐', '🌙', '🔥', '💎'];

function getAvatarPhoto(name) {
  var customPhotos = JSON.parse(localStorage.getItem(AppConfig.STORAGE.CUSTOM_PHOTOS) || '{}');
  return customPhotos[name] || null;
}

function getAvatarEmoji(name) {
  var customAvatars = JSON.parse(localStorage.getItem(AppConfig.STORAGE.CUSTOM_AVATARS) || '{}');
  if (customAvatars[name]) return customAvatars[name];
  var defaultAvatars = AppConfig.DEFAULT_AVATARS;
  return defaultAvatars[name] || '👤';
}

function openAccountModal() {
  var modal = document.getElementById('accountModal');
  var nameEl = document.getElementById('accountName');
  var avatarEl = document.getElementById('accountAvatar');
  var avatarImg = document.getElementById('accountAvatarImg');
  var buttonsContainer = document.getElementById('accountSwitchButtons');

  if (currentUser) {
    nameEl.textContent = getDisplayName(currentUser);
    var photoUrl = getAvatarPhoto(currentUser.displayName);
    if (photoUrl) {
      avatarEl.style.display = 'none';
      avatarImg.src = photoUrl;
      avatarImg.style.display = 'block';
    } else {
      avatarImg.style.display = 'none';
      avatarEl.style.display = 'block';
      avatarEl.textContent = getAvatarEmoji(currentUser.displayName);
    }
  } else {
    nameEl.textContent = '未選択';
    avatarImg.style.display = 'none';
    avatarEl.style.display = 'block';
    avatarEl.textContent = '👤';
  }

  // 生年月日の表示
  var birthdayEl = document.getElementById('accountBirthday');
  if (birthdayEl) {
    var savedBirthdays = JSON.parse(localStorage.getItem(AppConfig.STORAGE.FAMILY_BIRTHDAYS) || '{}');
    var birthday = currentUser ? savedBirthdays[currentUser.displayName] : null;
    birthdayEl.textContent = birthday ? '🎂 生年月日: ' + birthday : '🎂 生年月日: 未設定';
  }

  // 切り替えボタン生成
  buttonsContainer.innerHTML = familyMembers.map(function(member) {
    var isCurrent = currentUser && currentUser.userId === member.userId;
    var memberPhoto = getAvatarPhoto(member.displayName);
    var avatarHtml = memberPhoto
      ? '<img src="' + memberPhoto + '" class="avatar-img">'
      : '<span class="avatar">' + getAvatarEmoji(member.displayName) + '</span>';
    return '<button class="account-switch-btn ' + (isCurrent ? 'current' : '') + '" onclick="switchAccount(\'' + member.userId + '\')">'
      + avatarHtml
      + '<span style="flex:1;text-align:left">' + getDisplayName(member) + '</span>'
      + (isCurrent ? '<span>✓</span>' : '')
      + '</button>';
  }).join('');

  modal.classList.add('active');
}

function closeAccountModal() {
  document.getElementById('accountModal').classList.remove('active');
}

function switchAccount(userId) {
  currentUser = familyMembers.find(function(m) { return m.userId === userId; });
  if (currentUser) {
    localStorage.setItem(AppConfig.STORAGE.CURRENT_USER_ID, currentUser.userId);
    updateHeaderAvatar();
    window.yousuLoaded = false;
    window.diaryLoaded = false;
  }
  closeAccountModal();
}

var editingAccountEmoji = null;
var editingAccountPhoto = null;
var editingAccountIconType = 'photo';

function startEditAccount() {
  if (!currentUser) return;

  document.getElementById('accountViewMode').style.display = 'none';
  document.getElementById('accountEditMode').style.display = 'block';

  var currentPhoto = getAvatarPhoto(currentUser.displayName);
  var currentEmoji = getAvatarEmoji(currentUser.displayName);
  editingAccountPhoto = currentPhoto;
  editingAccountEmoji = currentEmoji;

  editingAccountIconType = 'photo';
  switchAccountIconTab(editingAccountIconType);

  var preview = document.getElementById('accountPhotoPreview');
  var previewImg = document.getElementById('accountPreviewImg');
  var removeBtn = document.getElementById('accountPhotoRemove');
  if (currentPhoto) {
    previewImg.src = currentPhoto;
    preview.classList.add('has-photo');
    removeBtn.style.display = 'block';
  } else {
    previewImg.src = '';
    preview.classList.remove('has-photo');
    removeBtn.style.display = 'none';
  }

  var picker = document.getElementById('accountEmojiPicker');
  picker.innerHTML = availableEmojis.map(function(emoji) {
    return '<div class="account-emoji-option ' + (emoji === currentEmoji ? 'selected' : '') + '" onclick="selectAccountEmoji(\'' + emoji + '\')">' + emoji + '</div>';
  }).join('');

  document.getElementById('accountNameInput').value = getDisplayName(currentUser);

  var birthdayInput = document.getElementById('accountBirthdayInput');
  if (birthdayInput) {
    var savedBirthdays = JSON.parse(localStorage.getItem(AppConfig.STORAGE.FAMILY_BIRTHDAYS) || '{}');
    birthdayInput.value = savedBirthdays[currentUser.displayName] || '';
  }
}

function switchAccountIconTab(tab) {
  editingAccountIconType = tab;
  document.getElementById('accountIconPhotoTab').classList.toggle('active', tab === 'photo');
  document.getElementById('accountIconEmojiTab').classList.toggle('active', tab === 'emoji');
  document.getElementById('accountPhotoPicker').style.display = tab === 'photo' ? 'flex' : 'none';
  document.getElementById('accountEmojiPicker').style.display = tab === 'emoji' ? 'grid' : 'none';
}

async function accountPhotoSelected(event) {
  var file = event.target.files[0];
  if (!file) return;

  try {
    editingAccountPhoto = await compressImage(file, AppConfig.IMAGE.AVATAR_PHOTO.maxWidth, AppConfig.IMAGE.AVATAR_PHOTO.quality);
    var preview = document.getElementById('accountPhotoPreview');
    var previewImg = document.getElementById('accountPreviewImg');
    previewImg.src = editingAccountPhoto;
    preview.classList.add('has-photo');
    document.getElementById('accountPhotoRemove').style.display = 'block';
  } catch (e) {
    console.error('Photo compress error:', e);
    alert('画像の読み込みに失敗しました');
  }
}

function removeAccountPhoto() {
  editingAccountPhoto = null;
  var preview = document.getElementById('accountPhotoPreview');
  var previewImg = document.getElementById('accountPreviewImg');
  previewImg.src = '';
  preview.classList.remove('has-photo');
  document.getElementById('accountPhotoRemove').style.display = 'none';
}

function selectAccountEmoji(emoji) {
  editingAccountEmoji = emoji;
  document.querySelectorAll('.account-emoji-option').forEach(function(el) {
    el.classList.toggle('selected', el.textContent === emoji);
  });
}

function cancelEditAccount() {
  document.getElementById('accountViewMode').style.display = 'block';
  document.getElementById('accountEditMode').style.display = 'none';
  editingAccountPhoto = null;
}

function saveAccountEdit() {
  if (!currentUser) return;

  var newName = document.getElementById('accountNameInput').value.trim();
  if (!newName) {
    alert('表示名を入力してください');
    return;
  }

  if (editingAccountIconType === 'photo' && editingAccountPhoto) {
    var customPhotos = JSON.parse(localStorage.getItem(AppConfig.STORAGE.CUSTOM_PHOTOS) || '{}');
    customPhotos[currentUser.displayName] = editingAccountPhoto;
    localStorage.setItem(AppConfig.STORAGE.CUSTOM_PHOTOS, JSON.stringify(customPhotos));
    var customAvatars = JSON.parse(localStorage.getItem(AppConfig.STORAGE.CUSTOM_AVATARS) || '{}');
    delete customAvatars[currentUser.displayName];
    localStorage.setItem(AppConfig.STORAGE.CUSTOM_AVATARS, JSON.stringify(customAvatars));
  } else {
    var customAvatars2 = JSON.parse(localStorage.getItem(AppConfig.STORAGE.CUSTOM_AVATARS) || '{}');
    customAvatars2[currentUser.displayName] = editingAccountEmoji;
    localStorage.setItem(AppConfig.STORAGE.CUSTOM_AVATARS, JSON.stringify(customAvatars2));
    if (editingAccountIconType === 'emoji' || !editingAccountPhoto) {
      var customPhotos2 = JSON.parse(localStorage.getItem(AppConfig.STORAGE.CUSTOM_PHOTOS) || '{}');
      delete customPhotos2[currentUser.displayName];
      localStorage.setItem(AppConfig.STORAGE.CUSTOM_PHOTOS, JSON.stringify(customPhotos2));
    }
  }

  var customNames = JSON.parse(localStorage.getItem(AppConfig.STORAGE.CUSTOM_NAMES) || '{}');
  customNames[currentUser.userId] = newName;
  localStorage.setItem(AppConfig.STORAGE.CUSTOM_NAMES, JSON.stringify(customNames));

  var birthdayInput = document.getElementById('accountBirthdayInput');
  if (birthdayInput) {
    var savedBirthdays = JSON.parse(localStorage.getItem(AppConfig.STORAGE.FAMILY_BIRTHDAYS) || '{}');
    if (birthdayInput.value) {
      savedBirthdays[currentUser.displayName] = birthdayInput.value;
    } else {
      delete savedBirthdays[currentUser.displayName];
    }
    localStorage.setItem(AppConfig.STORAGE.FAMILY_BIRTHDAYS, JSON.stringify(savedBirthdays));
  }

  cancelEditAccount();
  openAccountModal();
}
