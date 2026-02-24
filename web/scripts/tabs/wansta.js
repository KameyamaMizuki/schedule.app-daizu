// ========== ワンスタタブ ==========
let wanstaCurrentAccount = 'chirol'; // 'chirol' or 'daizu'
let wanstaCurrentTab = 'photo'; // 'photo' or 'hitokoto'
let wanstaPhotos = { chirol: [], daizu: [] };
// デフォルト一言（ホーム画面と統一）
const defaultHitokotoChirol = AppConfig.CHIROL_HITOKOTO_TEXTS.map((text, i) => ({ id: `default_${i + 1}`, text, isDefault: true }));
const defaultHitokotoDaizu  = AppConfig.DAIZU_HITOKOTO_TEXTS.map((text, i)  => ({ id: `default_d${i + 1}`, text, isDefault: true }));
let wanstaHitokoto = { chirol: [...defaultHitokotoChirol], daizu: [...defaultHitokotoDaizu] };
let wanstaSelectedPhoto = null;
let wanstaUploadData = null;
let wanstaLikes = {}; // { photoId: [userId, ...] }
let wanstaComments = {}; // { photoId: [{id, userId, userName, text, createdAt}, ...] }

// LocalStorageからいいね・コメントを読み込み
function loadWanstaInteractions() {
  try {
    wanstaLikes = JSON.parse(localStorage.getItem(AppConfig.STORAGE.WANSTA_LIKES) || '{}');
    wanstaComments = JSON.parse(localStorage.getItem(AppConfig.STORAGE.WANSTA_COMMENTS) || '{}');
  } catch (e) {
    wanstaLikes = {};
    wanstaComments = {};
  }
}
function saveWanstaInteractions() {
  localStorage.setItem(AppConfig.STORAGE.WANSTA_LIKES, JSON.stringify(wanstaLikes));
  localStorage.setItem(AppConfig.STORAGE.WANSTA_COMMENTS, JSON.stringify(wanstaComments));
}

async function initWanstaTab() {
  loadWanstaInteractions();
  await loadWanstaData();
  renderWansta();
}

async function loadWanstaData() {
  // 初期化
  wanstaPhotos.chirol = [];
  wanstaPhotos.daizu = [];

  // 静的画像リスト（後で追加用）
  const staticChirol = [];
  const staticDaizu = [];

  // チロルの静的画像
  for (const [tag, images] of Object.entries(homeDogImages)) {
    for (const url of images) {
      staticChirol.push({ id: `static_chirol_${url}`, url, tag, isStatic: true });
    }
  }

  // だいずの静的画像
  for (const [tag, images] of Object.entries(homeDaizuImages)) {
    for (const url of images) {
      staticDaizu.push({ id: `static_daizu_${url}`, url, tag, isStatic: true });
    }
  }

  // 画像読み込み（失敗しても一言には影響しない）
  try {
    const imgRes = await fetch(`${API_BASE_URL}${AppConfig.API.CHIROL_IMAGES}`);
    if (imgRes.ok) {
      const imgData = await imgRes.json();
      for (const img of (imgData.images || [])) {
        if (img.tag === 'wansta-daizu') {
          wanstaPhotos.daizu.push(img);
        } else if (img.tag !== 'diary') {
          wanstaPhotos.chirol.push(img);
        }
      }
    }
  } catch (e) {
    console.error('Failed to load wansta images:', e);
  }
  // 静的画像は後ろに追加
  wanstaPhotos.chirol.push(...staticChirol);
  wanstaPhotos.daizu.push(...staticDaizu);

  // 一言読み込み（cache:'no-store'で常に最新を取得）
  try {
    const hitokotoChirolRes = await fetch(`${API_BASE_URL}${AppConfig.API.CHIROL_HITOKOTO}?dog=chirol`, { cache: 'no-store' });
    if (hitokotoChirolRes.ok) {
      const hitokotoData = await hitokotoChirolRes.json();
      const dbItems = (hitokotoData.hitokotoList || []).filter(h => h.text && h.text.length > 1);
      wanstaHitokoto.chirol = [...dbItems, ...defaultHitokotoChirol];
    }
  } catch (e) {
    console.error('Failed to load chirol hitokoto:', e);
  }
  try {
    const hitokotoDaizuRes = await fetch(`${API_BASE_URL}${AppConfig.API.CHIROL_HITOKOTO}?dog=daizu`, { cache: 'no-store' });
    if (hitokotoDaizuRes.ok) {
      const hitokotoData = await hitokotoDaizuRes.json();
      const dbItems = (hitokotoData.hitokotoList || []).filter(h => h.text && h.text.length > 1);
      wanstaHitokoto.daizu = [...dbItems, ...defaultHitokotoDaizu];
    }
  } catch (e) {
    console.error('Failed to load daizu hitokoto:', e);
  }
  // APIが失敗しても静的画像は必ず表示される
  if (wanstaPhotos.chirol.length === 0) {
    wanstaPhotos.chirol = staticChirol;
  }
  if (wanstaPhotos.daizu.length === 0) {
    wanstaPhotos.daizu = staticDaizu;
  }
}

function wanstaSwitchAccount(account) {
  wanstaCurrentAccount = account;
  document.getElementById('wanstaChirolBtn').classList.toggle('active', account === 'chirol');
  document.getElementById('wanstaDaizuBtn').classList.toggle('active', account === 'daizu');

  // アバターとアカウント名を更新
  const avatar = document.getElementById('wanstaAvatar');
  const name = document.getElementById('wanstaAccountName');
  if (account === 'chirol') {
    avatar.src = 'images/dog/chirol/normal/IMG_3707.webp';
    name.textContent = 'チロル';
  } else {
    avatar.src = 'images/dog/daizu/normal/IMG_0734.jpg';
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
  let photos = wanstaPhotos[wanstaCurrentAccount] || [];
  const hitokoto = wanstaHitokoto[wanstaCurrentAccount] || [];

  // 写真を新しい順にソート（静的画像を先に、APIから取得した画像を後ろに）
  // APIからの画像はcreatedAtでソート
  const staticPhotos = photos.filter(p => p.isStatic);
  const apiPhotos = photos.filter(p => !p.isStatic)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  photos = [...apiPhotos, ...staticPhotos]; // 新しいAPIアップロード画像を先に

  // 統計を更新
  document.getElementById('wanstaPhotoCount').textContent = photos.length;
  document.getElementById('wanstaHitokotoCount').textContent = hitokoto.length;

  if (wanstaCurrentTab === 'photo') {
    renderWanstaPhotos(photos);
  } else {
    renderWanstaHitokoto(hitokoto);
  }
}

function renderWanstaPhotos(photos) {
  const grid = document.getElementById('wanstaPhotoGrid');
  let html = '';

  // 写真
  for (const photo of photos) {
    const isStatic = photo.isStatic ? 'true' : 'false';
    html += `<div class="wansta-photo-item" onclick="wanstaOpenViewer('${photo.id}', '${photo.url}', ${isStatic})">
      <img src="${photo.url}" alt="写真" loading="lazy" onerror="this.parentElement.style.display='none'">
    </div>`;
  }

  if (photos.length === 0) {
    html += `<div class="wansta-empty" style="grid-column:1/-1">
      <div class="icon">📷</div>
      <div>まだ写真がないよ</div>
    </div>`;
  }

  grid.innerHTML = html;
}

function renderWanstaHitokoto(hitokoto) {
  const list = document.getElementById('wanstaHitokotoList');
  let html = '';

  // 追加ボタン
  html += `<div class="wansta-hitokoto-add" onclick="wanstaOpenHitokotoModal()">
    <span class="icon">+</span>
    <span>一言を追加</span>
  </div>`;

  const currentUserId = currentUser ? currentUser.userId : '';

  // 一言リスト（新しい順に表示）
  const sortedHitokoto = [...hitokoto].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  for (const item of sortedHitokoto) {
    const itemLikes = wanstaLikes[`h_${item.id}`] || [];
    const isLiked = itemLikes.includes(currentUserId);
    const itemComments = wanstaComments[`h_${item.id}`] || [];
    html += `<div class="wansta-hitokoto-item" data-id="${item.id}">
      <div class="wansta-hitokoto-text">${escapeHtml(item.text)}</div>
      <div class="wansta-hitokoto-actions">
        <button class="hitokoto-like-btn ${isLiked ? 'liked' : ''}" onclick="wanstaToggleHitokotoLike('${item.id}')">${isLiked ? '❤️' : '🤍'} ${itemLikes.length > 0 ? itemLikes.length : ''}</button>
        <button class="hitokoto-comment-btn" onclick="wanstaToggleHitokotoComments('${item.id}')">💬 ${itemComments.length > 0 ? itemComments.length : ''}</button>
        <button class="wansta-hitokoto-delete" onclick="wanstaDeleteHitokoto('${item.id}')">削除</button>
      </div>
      <div class="hitokoto-comments-area" id="hitokotoComments_${item.id}" style="display:none">
        <div class="hitokoto-comments-list" id="hitokotoCommentsList_${item.id}"></div>
        <div class="hitokoto-comment-input-row">
          <input type="text" class="hitokoto-comment-input" id="hitokotoCommentInput_${item.id}" placeholder="コメント..." maxlength="100" onkeypress="if(event.key==='Enter')wanstaAddHitokotoComment('${item.id}')">
          <button class="hitokoto-comment-submit" onclick="wanstaAddHitokotoComment('${item.id}')">送信</button>
        </div>
      </div>
    </div>`;
  }

  if (hitokoto.length === 0) {
    html += `<div class="wansta-empty">
      <div class="icon">💬</div>
      <div>まだ一言がないよ</div>
    </div>`;
  }

  list.innerHTML = html;
}

function wanstaToggleHitokotoLike(hitokotoId) {
  if (!currentUser) return;
  const key = `h_${hitokotoId}`;
  const userId = currentUser.userId;
  if (!wanstaLikes[key]) wanstaLikes[key] = [];
  const idx = wanstaLikes[key].indexOf(userId);
  if (idx === -1) { wanstaLikes[key].push(userId); } else { wanstaLikes[key].splice(idx, 1); }
  saveWanstaInteractions();
  renderWansta();
}

function wanstaToggleHitokotoComments(hitokotoId) {
  const area = document.getElementById(`hitokotoComments_${hitokotoId}`);
  if (!area) return;
  const isHidden = area.style.display === 'none';
  area.style.display = isHidden ? 'block' : 'none';
  if (isHidden) wanstaRenderHitokotoComments(hitokotoId);
}

function wanstaRenderHitokotoComments(hitokotoId) {
  const key = `h_${hitokotoId}`;
  const comments = wanstaComments[key] || [];
  const container = document.getElementById(`hitokotoCommentsList_${hitokotoId}`);
  if (!container) return;
  const currentUserId = currentUser ? currentUser.userId : '';
  if (comments.length === 0) {
    container.innerHTML = '<div style="font-size:12px;color:#8e8e8e;padding:4px 0">コメントはまだないよ</div>';
    return;
  }
  let html = '';
  for (const c of comments) {
    const hcMember = familyMembers.find(m => m.userId === c.userId);
    const hcName = hcMember ? getDisplayName(hcMember) : c.userName;
    const canDelete = c.userId === currentUserId;
    html += `<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:6px">
      <div style="flex:1"><span style="font-weight:600;font-size:12px;color:#262626">${escapeHtml(hcName)}</span> <span style="font-size:12px;color:#444">${escapeHtml(c.text)}</span></div>
      ${canDelete ? `<button style="background:none;border:none;color:#e74c3c;font-size:10px;cursor:pointer;padding:0" onclick="wanstaDeleteHitokotoComment('${hitokotoId}','${c.id}')">✕</button>` : ''}
    </div>`;
  }
  container.innerHTML = html;
}

function wanstaAddHitokotoComment(hitokotoId) {
  if (!currentUser) return;
  const input = document.getElementById(`hitokotoCommentInput_${hitokotoId}`);
  const text = input ? input.value.trim() : '';
  if (!text) return;
  const key = `h_${hitokotoId}`;
  if (!wanstaComments[key]) wanstaComments[key] = [];
  wanstaComments[key].push({
    id: `c_${Date.now()}`,
    userId: currentUser.userId,
    userName: getDisplayName(currentUser),
    text: text,
    createdAt: new Date().toISOString()
  });
  saveWanstaInteractions();
  if (input) input.value = '';
  wanstaRenderHitokotoComments(hitokotoId);
  renderWansta();
}

function wanstaDeleteHitokotoComment(hitokotoId, commentId) {
  const key = `h_${hitokotoId}`;
  if (!wanstaComments[key]) return;
  wanstaComments[key] = wanstaComments[key].filter(c => c.id !== commentId);
  saveWanstaInteractions();
  wanstaRenderHitokotoComments(hitokotoId);
  renderWansta();
}


function wanstaOpenViewer(id, url, isStatic = false) {
  wanstaSelectedPhoto = { id, url, isStatic };
  document.getElementById('wanstaViewerImg').src = url;
  // 静的画像は削除不可
  document.getElementById('wanstaDeleteBtn').style.display = isStatic ? 'none' : 'inline';

  // アカウント情報を設定
  const isChirol = wanstaCurrentAccount === 'chirol';
  document.getElementById('wanstaViewerAvatar').src = isChirol
    ? 'images/dog/chirol/normal/IMG_3707.webp'
    : 'images/dog/daizu/normal/IMG_0734.jpg';
  document.getElementById('wanstaViewerName').textContent = isChirol ? 'チロル' : 'だいず';

  // いいね状態を更新
  wanstaUpdateLikeUI();
  // コメントを表示
  wanstaRenderComments();

  document.getElementById('wanstaCommentInput').value = '';
  document.getElementById('wanstaPhotoViewer').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function wanstaCloseViewer() {
  wanstaSelectedPhoto = null;
  document.getElementById('wanstaPhotoViewer').classList.remove('active');
  document.body.style.overflow = '';
}

function wanstaToggleLike() {
  if (!wanstaSelectedPhoto || !currentUser) return;
  const photoId = wanstaSelectedPhoto.id;
  const userId = currentUser.userId;

  if (!wanstaLikes[photoId]) wanstaLikes[photoId] = [];

  const idx = wanstaLikes[photoId].indexOf(userId);
  if (idx === -1) {
    wanstaLikes[photoId].push(userId);
  } else {
    wanstaLikes[photoId].splice(idx, 1);
  }

  saveWanstaInteractions();
  wanstaUpdateLikeUI();
}

function wanstaUpdateLikeUI() {
  if (!wanstaSelectedPhoto) return;
  const photoId = wanstaSelectedPhoto.id;
  const userId = currentUser ? currentUser.userId : '';
  const likes = wanstaLikes[photoId] || [];
  const isLiked = likes.includes(userId);

  const btn = document.getElementById('wanstaLikeBtn');
  btn.textContent = isLiked ? '❤️' : '🤍';
  btn.classList.toggle('liked', isLiked);

  const countEl = document.getElementById('wanstaLikesCount');
  if (likes.length === 0) {
    countEl.textContent = '';
    countEl.style.display = 'none';
  } else {
    countEl.textContent = `いいね ${likes.length}件`;
    countEl.style.display = 'block';
  }
}

function wanstaAddComment() {
  if (!wanstaSelectedPhoto || !currentUser) return;
  const input = document.getElementById('wanstaCommentInput');
  const text = input.value.trim();
  if (!text) return;

  const photoId = wanstaSelectedPhoto.id;
  if (!wanstaComments[photoId]) wanstaComments[photoId] = [];

  const comment = {
    id: `c_${Date.now()}`,
    userId: currentUser.userId,
    userName: getDisplayName(currentUser),
    text: text,
    createdAt: new Date().toISOString()
  };

  wanstaComments[photoId].push(comment);
  saveWanstaInteractions();

  input.value = '';
  wanstaRenderComments();
}

function wanstaDeleteComment(commentId) {
  if (!wanstaSelectedPhoto) return;
  const photoId = wanstaSelectedPhoto.id;
  if (!wanstaComments[photoId]) return;

  wanstaComments[photoId] = wanstaComments[photoId].filter(c => c.id !== commentId);
  saveWanstaInteractions();
  wanstaRenderComments();
}

function wanstaRenderComments() {
  if (!wanstaSelectedPhoto) return;
  const photoId = wanstaSelectedPhoto.id;
  const comments = wanstaComments[photoId] || [];
  const container = document.getElementById('wanstaCommentsList');
  const currentUserId = currentUser ? currentUser.userId : '';

  if (comments.length === 0) {
    container.innerHTML = '<div class="wansta-no-comments">コメントはまだありません</div>';
    return;
  }

  let html = '';
  for (const c of comments) {
    const cMember = familyMembers.find(m => m.userId === c.userId);
    const cPhoto = cMember ? getAvatarPhoto(cMember.displayName) : null;
    const cEmoji = cMember ? getAvatarEmoji(cMember.displayName) : getAvatarEmoji(c.userName);
    const avatarHtml = cPhoto
      ? `<img src="${cPhoto}" style="width:32px;height:32px;border-radius:50%;object-fit:cover">`
      : cEmoji;
    const cName = cMember ? getDisplayName(cMember) : c.userName;
    const time = formatRelativeTime(new Date(c.createdAt));
    const canDelete = c.userId === currentUserId;

    html += `<div class="wansta-comment-item">
      <div class="wansta-comment-avatar">${avatarHtml}</div>
      <div class="wansta-comment-body">
        <span class="wansta-comment-author">${escapeHtml(cName)}</span>
        <span class="wansta-comment-text">${escapeHtml(c.text)}</span>
        <div class="wansta-comment-meta">
          <span class="wansta-comment-time">${time}</span>
          ${canDelete ? `<button class="wansta-comment-delete" onclick="wanstaDeleteComment('${c.id}')">削除</button>` : ''}
        </div>
      </div>
    </div>`;
  }
  container.innerHTML = html;
}

async function wanstaDeletePhoto() {
  if (!wanstaSelectedPhoto) return;
  if (!confirm('この写真を削除しますか？')) return;

  // 静的画像の場合はローカルリストから削除のみ（実際のファイルは削除されない）
  if (wanstaSelectedPhoto.isStatic) {
    wanstaPhotos[wanstaCurrentAccount] = wanstaPhotos[wanstaCurrentAccount].filter(p => p.id !== wanstaSelectedPhoto.id);
    wanstaCloseViewer();
    renderWansta();
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}${AppConfig.API.CHIROL_IMAGES}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId: wanstaSelectedPhoto.id })
    });

    if (res.ok) {
      // ローカルリストから削除
      wanstaPhotos[wanstaCurrentAccount] = wanstaPhotos[wanstaCurrentAccount].filter(p => p.id !== wanstaSelectedPhoto.id);
      wanstaCloseViewer();
      renderWansta();
    } else {
      alert('削除に失敗しました');
    }
  } catch (e) {
    console.error('Delete error:', e);
    alert('削除に失敗しました');
  }
}

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
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
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

  const btn = document.getElementById('wanstaUploadBtn');
  btn.disabled = true;
  btn.textContent = 'アップロード中...';

  try {
    // ダイズの場合はwansta-daizuタグ、チロルの場合はnormalタグ
    const tag = wanstaCurrentAccount === 'daizu' ? 'wansta-daizu' : 'normal';

    const res = await fetch(`${API_BASE_URL}${AppConfig.API.CHIROL_IMAGES}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageData: wanstaUploadData,
        tag: tag
      })
    });

    if (res.ok) {
      const data = await res.json();
      // ローカルリストに追加
      wanstaPhotos[wanstaCurrentAccount].unshift({
        id: data.imageId,
        url: data.imageUrl,
        tag: tag,
        createdAt: new Date().toISOString()
      });
      wanstaCloseUpload();
      renderWansta();
    } else {
      alert('アップロードに失敗しました');
    }
  } catch (e) {
    console.error('Upload error:', e);
    alert('アップロードに失敗しました');
  } finally {
    btn.disabled = false;
    btn.textContent = 'アップロード';
  }
}

function wanstaCloseHitokotoModal() {
  document.getElementById('wanstaHitokotoModal').classList.remove('active');
}

async function wanstaSubmitHitokoto() {
  const text = document.getElementById('wanstaHitokotoInput').value.trim();
  if (!text) return;

  const btn = document.getElementById('wanstaHitokotoSubmitBtn');
  btn.disabled = true;
  btn.textContent = '追加中...';

  try {
    const res = await fetch(`${API_BASE_URL}${AppConfig.API.CHIROL_HITOKOTO}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, dog: wanstaCurrentAccount })
    });

    if (res.ok) {
      const data = await res.json();
      // ローカルリストに追加
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
    const res = await fetch(`${API_BASE_URL}${AppConfig.API.CHIROL_HITOKOTO}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hitokotoId, dog: wanstaCurrentAccount })
    });

    if (res.ok) {
      // ローカルリストから削除
      wanstaHitokoto[wanstaCurrentAccount] = wanstaHitokoto[wanstaCurrentAccount].filter(h => h.id !== hitokotoId);
      renderWansta();
    } else {
      alert('削除に失敗しました');
    }
  } catch (e) {
    console.error('Hitokoto delete error:', e);
    alert('削除に失敗しました');
  }
}
