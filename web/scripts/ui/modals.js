// ui/modals.js — User管理 + Accountモーダル + Cropモーダル
// 依存: core/config.js, core/state.js, core/utils.js
// ※ Sidebar制御は ui/sidebar.ui.js に移動済み

// ========== ユーザー管理 ==========
// currentUserはAppState.currentUser（互換aliasあり）
function initCurrentUser() {
  const savedUserId = localStorage.getItem(AppConfig.STORAGE.CURRENT_USER_ID);
  if (savedUserId) {
    currentUser = familyMembers.find(m => m.userId === savedUserId);
  }
  if (!currentUser && familyMembers.length > 0) {
    // 初回訪問時はユーザー選択モーダルを表示
    showUserSelectModal();
  } else if (currentUser) {
    // ページ読み込み時にアバター写真を復元する
    updateHeaderAvatar();
  }
}

function showUserSelectModal() {
  const modal = document.getElementById('userSelectModal');
  const buttonsContainer = document.getElementById('userSelectButtons');

  buttonsContainer.innerHTML = familyMembers.map(member => {
    const photoUrl = getAvatarPhoto(member.displayName);
    const avatarHtml = photoUrl
      ? `<img src="${photoUrl}" style="width:40px;height:40px;border-radius:50%;object-fit:cover">`
      : `<span style="font-size:24px">${getAvatarEmoji(member.displayName)}</span>`;
    return `<button class="user-select-btn" onclick="selectUser('${member.userId}')" style="display:flex;align-items:center;justify-content:center;gap:10px">
      ${avatarHtml}
      <span>${getDisplayName(member)}</span>
    </button>`;
  }).join('');

  modal.classList.add('active');
}

function selectUser(userId) {
  currentUser = familyMembers.find(m => m.userId === userId);
  if (currentUser) {
    localStorage.setItem(AppConfig.STORAGE.CURRENT_USER_ID, currentUser.userId);
    document.getElementById('userSelectModal').classList.remove('active');
    updateHeaderAvatar();
    // タブキャッシュをリセット（isOwner チェックを正しく再計算するため）
    window.tsubuyakiLoaded = false;
    window.diaryLoaded = false;
    // つぶやきが既にレンダリング済みなら即時再描画
    if (typeof renderTsubuyakiPosts === 'function') {
      renderTsubuyakiPosts();
    }
  }
}

function updateHeaderAvatar() {
  const el = document.getElementById('headerUserAvatar');
  if (!currentUser || !el) return;
  const photo = getAvatarPhoto(currentUser.displayName);
  const emoji = getAvatarEmoji(currentUser.displayName);
  // innerHTML を使わず createElement で設定（CSS transition 中の img リロード失敗を防ぐ）
  el.textContent = '';
  if (photo) {
    const img = document.createElement('img');
    img.className = 'header-avatar-img';
    img.onerror = function() { el.textContent = emoji; };
    el.appendChild(img);  // src設定前にDOMに追加してonerrorを確実に動作させる
    img.src = photo;
  } else {
    el.textContent = emoji;
  }
}

// ========== アカウントモーダル ==========
function openAccountModal() {
  const modal = document.getElementById('accountModal');
  const nameEl = document.getElementById('accountName');
  const avatarEl = document.getElementById('accountAvatar');
  const avatarImg = document.getElementById('accountAvatarImg');
  const buttonsContainer = document.getElementById('accountSwitchButtons');

  // 現在のユーザー表示
  if (currentUser) {
    nameEl.textContent = getDisplayName(currentUser);
    const photoUrl = getAvatarPhoto(currentUser.displayName);
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
  const birthdayEl = document.getElementById('accountBirthday');
  if (birthdayEl) {
    const savedBirthdays = JSON.parse(localStorage.getItem(AppConfig.STORAGE.FAMILY_BIRTHDAYS) || '{}');
    const birthday = currentUser ? savedBirthdays[currentUser.displayName] : null;
    birthdayEl.textContent = birthday ? `🎂 生年月日: ${birthday}` : '🎂 生年月日: 未設定';
  }

  // 切り替えボタン生成
  buttonsContainer.innerHTML = familyMembers.map(member => {
    const isCurrent = currentUser && currentUser.userId === member.userId;
    const photoUrl = getAvatarPhoto(member.displayName);
    const avatarHtml = photoUrl
      ? `<img src="${photoUrl}" class="avatar-img">`
      : `<span class="avatar">${getAvatarEmoji(member.displayName)}</span>`;
    return `<button class="account-switch-btn ${isCurrent ? 'current' : ''}" onclick="switchAccount('${member.userId}')">
      ${avatarHtml}
      <span style="flex:1;text-align:left">${getDisplayName(member)}</span>
      ${isCurrent ? '<span>✓</span>' : ''}
    </button>`;
  }).join('');

  modal.classList.add('active');
}

function getAvatarPhoto(name) {
  const customPhotos = JSON.parse(localStorage.getItem(AppConfig.STORAGE.CUSTOM_PHOTOS) || '{}');
  return customPhotos[name] || null;
}

function closeAccountModal() {
  document.getElementById('accountModal').classList.remove('active');
}

function switchAccount(userId) {
  currentUser = familyMembers.find(m => m.userId === userId);
  if (currentUser) {
    localStorage.setItem(AppConfig.STORAGE.CURRENT_USER_ID, currentUser.userId);
    updateHeaderAvatar();
    // タブキャッシュをリセット（isOwner チェックを正しく再計算するため）
    window.tsubuyakiLoaded = false;
    window.diaryLoaded = false;
    // つぶやきが既にレンダリング済みなら即時再描画
    if (typeof renderTsubuyakiPosts === 'function') {
      renderTsubuyakiPosts();
    }
  }
  closeAccountModal();
}

// アイコン選択肢
const availableEmojis = ['👧', '👩', '👨', '🧒', '👶', '🐕', '🐈', '🌸', '⭐', '🌙', '🔥', '💎'];

function getAvatarEmoji(name) {
  // カスタムアイコンがあればそれを使用
  const customAvatars = JSON.parse(localStorage.getItem(AppConfig.STORAGE.CUSTOM_AVATARS) || '{}');
  if (customAvatars[name]) return customAvatars[name];

  const defaultAvatars = { '瑞季': '👧', '才子': '👩', '桃寧': '👨' };
  return defaultAvatars[name] || '👤';
}

// getDisplayName / getDisplayNameByUserId は core/account.js に移動済み

let editingAccountEmoji = null;
let editingAccountPhoto = null;
let editingAccountIconType = 'photo'; // 'photo' or 'emoji'

function startEditAccount() {
  if (!currentUser) return;

  document.getElementById('accountViewMode').style.display = 'none';
  document.getElementById('accountEditMode').style.display = 'block';

  // 現在の写真またはemojiを取得
  const currentPhoto = getAvatarPhoto(currentUser.displayName);
  const currentEmoji = getAvatarEmoji(currentUser.displayName);
  editingAccountPhoto = currentPhoto;
  editingAccountEmoji = currentEmoji;

  // タブ状態をリセット
  if (currentPhoto) {
    editingAccountIconType = 'photo';
  } else {
    editingAccountIconType = 'photo'; // デフォルトは写真タブ
  }
  switchAccountIconTab(editingAccountIconType);

  // 写真プレビューを設定
  const preview = document.getElementById('accountPhotoPreview');
  const previewImg = document.getElementById('accountPreviewImg');
  const removeBtn = document.getElementById('accountPhotoRemove');
  if (currentPhoto) {
    previewImg.src = currentPhoto;
    preview.classList.add('has-photo');
    removeBtn.style.display = 'block';
  } else {
    previewImg.src = '';
    preview.classList.remove('has-photo');
    removeBtn.style.display = 'none';
  }

  // 絵文字ピッカー生成
  const picker = document.getElementById('accountEmojiPicker');
  picker.innerHTML = availableEmojis.map(emoji =>
    `<div class="account-emoji-option ${emoji === currentEmoji ? 'selected' : ''}" onclick="selectAccountEmoji('${emoji}')">${emoji}</div>`
  ).join('');

  // 現在の表示名をセット
  document.getElementById('accountNameInput').value = getDisplayName(currentUser);

  // 現在の生年月日をセット
  const birthdayInput = document.getElementById('accountBirthdayInput');
  if (birthdayInput) {
    const savedBirthdays = JSON.parse(localStorage.getItem(AppConfig.STORAGE.FAMILY_BIRTHDAYS) || '{}');
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
  const file = event.target.files[0];
  if (!file) return;

  try {
    // 画像を圧縮
    editingAccountPhoto = await compressImage(file, AppConfig.IMAGE.AVATAR_PHOTO.maxWidth, AppConfig.IMAGE.AVATAR_PHOTO.quality);
    const preview = document.getElementById('accountPhotoPreview');
    const previewImg = document.getElementById('accountPreviewImg');
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
  const preview = document.getElementById('accountPhotoPreview');
  const previewImg = document.getElementById('accountPreviewImg');
  previewImg.src = '';
  preview.classList.remove('has-photo');
  document.getElementById('accountPhotoRemove').style.display = 'none';
}

function selectAccountEmoji(emoji) {
  editingAccountEmoji = emoji;
  document.querySelectorAll('.account-emoji-option').forEach(el => {
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

  const newName = document.getElementById('accountNameInput').value.trim();
  if (!newName) {
    alert('表示名を入力してください');
    return;
  }

  // 写真かemojiかによって保存先を分ける
  if (editingAccountIconType === 'photo' && editingAccountPhoto) {
    // 写真を保存
    const customPhotos = JSON.parse(localStorage.getItem(AppConfig.STORAGE.CUSTOM_PHOTOS) || '{}');
    customPhotos[currentUser.displayName] = editingAccountPhoto;
    localStorage.setItem(AppConfig.STORAGE.CUSTOM_PHOTOS, JSON.stringify(customPhotos));
    // emojiはクリア
    const customAvatars = JSON.parse(localStorage.getItem(AppConfig.STORAGE.CUSTOM_AVATARS) || '{}');
    delete customAvatars[currentUser.displayName];
    localStorage.setItem(AppConfig.STORAGE.CUSTOM_AVATARS, JSON.stringify(customAvatars));
  } else {
    // emojiを保存
    const customAvatars = JSON.parse(localStorage.getItem(AppConfig.STORAGE.CUSTOM_AVATARS) || '{}');
    customAvatars[currentUser.displayName] = editingAccountEmoji;
    localStorage.setItem(AppConfig.STORAGE.CUSTOM_AVATARS, JSON.stringify(customAvatars));
    // 写真はクリア（写真タブで削除ボタンを押した場合も含む）
    if (editingAccountIconType === 'emoji' || !editingAccountPhoto) {
      const customPhotos = JSON.parse(localStorage.getItem(AppConfig.STORAGE.CUSTOM_PHOTOS) || '{}');
      delete customPhotos[currentUser.displayName];
      localStorage.setItem(AppConfig.STORAGE.CUSTOM_PHOTOS, JSON.stringify(customPhotos));
    }
  }

  // カスタム表示名を保存
  const customNames = JSON.parse(localStorage.getItem(AppConfig.STORAGE.CUSTOM_NAMES) || '{}');
  customNames[currentUser.userId] = newName;
  localStorage.setItem(AppConfig.STORAGE.CUSTOM_NAMES, JSON.stringify(customNames));

  // 生年月日を保存
  const birthdayInput = document.getElementById('accountBirthdayInput');
  if (birthdayInput) {
    const savedBirthdays = JSON.parse(localStorage.getItem(AppConfig.STORAGE.FAMILY_BIRTHDAYS) || '{}');
    if (birthdayInput.value) {
      savedBirthdays[currentUser.displayName] = birthdayInput.value;
    } else {
      delete savedBirthdays[currentUser.displayName];
    }
    localStorage.setItem(AppConfig.STORAGE.FAMILY_BIRTHDAYS, JSON.stringify(savedBirthdays));
  }

  // 表示を更新
  cancelEditAccount();
  openAccountModal(); // 再度開いて更新を反映
}

// ========== 画像切り抜きモーダル ==========
let cropImage = null;
let cropStartX = 0, cropStartY = 0;
let cropSize = 200;
let _cropCallback = null;

function openCropModal(imageSrc, callback) {
  _cropCallback = callback || null;
  const modal = document.getElementById('cropModal');
  const canvas = document.getElementById('cropCanvas');

  cropImage = new Image();
  cropImage.onload = function() {
    // キャンバスサイズを設定
    const maxSize = Math.min(window.innerWidth - 40, window.innerHeight - 200);
    const scale = Math.min(maxSize / cropImage.width, maxSize / cropImage.height);
    canvas.width = cropImage.width * scale;
    canvas.height = cropImage.height * scale;

    // 正方形のサイズを決定（短辺の80%）
    cropSize = Math.min(canvas.width, canvas.height) * 0.8;
    cropStartX = (canvas.width - cropSize) / 2;
    cropStartY = (canvas.height - cropSize) / 2;

    drawCropCanvas();
    modal.classList.add('active');

    // タッチ/ドラッグイベント
    canvas.addEventListener('mousedown', startCropDrag);
    canvas.addEventListener('touchstart', startCropDrag, { passive: false });
  };
  cropImage.src = imageSrc;
}

function drawCropCanvas() {
  const canvas = document.getElementById('cropCanvas');
  const ctx = canvas.getContext('2d');

  // 背景をクリア
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 画像を描画
  ctx.drawImage(cropImage, 0, 0, canvas.width, canvas.height);

  // 暗いオーバーレイ
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 切り抜き領域を明るく
  ctx.clearRect(cropStartX, cropStartY, cropSize, cropSize);
  ctx.drawImage(cropImage,
    cropStartX / canvas.width * cropImage.width,
    cropStartY / canvas.height * cropImage.height,
    cropSize / canvas.width * cropImage.width,
    cropSize / canvas.height * cropImage.height,
    cropStartX, cropStartY, cropSize, cropSize
  );

  // 枠線
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(cropStartX, cropStartY, cropSize, cropSize);

  // グリッド線（3分割）
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  const third = cropSize / 3;
  ctx.beginPath();
  ctx.moveTo(cropStartX + third, cropStartY);
  ctx.lineTo(cropStartX + third, cropStartY + cropSize);
  ctx.moveTo(cropStartX + third * 2, cropStartY);
  ctx.lineTo(cropStartX + third * 2, cropStartY + cropSize);
  ctx.moveTo(cropStartX, cropStartY + third);
  ctx.lineTo(cropStartX + cropSize, cropStartY + third);
  ctx.moveTo(cropStartX, cropStartY + third * 2);
  ctx.lineTo(cropStartX + cropSize, cropStartY + third * 2);
  ctx.stroke();
}

let isDragging = false;
let dragStartX, dragStartY;
let isPinching = false;
let pinchStartDistance = 0;
let pinchStartCropSize = 200;

function getPinchDistance(e) {
  const dx = e.touches[0].clientX - e.touches[1].clientX;
  const dy = e.touches[0].clientY - e.touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function startCropDrag(e) {
  e.preventDefault();
  if (e.touches && e.touches.length === 2) {
    isPinching = true;
    isDragging = false;
    pinchStartDistance = getPinchDistance(e);
    pinchStartCropSize = cropSize;
    document.addEventListener('touchmove', moveCropDrag, { passive: false });
    document.addEventListener('touchend', endCropDrag);
    return;
  }
  isDragging = true;
  isPinching = false;
  const pos = getEventPos(e);
  dragStartX = pos.x - cropStartX;
  dragStartY = pos.y - cropStartY;

  document.addEventListener('mousemove', moveCropDrag);
  document.addEventListener('mouseup', endCropDrag);
  document.addEventListener('touchmove', moveCropDrag, { passive: false });
  document.addEventListener('touchend', endCropDrag);
}

function moveCropDrag(e) {
  if (!isDragging && !isPinching) return;
  e.preventDefault();
  const canvas = document.getElementById('cropCanvas');

  if (isPinching && e.touches && e.touches.length === 2) {
    const currentDistance = getPinchDistance(e);
    const scale = currentDistance / pinchStartDistance;
    const minSize = 50;
    const maxSize = Math.min(canvas.width, canvas.height);
    const newSize = Math.max(minSize, Math.min(maxSize, pinchStartCropSize * scale));
    // 中心点を維持してリサイズ
    const centerX = cropStartX + cropSize / 2;
    const centerY = cropStartY + cropSize / 2;
    cropSize = newSize;
    cropStartX = Math.max(0, Math.min(canvas.width - cropSize, centerX - cropSize / 2));
    cropStartY = Math.max(0, Math.min(canvas.height - cropSize, centerY - cropSize / 2));
    drawCropCanvas();
    return;
  }

  if (isDragging) {
    const pos = getEventPos(e);
    cropStartX = Math.max(0, Math.min(canvas.width - cropSize, pos.x - dragStartX));
    cropStartY = Math.max(0, Math.min(canvas.height - cropSize, pos.y - dragStartY));
    drawCropCanvas();
  }
}

function endCropDrag() {
  isDragging = false;
  isPinching = false;
  document.removeEventListener('mousemove', moveCropDrag);
  document.removeEventListener('mouseup', endCropDrag);
  document.removeEventListener('touchmove', moveCropDrag);
  document.removeEventListener('touchend', endCropDrag);
}

function getEventPos(e) {
  const canvas = document.getElementById('cropCanvas');
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
}

function closeCropModal() {
  document.getElementById('cropModal').classList.remove('active');
  const chirolInput = document.getElementById('chirolImageInput');
  if (chirolInput) chirolInput.value = '';
  const wanstaInput = document.getElementById('wanstaPhotoInput');
  if (wanstaInput) wanstaInput.value = '';
}

function confirmCrop() {
  const canvas = document.getElementById('cropCanvas');

  // 切り抜き用の一時キャンバス
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = AppConfig.IMAGE.CROP_RESULT.maxWidth;
  tempCanvas.height = AppConfig.IMAGE.CROP_RESULT.maxWidth;
  const tempCtx = tempCanvas.getContext('2d');

  // 元画像から切り抜き領域を計算
  const scaleX = cropImage.width / canvas.width;
  const scaleY = cropImage.height / canvas.height;

  tempCtx.drawImage(cropImage,
    cropStartX * scaleX, cropStartY * scaleY,
    cropSize * scaleX, cropSize * scaleY,
    0, 0, AppConfig.IMAGE.CROP_RESULT.maxWidth, AppConfig.IMAGE.CROP_RESULT.maxWidth
  );

  const result = tempCanvas.toDataURL('image/jpeg', AppConfig.IMAGE.CROP_RESULT.quality);

  closeCropModal();

  if (_cropCallback) {
    _cropCallback(result);
    _cropCallback = null;
  }
}
