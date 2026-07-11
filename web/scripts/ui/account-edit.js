// ui/account-edit.js — アカウントモーダル（表示・編集）
// アカウント切り替えなし。自分の設定のみ編集。サーバー保存。
// 依存: core/config.js, core/state.js, core/account.js, ui/user-select.js

var _editingPhoto = null;
var _editingEmoji = null;
var _editingIconType = 'photo';
var _availableEmojis = ['👧','👩','👨','🧒','👶','🐕','🐈','🌸','⭐','🌙','🔥','💎'];

function openAccountModal() {
  if (!currentUser) return;
  var modal = document.getElementById('accountModal');
  _renderAccountView();
  modal.classList.add('active');
}

function closeAccountModal() {
  document.getElementById('accountModal').classList.remove('active');
}

function _renderAccountView() {
  var photo = getAvatarPhoto(currentUser.userId);
  var emoji = getAvatarEmoji(currentUser.userId);
  var settings = accountSettingsCache[currentUser.userId] || {};

  document.getElementById('accountViewMode').style.display = 'block';
  document.getElementById('accountEditMode').style.display = 'none';

  var avatarEl = document.getElementById('accountAvatar');
  var avatarImg = document.getElementById('accountAvatarImg');
  if (photo) {
    avatarEl.style.display = 'none';
    avatarImg.src = photo; avatarImg.style.display = 'block';
  } else {
    avatarImg.style.display = 'none';
    avatarEl.style.display = 'block';
    avatarEl.textContent = emoji;
  }
  document.getElementById('accountName').textContent = getDisplayName(currentUser);

  var birthdayEl = document.getElementById('accountBirthday');
  if (birthdayEl) birthdayEl.textContent = settings.birthday ? '🎂 ' + settings.birthday : '🎂 生年月日: 未設定';
}

function startEditAccount() {
  if (!currentUser) return;
  var settings = accountSettingsCache[currentUser.userId] || {};
  _editingPhoto = settings.avatarUrl || null;
  _editingEmoji = settings.avatarEmoji || '👤';
  _editingIconType = settings.avatarType || 'photo';

  document.getElementById('accountViewMode').style.display = 'none';
  document.getElementById('accountEditMode').style.display = 'block';
  document.getElementById('accountNameInput').value = getDisplayName(currentUser);

  var birthdayInput = document.getElementById('accountBirthdayInput');
  if (birthdayInput) birthdayInput.value = settings.birthday || '';

  switchAccountIconTab(_editingIconType);

  var preview = document.getElementById('accountPhotoPreview');
  var previewImg = document.getElementById('accountPreviewImg');
  if (_editingPhoto) {
    previewImg.src = _editingPhoto;
    preview.classList.add('has-photo');
    document.getElementById('accountPhotoRemove').style.display = 'block';
  } else {
    previewImg.src = ''; preview.classList.remove('has-photo');
    document.getElementById('accountPhotoRemove').style.display = 'none';
  }

  document.getElementById('accountEmojiPicker').innerHTML = _availableEmojis.map(function(e) {
    return '<div class="account-emoji-option' + (e === _editingEmoji ? ' selected' : '') + '" onclick="selectAccountEmoji(\'' + e + '\')">' + e + '</div>';
  }).join('');
}

function switchAccountIconTab(tab) {
  _editingIconType = tab;
  document.getElementById('accountIconPhotoTab').classList.toggle('active', tab === 'photo');
  document.getElementById('accountIconEmojiTab').classList.toggle('active', tab === 'emoji');
  document.getElementById('accountPhotoPicker').style.display = tab === 'photo' ? 'flex' : 'none';
  document.getElementById('accountEmojiPicker').style.display = tab === 'emoji' ? 'grid' : 'none';
}

async function accountPhotoSelected(event) {
  var file = event.target.files[0];
  if (!file) return;
  try {
    _editingPhoto = await compressImage(file, AppConfig.IMAGE.AVATAR_PHOTO.maxWidth, AppConfig.IMAGE.AVATAR_PHOTO.quality);
    var preview = document.getElementById('accountPhotoPreview');
    document.getElementById('accountPreviewImg').src = _editingPhoto;
    preview.classList.add('has-photo');
    document.getElementById('accountPhotoRemove').style.display = 'block';
  } catch (e) { alert('画像の読み込みに失敗しました'); }
}

function removeAccountPhoto() {
  _editingPhoto = null;
  document.getElementById('accountPreviewImg').src = '';
  document.getElementById('accountPhotoPreview').classList.remove('has-photo');
  document.getElementById('accountPhotoRemove').style.display = 'none';
}

function selectAccountEmoji(emoji) {
  _editingEmoji = emoji;
  document.querySelectorAll('.account-emoji-option').forEach(function(el) {
    el.classList.toggle('selected', el.textContent === emoji);
  });
}

function cancelEditAccount() {
  document.getElementById('accountViewMode').style.display = 'block';
  document.getElementById('accountEditMode').style.display = 'none';
}

async function saveAccountEdit() {
  if (!currentUser) return;
  var newName = document.getElementById('accountNameInput').value.trim();
  if (!newName) { alert('表示名を入力してください'); return; }

  var btn = document.getElementById('accountSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = '保存中...'; }

  try {
    var avatarUrl = null;
    if (_editingIconType === 'photo' && _editingPhoto && _editingPhoto.startsWith('data:')) {
      avatarUrl = await uploadImageToS3(_editingPhoto, 'avatar');
    } else if (_editingIconType === 'photo' && _editingPhoto) {
      avatarUrl = _editingPhoto;
    }

    var birthdayInput = document.getElementById('accountBirthdayInput');
    var payload = {
      userId: currentUser.userId,
      displayName: newName,
      avatarType: _editingIconType,
      avatarUrl: avatarUrl || '',
      avatarEmoji: _editingIconType === 'emoji' ? _editingEmoji : '',
      birthday: birthdayInput ? (birthdayInput.value || '') : ''
    };

    var updated = await Api.updateAccount(payload);
    accountSettingsCache[currentUser.userId] = updated;

    cancelEditAccount();
    _renderAccountView();
    updateHeaderAvatar();
  } catch (e) {
    alert('設定の保存に失敗しました: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '保存'; }
  }
}

function openPinSetting() {
  var section = document.getElementById('pinSettingSection');
  if (section) section.style.display = section.style.display === 'none' ? 'block' : 'none';
}

async function savePin() {
  if (!currentUser) return;
  var input = document.getElementById('pinInput');
  var pin = input ? input.value.trim() : '';
  if (!/^\d{4}$/.test(pin)) { alert('PINは4桁の数字で入力してください'); return; }

  try {
    await Api.setPin({ userId: currentUser.userId, pin: pin });
    alert('PINを設定しました');
    if (input) input.value = '';
    openPinSetting();
  } catch (e) {
    alert('PIN設定に失敗しました: ' + e.message);
  }
}

function shareAppLink() {
  var url = 'https://family-schedule-web-kame-982312822872.s3.ap-northeast-1.amazonaws.com/home.html';
  if (navigator.share) {
    navigator.share({ title: 'スケジュールアプリ', url: url });
  } else {
    navigator.clipboard.writeText(url).then(function() {
      alert('リンクをコピーしました！');
    });
  }
}
