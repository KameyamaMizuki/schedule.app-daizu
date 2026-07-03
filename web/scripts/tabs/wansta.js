// ========== ワンスタタブ — コア（データ・ギャラリー・アップロード・一言CRUD） ==========
// 依存: core/config.js, core/state.js, core/utils.js, ui/account-edit.js (getAvatarPhoto, getAvatarEmoji)
var wanstaCurrentAccount = 'chirol'; // 'chirol' or 'daizu'
var wanstaCurrentTab = 'photo'; // 'photo' or 'hitokoto'
var wanstaPhotos = { chirol: [], daizu: [] };

// デフォルト一言（ホーム画面と統一）
var defaultHitokotoChirol = AppConfig.CHIROL_HITOKOTO_TEXTS.map(function(text, i) { return { id: 'default_' + (i + 1), text: text, isDefault: true }; });
var defaultHitokotoDaizu = AppConfig.DAIZU_HITOKOTO_TEXTS.map(function(text, i) { return { id: 'default_d' + (i + 1), text: text, isDefault: true }; });
var wanstaHitokoto = { chirol: defaultHitokotoChirol.slice(), daizu: defaultHitokotoDaizu.slice() };
var wanstaSelectedPhoto = null;
var wanstaUploadData = null;

async function initWanstaTab() {
  loadWanstaInteractions();
  await loadWanstaData();
  renderWansta();
}

async function loadWanstaData() {
  wanstaPhotos.chirol = [];
  wanstaPhotos.daizu = [];

  var staticChirol = [];
  var staticDaizu = [];

  for (var tag in homeDogImages) {
    for (var i = 0; i < homeDogImages[tag].length; i++) {
      var url = homeDogImages[tag][i];
      staticChirol.push({ id: 'static_chirol_' + url, url: url, tag: tag, isStatic: true });
    }
  }

  for (var tag2 in homeDaizuImages) {
    for (var j = 0; j < homeDaizuImages[tag2].length; j++) {
      var url2 = homeDaizuImages[tag2][j];
      staticDaizu.push({ id: 'static_daizu_' + url2, url: url2, tag: tag2, isStatic: true });
    }
  }

  // 反映関数（初回・SWR更新の両方から使う。毎回作り直すので二重適用しない）
  var applyImages = function(imgData) {
    wanstaPhotos.chirol = [];
    wanstaPhotos.daizu = [];
    var images = (imgData && imgData.images) || [];
    for (var k = 0; k < images.length; k++) {
      var img = images[k];
      if (img.tag === 'wansta-daizu') {
        wanstaPhotos.daizu.push(img);
      } else if (img.tag !== 'diary') {
        wanstaPhotos.chirol.push(img);
      }
    }
    wanstaPhotos.chirol = wanstaPhotos.chirol.concat(staticChirol);
    wanstaPhotos.daizu = wanstaPhotos.daizu.concat(staticDaizu);
  };
  var applyChirolHitokoto = function(data) {
    var dbItems = ((data && data.hitokotoList) || []).filter(function(h) { return h.text && h.text.length > 1; });
    wanstaHitokoto.chirol = dbItems.concat(defaultHitokotoChirol);
  };
  var applyDaizuHitokoto = function(data) {
    var dbItems = ((data && data.hitokotoList) || []).filter(function(h) { return h.text && h.text.length > 1; });
    wanstaHitokoto.daizu = dbItems.concat(defaultHitokotoDaizu);
  };

  // 3本を並列で取得（従来は直列で3往復待っていた）。SWRでキャッシュがあれば即返る。
  var imgUrl = API_BASE_URL + AppConfig.API.CHIROL_IMAGES;
  var chirolUrl = API_BASE_URL + AppConfig.API.CHIROL_HITOKOTO + '?dog=chirol';
  var daizuUrl = API_BASE_URL + AppConfig.API.CHIROL_HITOKOTO + '?dog=daizu';
  await Promise.all([
    swrJson(imgUrl, function(fresh) { applyImages(fresh); renderWansta(); })
      .then(applyImages)
      .catch(function(e) { console.error('Failed to load wansta images:', e); applyImages(null); }),
    swrJson(chirolUrl, function(fresh) { applyChirolHitokoto(fresh); renderWansta(); })
      .then(applyChirolHitokoto)
      .catch(function(e) { console.error('Failed to load chirol hitokoto:', e); }),
    swrJson(daizuUrl, function(fresh) { applyDaizuHitokoto(fresh); renderWansta(); })
      .then(applyDaizuHitokoto)
      .catch(function(e) { console.error('Failed to load daizu hitokoto:', e); })
  ]);
}

function wanstaSwitchAccount(account) {
  wanstaCurrentAccount = account;
  document.getElementById('wanstaChirolBtn').classList.toggle('active', account === 'chirol');
  document.getElementById('wanstaDaizuBtn').classList.toggle('active', account === 'daizu');

  var avatar = document.getElementById('wanstaAvatar');
  var name = document.getElementById('wanstaAccountName');
  if (account === 'chirol') {
    avatar.src = AppConfig.DOG_IMAGES.CHIROL_AVATAR;
    name.textContent = 'チロル';
  } else {
    avatar.src = AppConfig.DOG_IMAGES.DAIZU_AVATAR;
    name.textContent = 'だいず';
  }

  renderWansta();
}

function wanstaSwitchTab(tab) {
  wanstaCurrentTab = tab;
  document.getElementById('wanstaPhotoTab').classList.toggle('active', tab === 'photo');
  document.getElementById('wanstaHitokotoTab').classList.toggle('active', tab === 'hitokoto');
  document.getElementById('wanstaPhotoGrid').style.display = tab === 'photo' ? 'grid' : 'none';
  document.getElementById('wanstaHitokotoList').style.display = tab === 'hitokoto' ? 'block' : 'none';
  renderWansta();
}

function renderWansta() {
  var photos = wanstaPhotos[wanstaCurrentAccount] || [];
  var hitokoto = wanstaHitokoto[wanstaCurrentAccount] || [];

  var staticPhotos = photos.filter(function(p) { return p.isStatic; });
  var apiPhotos = photos.filter(function(p) { return !p.isStatic; })
    .sort(function(a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
  photos = apiPhotos.concat(staticPhotos);

  document.getElementById('wanstaPhotoCount').textContent = photos.length;
  document.getElementById('wanstaHitokotoCount').textContent = hitokoto.length;

  if (wanstaCurrentTab === 'photo') {
    renderWanstaPhotos(photos);
  } else {
    renderWanstaHitokoto(hitokoto);
  }
}

function renderWanstaPhotos(photos) {
  var grid = document.getElementById('wanstaPhotoGrid');
  var html = '';

  for (var i = 0; i < photos.length; i++) {
    var photo = photos[i];
    var isStatic = photo.isStatic ? 'true' : 'false';
    html += '<div class="wansta-photo-item" onclick="wanstaOpenViewer(\'' + photo.id + '\', \'' + photo.url + '\', ' + isStatic + ')">'
      + '<img src="' + photo.url + '" alt="写真" loading="lazy" onerror="this.parentElement.style.display=\'none\'">'
      + '</div>';
  }

  if (photos.length === 0) {
    html += '<div class="wansta-empty" style="grid-column:1/-1">'
      + '<div class="icon"><i class="ph-bold ph-camera"></i></div>'
      + '<div>まだ写真がないよ</div>'
      + '</div>';
  }

  grid.innerHTML = html;
}

function renderWanstaHitokoto(hitokoto) {
  var list = document.getElementById('wanstaHitokotoList');
  var html = '';
  var currentUserId = currentUser ? currentUser.userId : '';

  html += '<div class="wansta-hitokoto-add" onclick="wanstaOpenHitokotoModal()">'
    + '<span class="icon">+</span>'
    + '<span>一言を追加</span>'
    + '</div>';

  var sortedHitokoto = hitokoto.slice().sort(function(a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
  for (var i = 0; i < sortedHitokoto.length; i++) {
    var item = sortedHitokoto[i];
    var itemLikes = item.likes || [];
    var isLiked = itemLikes.indexOf(currentUserId) !== -1;
    var itemComments = item.comments || [];
    var canInteract = !item.isDefault; // デフォルト一言はいいね・コメント・削除不可
    html += '<div class="wansta-hitokoto-item" data-id="' + item.id + '">'
      + '<div class="wansta-hitokoto-text">' + escapeHtml(item.text) + '</div>'
      + '<div class="wansta-hitokoto-actions">'
      + (canInteract ? '<button class="hitokoto-like-btn ' + (isLiked ? 'liked' : '') + '" onclick="wanstaToggleHitokotoLike(\'' + item.id + '\')">' + (isLiked ? '❤️' : '🤍') + ' ' + (itemLikes.length > 0 ? itemLikes.length : '') + '</button>' : '')
      + (canInteract ? '<button class="hitokoto-comment-btn" onclick="wanstaToggleHitokotoComments(\'' + item.id + '\')"><i class="ph-bold ph-chat-circle-text"></i> ' + (itemComments.length > 0 ? itemComments.length : '') + '</button>' : '')
      + (canInteract ? '<button class="wansta-hitokoto-delete" onclick="wanstaDeleteHitokoto(\'' + item.id + '\')">削除</button>' : '')
      + '</div>'
      + (canInteract
        ? '<div class="hitokoto-comments-area" id="hitokotoComments_' + item.id + '" style="display:none">'
          + '<div class="hitokoto-comments-list" id="hitokotoCommentsList_' + item.id + '"></div>'
          + '<div class="hitokoto-comment-input-row">'
          + '<input type="text" class="hitokoto-comment-input" id="hitokotoCommentInput_' + item.id + '" placeholder="コメント..." maxlength="100" onkeypress="if(event.key===\'Enter\')wanstaAddHitokotoComment(\'' + item.id + '\')">'
          + '<button class="hitokoto-comment-submit" onclick="wanstaAddHitokotoComment(\'' + item.id + '\')">送信</button>'
          + '</div>'
          + '</div>'
        : '')
      + '</div>';
  }

  if (hitokoto.length === 0) {
    html += '<div class="wansta-empty"><div class="icon"><i class="ph-bold ph-chat-circle-text"></i></div><div>まだ一言がないよ</div></div>';
  }

  list.innerHTML = html;
}

// ========== FAB・アップロード・一言 CRUD ==========

function wanstaFabClick() {
  if (wanstaCurrentTab === 'photo') {
    wanstaOpenUpload();
  } else {
    wanstaOpenHitokotoModal();
  }
}

function wanstaOpenHitokotoModal() {
  document.getElementById('wanstaHitokotoInput').value = '';
  document.getElementById('wanstaHitokotoModal').classList.add('active');
}

function wanstaOpenUpload() {
  wanstaUploadData = null;
  document.getElementById('wanstaPreviewImg').src = '';
  document.getElementById('wanstaUploadPreview').classList.remove('has-image');
  document.getElementById('wanstaUploadBtn').disabled = true;
  document.getElementById('wanstaUploadModal').classList.add('active');
}

function wanstaCloseUpload() {
  document.getElementById('wanstaUploadModal').classList.remove('active');
}

function wanstaPhotoSelected(event) {
  var file = event.target.files[0];
  if (!file) return;

  var reader = new FileReader();
  reader.onload = function(e) {
    openCropModal(e.target.result, function(croppedData) {
      wanstaUploadData = croppedData;
      document.getElementById('wanstaPreviewImg').src = croppedData;
      document.getElementById('wanstaUploadPreview').classList.add('has-image');
      document.getElementById('wanstaUploadBtn').disabled = false;
    });
  };
  reader.readAsDataURL(file);
}

async function wanstaUploadPhoto() {
  if (!wanstaUploadData) return;

  var btn = document.getElementById('wanstaUploadBtn');
  btn.disabled = true;
  btn.textContent = 'アップロード中...';

  try {
    var tag = wanstaCurrentAccount === 'daizu' ? 'wansta-daizu' : 'normal';

    // 1. プリサインド URL を取得
    var urlRes = await fetch(
      API_BASE_URL + AppConfig.API.CHIROL_UPLOAD_URL + '?tag=' + tag + '&contentType=' + encodeURIComponent('image/jpeg')
    );
    if (!urlRes.ok) throw new Error('アップロード URL の取得に失敗しました');
    var urlData = await urlRes.json();

    // 2. base64 → Blob に変換して S3 へ直接 PUT
    var blob = dataUrlToBlob(wanstaUploadData);
    var uploadRes = await fetch(urlData.uploadUrl, {
      method: 'PUT',
      body: blob,
      headers: { 'Content-Type': 'image/jpeg' }
    });
    if (!uploadRes.ok) throw new Error('S3 へのアップロードに失敗しました');

    // 3. メタデータを保存
    var saveRes = await fetch(API_BASE_URL + AppConfig.API.CHIROL_IMAGES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ s3Key: urlData.s3Key, tag: tag })
    });
    if (!saveRes.ok) throw new Error('メタデータの保存に失敗しました');

    wanstaPhotos[wanstaCurrentAccount].unshift({
      id: urlData.imageId,
      url: urlData.imageUrl,
      tag: tag,
      createdAt: new Date().toISOString()
    });
    wanstaCloseUpload();
    renderWansta();
    showToast('写真をアップロードしました');
  } catch (e) {
    console.error('Upload error:', e);
    alert('アップロードに失敗しました: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'アップロード';
  }
}

// dataUrlToBlob は core/utils.js に移動

function wanstaCloseHitokotoModal() {
  document.getElementById('wanstaHitokotoModal').classList.remove('active');
}

async function wanstaSubmitHitokoto() {
  var text = document.getElementById('wanstaHitokotoInput').value.trim();
  if (!text) return;

  var btn = document.getElementById('wanstaHitokotoSubmitBtn');
  btn.disabled = true;
  btn.textContent = '追加中...';

  try {
    var res = await fetch(API_BASE_URL + AppConfig.API.CHIROL_HITOKOTO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, dog: wanstaCurrentAccount })
    });

    if (res.ok) {
      var data = await res.json();
      wanstaHitokoto[wanstaCurrentAccount].unshift({
        id: data.hitokotoId,
        text: text,
        createdAt: new Date().toISOString()
      });
      wanstaCloseHitokotoModal();
      renderWansta();
    } else {
      alert('追加に失敗しました');
    }
  } catch (e) {
    console.error('Hitokoto error:', e);
    alert('追加に失敗しました');
  } finally {
    btn.disabled = false;
    btn.textContent = '追加する';
  }
}

async function wanstaDeleteHitokoto(hitokotoId) {
  if (!confirm('この一言を削除しますか？')) return;

  try {
    var res = await fetch(API_BASE_URL + AppConfig.API.CHIROL_HITOKOTO, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hitokotoId: hitokotoId, dog: wanstaCurrentAccount })
    });

    if (res.ok) {
      wanstaHitokoto[wanstaCurrentAccount] = wanstaHitokoto[wanstaCurrentAccount].filter(function(h) { return h.id !== hitokotoId; });
      renderWansta();
    } else {
      alert('削除に失敗しました');
    }
  } catch (e) {
    console.error('Hitokoto delete error:', e);
    alert('削除に失敗しました');
  }
}
