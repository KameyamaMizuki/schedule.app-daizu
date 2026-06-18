// ========== ワンスタ — ソーシャル機能（ビューア・いいね・コメント） ==========
// 依存: wansta.js (wanstaSelectedPhoto, wanstaCurrentAccount, wanstaPhotos, wanstaHitokoto, renderWansta)
// Phase 2: localStorage → DynamoDB 移行済み。likes/comments は各オブジェクトに直接保持。

function loadWanstaInteractions() {
  // DynamoDB移行後は不要。wansta.js から呼ばれるため互換性のため空関数として残す。
}

// ========== 写真ビューア ==========

function wanstaOpenViewer(id, url, isStatic) {
  if (isStatic === undefined) isStatic = false;
  // 実際の写真オブジェクト（likes/comments付き）を配列から取得
  var photos = wanstaPhotos[wanstaCurrentAccount] || [];
  var photo = null;
  for (var i = 0; i < photos.length; i++) {
    if (photos[i].id === id) { photo = photos[i]; break; }
  }
  wanstaSelectedPhoto = photo || { id: id, url: url, isStatic: isStatic, likes: [], comments: [] };

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

async function wanstaToggleLike() {
  if (!wanstaSelectedPhoto || !currentUser) return;
  if (wanstaSelectedPhoto.isStatic) return; // 静的写真はいいね不可

  var photoId = wanstaSelectedPhoto.id;
  var userId = currentUser.userId;

  // 楽観的更新
  var likes = wanstaSelectedPhoto.likes ? wanstaSelectedPhoto.likes.slice() : [];
  var idx = likes.indexOf(userId);
  if (idx === -1) { likes.push(userId); } else { likes.splice(idx, 1); }
  wanstaSelectedPhoto.likes = likes;
  wanstaUpdateLikeUI();

  // API 呼び出し
  try {
    var res = await fetch(API_BASE_URL + AppConfig.API.CHIROL_IMAGES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'like', imageId: photoId, userId: userId })
    });
    if (res.ok) {
      var data = await res.json();
      wanstaSelectedPhoto.likes = data.likes || likes;
      wanstaUpdateLikeUI();
    }
  } catch (e) {
    console.error('Like error:', e);
  }
}

function wanstaUpdateLikeUI() {
  if (!wanstaSelectedPhoto) return;
  var userId = currentUser ? currentUser.userId : '';
  var likes = wanstaSelectedPhoto.likes || [];
  var isLiked = likes.indexOf(userId) !== -1;

  var btn = document.getElementById('wanstaLikeBtn');
  if (btn) {
    btn.textContent = isLiked ? '❤️' : '🤍';
    btn.classList.toggle('liked', isLiked);
  }

  var countEl = document.getElementById('wanstaLikesCount');
  if (countEl) {
    if (likes.length === 0) {
      countEl.textContent = '';
      countEl.style.display = 'none';
    } else {
      countEl.textContent = 'いいね ' + likes.length + '件';
      countEl.style.display = 'block';
    }
  }
}

// ========== 写真コメント ==========

async function wanstaAddComment() {
  if (!wanstaSelectedPhoto || !currentUser) return;
  if (wanstaSelectedPhoto.isStatic) return; // 静的写真はコメント不可
  var input = document.getElementById('wanstaCommentInput');
  var text = input.value.trim();
  if (!text) return;

  var photoId = wanstaSelectedPhoto.id;

  // 楽観的追加
  var tmpId = 'c_' + Date.now() + '_tmp';
  var comment = {
    id: tmpId,
    userId: currentUser.userId,
    userName: getDisplayName(currentUser),
    text: text,
    createdAt: new Date().toISOString()
  };
  if (!wanstaSelectedPhoto.comments) wanstaSelectedPhoto.comments = [];
  wanstaSelectedPhoto.comments.push(comment);
  input.value = '';
  wanstaRenderComments();

  // API 呼び出し
  try {
    var res = await fetch(API_BASE_URL + AppConfig.API.CHIROL_IMAGES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'addComment',
        imageId: photoId,
        userId: currentUser.userId,
        userName: getDisplayName(currentUser),
        text: text
      })
    });
    if (res.ok) {
      var data = await res.json();
      // 仮IDを正式IDで置換
      for (var i = 0; i < wanstaSelectedPhoto.comments.length; i++) {
        if (wanstaSelectedPhoto.comments[i].id === tmpId && data.comment) {
          wanstaSelectedPhoto.comments[i] = data.comment;
          break;
        }
      }
      wanstaRenderComments();
    }
  } catch (e) {
    console.error('Comment error:', e);
  }
}

async function wanstaDeleteComment(commentId) {
  if (!wanstaSelectedPhoto) return;
  if (wanstaSelectedPhoto.isStatic) return;
  var photoId = wanstaSelectedPhoto.id;

  // 楽観的削除
  wanstaSelectedPhoto.comments = (wanstaSelectedPhoto.comments || []).filter(function(c) { return c.id !== commentId; });
  wanstaRenderComments();

  // API 呼び出し
  try {
    await fetch(API_BASE_URL + AppConfig.API.CHIROL_IMAGES, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId: photoId, commentId: commentId })
    });
  } catch (e) {
    console.error('Delete comment error:', e);
  }
}

function wanstaRenderComments() {
  if (!wanstaSelectedPhoto) return;
  var container = document.getElementById('wanstaCommentsList');
  if (!container) return;

  if (wanstaSelectedPhoto.isStatic) {
    container.innerHTML = '<div class="wansta-no-comments">この写真にはコメントできません</div>';
    return;
  }

  var comments = wanstaSelectedPhoto.comments || [];
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

function findHitokoto(hitokotoId) {
  var list = wanstaHitokoto[wanstaCurrentAccount] || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === hitokotoId) return list[i];
  }
  return null;
}

async function wanstaToggleHitokotoLike(hitokotoId) {
  if (!currentUser) return;
  var h = findHitokoto(hitokotoId);
  if (!h || h.isDefault) return; // デフォルト一言はいいね不可

  var userId = currentUser.userId;
  var likes = h.likes ? h.likes.slice() : [];
  var idx = likes.indexOf(userId);
  if (idx === -1) { likes.push(userId); } else { likes.splice(idx, 1); }
  h.likes = likes;
  renderWansta();

  try {
    var res = await fetch(API_BASE_URL + AppConfig.API.CHIROL_HITOKOTO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'like', hitokotoId: hitokotoId, dog: wanstaCurrentAccount, userId: userId })
    });
    if (res.ok) {
      var data = await res.json();
      h.likes = data.likes || likes;
      renderWansta();
    }
  } catch (e) {
    console.error('Hitokoto like error:', e);
  }
}

function wanstaToggleHitokotoComments(hitokotoId) {
  var area = document.getElementById('hitokotoComments_' + hitokotoId);
  if (!area) return;
  var isHidden = area.style.display === 'none';
  area.style.display = isHidden ? 'block' : 'none';
  if (isHidden) wanstaRenderHitokotoComments(hitokotoId);
}

function wanstaRenderHitokotoComments(hitokotoId) {
  var h = findHitokoto(hitokotoId);
  var comments = h ? (h.comments || []) : [];
  var container = document.getElementById('hitokotoCommentsList_' + hitokotoId);
  if (!container) return;
  var currentUserId = currentUser ? currentUser.userId : '';

  if (comments.length === 0) {
    container.innerHTML = '<div style="font-size:12px;color:var(--color-text-faint);padding:4px 0">コメントはまだないよ</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < comments.length; i++) {
    var c = comments[i];
    var hcMember = familyMembers.find(function(m) { return m.userId === c.userId; });
    var hcName = hcMember ? getDisplayName(hcMember) : c.userName;
    var canDelete = c.userId === currentUserId;
    html += '<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:6px">'
      + '<div style="flex:1"><span style="font-weight:600;font-size:12px;color:var(--color-text-primary)">' + escapeHtml(hcName) + '</span> <span style="font-size:12px;color:var(--color-text-primary)">' + escapeHtml(c.text) + '</span></div>'
      + (canDelete ? '<button style="background:none;border:none;color:#e74c3c;font-size:11px;cursor:pointer;padding:0" onclick="wanstaDeleteHitokotoComment(\'' + hitokotoId + '\',\'' + c.id + '\')"><i class="ph-bold ph-x"></i></button>' : '')
      + '</div>';
  }
  container.innerHTML = html;
}

async function wanstaAddHitokotoComment(hitokotoId) {
  if (!currentUser) return;
  var h = findHitokoto(hitokotoId);
  if (!h || h.isDefault) return; // デフォルト一言はコメント不可

  var input = document.getElementById('hitokotoCommentInput_' + hitokotoId);
  var text = input ? input.value.trim() : '';
  if (!text) return;

  // 楽観的追加
  var tmpId = 'c_' + Date.now() + '_tmp';
  var comment = {
    id: tmpId,
    userId: currentUser.userId,
    userName: getDisplayName(currentUser),
    text: text,
    createdAt: new Date().toISOString()
  };
  if (!h.comments) h.comments = [];
  h.comments.push(comment);
  if (input) input.value = '';
  wanstaRenderHitokotoComments(hitokotoId);
  renderWansta();

  try {
    var res = await fetch(API_BASE_URL + AppConfig.API.CHIROL_HITOKOTO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'addComment',
        hitokotoId: hitokotoId,
        dog: wanstaCurrentAccount,
        userId: currentUser.userId,
        userName: getDisplayName(currentUser),
        text: text
      })
    });
    if (res.ok) {
      var data = await res.json();
      // 仮IDを正式IDで置換
      for (var i = 0; i < h.comments.length; i++) {
        if (h.comments[i].id === tmpId && data.comment) {
          h.comments[i] = data.comment;
          break;
        }
      }
      wanstaRenderHitokotoComments(hitokotoId);
    }
  } catch (e) {
    console.error('Hitokoto comment error:', e);
  }
}

async function wanstaDeleteHitokotoComment(hitokotoId, commentId) {
  var h = findHitokoto(hitokotoId);
  if (!h) return;

  // 楽観的削除
  h.comments = (h.comments || []).filter(function(c) { return c.id !== commentId; });
  wanstaRenderHitokotoComments(hitokotoId);
  renderWansta();

  try {
    await fetch(API_BASE_URL + AppConfig.API.CHIROL_HITOKOTO, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hitokotoId: hitokotoId, dog: wanstaCurrentAccount, commentId: commentId })
    });
  } catch (e) {
    console.error('Hitokoto delete comment error:', e);
  }
}
