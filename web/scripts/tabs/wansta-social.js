// ========== ワンスタ — ソーシャル機能（ビューア・いいね・コメント） ==========
// 依存: wansta.js (wanstaSelectedPhoto, wanstaCurrentAccount, wanstaPhotos, wanstaLikes, wanstaComments, renderWansta)

var wanstaLikes = {}; // { photoId: [userId, ...] }
var wanstaComments = {}; // { photoId: [{id, userId, userName, text, createdAt}, ...] }

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

// ========== 写真ビューア ==========

function wanstaOpenViewer(id, url, isStatic) {
  if (isStatic === undefined) isStatic = false;
  wanstaSelectedPhoto = { id: id, url: url, isStatic: isStatic };
  document.getElementById('wanstaViewerImg').src = url;
  document.getElementById('wanstaDeleteBtn').style.display = isStatic ? 'none' : 'inline';

  var isChirol = wanstaCurrentAccount === 'chirol';
  document.getElementById('wanstaViewerAvatar').src = isChirol
    ? AppConfig.DOG_IMAGES.CHIROL_AVATAR
    : AppConfig.DOG_IMAGES.DAIZU_AVATAR;
  document.getElementById('wanstaViewerName').textContent = isChirol ? 'チロル' : 'だいず';

  wanstaUpdateLikeUI();
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

// ========== 写真いいね ==========

function wanstaToggleLike() {
  if (!wanstaSelectedPhoto || !currentUser) return;
  var photoId = wanstaSelectedPhoto.id;
  var userId = currentUser.userId;

  if (!wanstaLikes[photoId]) wanstaLikes[photoId] = [];

  var idx = wanstaLikes[photoId].indexOf(userId);
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
  var photoId = wanstaSelectedPhoto.id;
  var userId = currentUser ? currentUser.userId : '';
  var likes = wanstaLikes[photoId] || [];
  var isLiked = likes.indexOf(userId) !== -1;

  var btn = document.getElementById('wanstaLikeBtn');
  btn.textContent = isLiked ? '❤️' : '🤍';
  btn.classList.toggle('liked', isLiked);

  var countEl = document.getElementById('wanstaLikesCount');
  if (likes.length === 0) {
    countEl.textContent = '';
    countEl.style.display = 'none';
  } else {
    countEl.textContent = 'いいね ' + likes.length + '件';
    countEl.style.display = 'block';
  }
}

// ========== 写真コメント ==========

function wanstaAddComment() {
  if (!wanstaSelectedPhoto || !currentUser) return;
  var input = document.getElementById('wanstaCommentInput');
  var text = input.value.trim();
  if (!text) return;

  var photoId = wanstaSelectedPhoto.id;
  if (!wanstaComments[photoId]) wanstaComments[photoId] = [];

  wanstaComments[photoId].push({
    id: 'c_' + Date.now(),
    userId: currentUser.userId,
    userName: getDisplayName(currentUser),
    text: text,
    createdAt: new Date().toISOString()
  });

  saveWanstaInteractions();
  input.value = '';
  wanstaRenderComments();
}

function wanstaDeleteComment(commentId) {
  if (!wanstaSelectedPhoto) return;
  var photoId = wanstaSelectedPhoto.id;
  if (!wanstaComments[photoId]) return;

  wanstaComments[photoId] = wanstaComments[photoId].filter(function(c) { return c.id !== commentId; });
  saveWanstaInteractions();
  wanstaRenderComments();
}

function wanstaRenderComments() {
  if (!wanstaSelectedPhoto) return;
  var photoId = wanstaSelectedPhoto.id;
  var comments = wanstaComments[photoId] || [];
  var container = document.getElementById('wanstaCommentsList');
  var currentUserId = currentUser ? currentUser.userId : '';

  if (comments.length === 0) {
    container.innerHTML = '<div class="wansta-no-comments">コメントはまだありません</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < comments.length; i++) {
    var c = comments[i];
    var cMember = familyMembers.find(function(m) { return m.userId === c.userId; });
    var cPhoto = cMember ? getAvatarPhoto(cMember.displayName) : null;
    var cEmoji = cMember ? getAvatarEmoji(cMember.displayName) : getAvatarEmoji(c.userName);
    var avatarHtml = cPhoto
      ? '<img src="' + cPhoto + '" style="width:32px;height:32px;border-radius:50%;object-fit:cover">'
      : cEmoji;
    var cName = cMember ? getDisplayName(cMember) : c.userName;
    var time = formatRelativeTime(new Date(c.createdAt));
    var canDelete = c.userId === currentUserId;

    html += '<div class="wansta-comment-item">'
      + '<div class="wansta-comment-avatar">' + avatarHtml + '</div>'
      + '<div class="wansta-comment-body">'
      + '<span class="wansta-comment-author">' + escapeHtml(cName) + '</span>'
      + '<span class="wansta-comment-text">' + escapeHtml(c.text) + '</span>'
      + '<div class="wansta-comment-meta">'
      + '<span class="wansta-comment-time">' + time + '</span>'
      + (canDelete ? '<button class="wansta-comment-delete" onclick="wanstaDeleteComment(\'' + c.id + '\')">削除</button>' : '')
      + '</div>'
      + '</div>'
      + '</div>';
  }
  container.innerHTML = html;
}

// ========== 写真削除 ==========

async function wanstaDeletePhoto() {
  if (!wanstaSelectedPhoto) return;
  if (!confirm('この写真を削除しますか？')) return;

  if (wanstaSelectedPhoto.isStatic) {
    wanstaPhotos[wanstaCurrentAccount] = wanstaPhotos[wanstaCurrentAccount].filter(function(p) { return p.id !== wanstaSelectedPhoto.id; });
    wanstaCloseViewer();
    renderWansta();
    return;
  }

  try {
    var res = await fetch(API_BASE_URL + AppConfig.API.CHIROL_IMAGES, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId: wanstaSelectedPhoto.id })
    });

    if (res.ok) {
      wanstaPhotos[wanstaCurrentAccount] = wanstaPhotos[wanstaCurrentAccount].filter(function(p) { return p.id !== wanstaSelectedPhoto.id; });
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

// ========== 一言いいね・コメント ==========

function wanstaToggleHitokotoLike(hitokotoId) {
  if (!currentUser) return;
  var key = 'h_' + hitokotoId;
  var userId = currentUser.userId;
  if (!wanstaLikes[key]) wanstaLikes[key] = [];
  var idx = wanstaLikes[key].indexOf(userId);
  if (idx === -1) { wanstaLikes[key].push(userId); } else { wanstaLikes[key].splice(idx, 1); }
  saveWanstaInteractions();
  renderWansta();
}

function wanstaToggleHitokotoComments(hitokotoId) {
  var area = document.getElementById('hitokotoComments_' + hitokotoId);
  if (!area) return;
  var isHidden = area.style.display === 'none';
  area.style.display = isHidden ? 'block' : 'none';
  if (isHidden) wanstaRenderHitokotoComments(hitokotoId);
}

function wanstaRenderHitokotoComments(hitokotoId) {
  var key = 'h_' + hitokotoId;
  var comments = wanstaComments[key] || [];
  var container = document.getElementById('hitokotoCommentsList_' + hitokotoId);
  if (!container) return;
  var currentUserId = currentUser ? currentUser.userId : '';
  if (comments.length === 0) {
    container.innerHTML = '<div style="font-size:12px;color:#8e8e8e;padding:4px 0">コメントはまだないよ</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < comments.length; i++) {
    var c = comments[i];
    var hcMember = familyMembers.find(function(m) { return m.userId === c.userId; });
    var hcName = hcMember ? getDisplayName(hcMember) : c.userName;
    var canDelete = c.userId === currentUserId;
    html += '<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:6px">'
      + '<div style="flex:1"><span style="font-weight:600;font-size:12px;color:#262626">' + escapeHtml(hcName) + '</span> <span style="font-size:12px;color:#444">' + escapeHtml(c.text) + '</span></div>'
      + (canDelete ? '<button style="background:none;border:none;color:#e74c3c;font-size:10px;cursor:pointer;padding:0" onclick="wanstaDeleteHitokotoComment(\'' + hitokotoId + '\',\'' + c.id + '\')">✕</button>' : '')
      + '</div>';
  }
  container.innerHTML = html;
}

function wanstaAddHitokotoComment(hitokotoId) {
  if (!currentUser) return;
  var input = document.getElementById('hitokotoCommentInput_' + hitokotoId);
  var text = input ? input.value.trim() : '';
  if (!text) return;
  var key = 'h_' + hitokotoId;
  if (!wanstaComments[key]) wanstaComments[key] = [];
  wanstaComments[key].push({
    id: 'c_' + Date.now(),
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
  var key = 'h_' + hitokotoId;
  if (!wanstaComments[key]) return;
  wanstaComments[key] = wanstaComments[key].filter(function(c) { return c.id !== commentId; });
  saveWanstaInteractions();
  wanstaRenderHitokotoComments(hitokotoId);
  renderWansta();
}
