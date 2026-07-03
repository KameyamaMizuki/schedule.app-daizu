// ========== ダイ日記 — 詳細表示 + いいね + コメント ==========
// 依存: diary.js (diaryPosts, parseDiaryPost, sanitizeDiaryHtml, renderDiaryPosts, loadDiaryPosts)

function diaryShowDetail(postId) {
  var post = diaryPosts.find(function(p) { return p.postId === postId; });
  if (!post) return;

  var parsed = parseDiaryPost(post);
  var isOwner = currentUser && post.userId === currentUser.userId;
  var sanitizedText = sanitizeDiaryHtml(parsed.textContent);

  var member = familyMembers.find(function(m) { return m.userId === post.userId; });
  var displayName = member ? getDisplayName(member) : post.displayName;

  var likeCount = (post.reactions && post.reactions.like) ? post.reactions.like.length : 0;
  var commentCount = post.comments ? post.comments.length : 0;
  var isLiked = currentUser && post.reactions && post.reactions.like && post.reactions.like.includes(currentUser.userId);
  var sk = encodeURIComponent(post.SK || '');

  var commentsHtml = '';
  if (post.comments && post.comments.length > 0) {
    commentsHtml = post.comments.map(function(c) {
      var cMember = familyMembers.find(function(m) { return m.userId === c.userId; });
      var cName = cMember ? getDisplayName(cMember) : c.displayName;
      return '<div class="diary-comment"><strong>' + escapeHtml(cName) + ':</strong> ' + escapeHtml(c.text) + '</div>';
    }).join('');
  }

  document.getElementById('diaryDetailContent').innerHTML =
    '<div class="diary-detail-date"><i class="ph-bold ph-calendar"></i> ' + parsed.dateStrLong + '</div>'
    + (parsed.title ? '<div class="diary-detail-title">' + escapeHtml(parsed.title) + '</div>' : '')
    + '<div class="diary-detail-author">' + escapeHtml(displayName) + '</div>'
    + (parsed.catchImgData ? '<img class="diary-detail-catch" src="' + parsed.catchImgData + '" alt="">' : '')
    + '<div class="diary-detail-text">' + sanitizedText + '</div>'
    + '<div class="diary-detail-like-section">'
    + '<span class="diary-detail-like-btn ' + (isLiked ? 'liked' : '') + '" onclick="toggleDiaryLike(\'' + post.postId + '\',\'' + sk + '\')">'
    + '❤️ ' + (likeCount > 0 ? likeCount : '')
    + '</span>'
    + '<span class="diary-detail-like-btn">'
    + '<i class="ph-bold ph-chat-circle-text"></i> ' + (commentCount > 0 ? commentCount : '')
    + '</span>'
    + '</div>'
    + '<div class="diary-comment-section">'
    + commentsHtml
    + '<div class="diary-comment-input-row">'
    + '<input type="text" id="diaryCommentInput" class="diary-comment-input" placeholder="コメントを入力..." onkeypress="handleDiaryCommentKeypress(event, \'' + post.postId + '\', \'' + sk + '\')">'
    + '<button class="diary-comment-submit" onclick="submitDiaryComment(\'' + post.postId + '\', \'' + sk + '\')">送信</button>'
    + '</div>'
    + '</div>'
    + (isOwner
      ? '<div class="diary-detail-actions">'
        + '<span class="diary-entry-action" onclick="closeDiaryDetail();editDiary(\'' + post.postId + '\')"><i class="ph-bold ph-pencil-simple"></i> 編集</span>'
        + '<span class="diary-entry-action" onclick="closeDiaryDetail();deleteDiary(\'' + post.postId + '\')"><i class="ph-bold ph-trash"></i> 削除</span>'
        + '</div>'
      : '');

  document.getElementById('diaryDetailModal').classList.add('active');
  document.body.classList.add('modal-open');
  document.body.style.overflow = 'hidden';
}

function closeDiaryDetail() {
  document.getElementById('diaryDetailModal').classList.remove('active');
  document.body.classList.remove('modal-open');
  document.body.style.overflow = '';
}

async function toggleDiaryLike(postId, sk) {
  if (!currentUser) { showUserSelectModal(); return; }
  var userId = currentUser.userId;
  var post = diaryPosts.find(function(p) { return p.postId === postId; });
  if (!post) return;

  var wasLiked = post.reactions && post.reactions.like && post.reactions.like.includes(userId);
  if (!post.reactions) post.reactions = { like: [] };
  if (wasLiked) {
    post.reactions.like = post.reactions.like.filter(function(id) { return id !== userId; });
  } else {
    post.reactions.like = (post.reactions.like || []).concat([userId]);
  }
  updateDiaryLikeUI(postId);
  if (document.getElementById('diaryDetailModal').classList.contains('active')) {
    diaryShowDetail(postId);
  }

  try {
    var res = await fetch(API_BASE_URL + AppConfig.API.POSTS + '/' + postId + '/reaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userId, action: 'like', type: 'DIARY',
        sk: decodeURIComponent(sk)
      })
    });
    if (!res.ok) throw new Error('API error');
  } catch (error) {
    console.error('いいねエラー:', error);
    if (wasLiked) {
      post.reactions.like = (post.reactions.like || []).concat([userId]);
    } else {
      post.reactions.like = post.reactions.like.filter(function(id) { return id !== userId; });
    }
    updateDiaryLikeUI(postId);
    if (document.getElementById('diaryDetailModal').classList.contains('active')) {
      diaryShowDetail(postId);
    }
  }
}

function handleDiaryCommentKeypress(event, postId, sk) {
  if (event.key !== 'Enter') return;
  submitDiaryComment(postId, sk);
}

var diaryCommentSubmitting = false;

async function submitDiaryComment(postId, sk) {
  if (diaryCommentSubmitting) return; // 二重送信ガード（ボタン連打・Enter連打の両方）
  var input = document.getElementById('diaryCommentInput');
  if (!input) return;
  var text = input.value.trim();
  if (!text || !currentUser) return;

  diaryCommentSubmitting = true;
  var btn = document.querySelector('.diary-comment-submit');
  if (btn) btn.disabled = true;

  try {
    await fetch(API_BASE_URL + AppConfig.API.POSTS + '/' + postId + '/comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.userId,
        displayName: currentUser.displayName,
        text: text,
        type: 'DIARY',
        sk: decodeURIComponent(sk)
      })
    });
    input.value = '';
    await loadDiaryPosts(false, true);
    diaryShowDetail(postId);
  } catch (error) {
    console.error('コメントエラー:', error);
    if (btn) btn.disabled = false; // 失敗時は再送信できるよう復帰（成功時はモーダル再描画でボタンごと置換される）
  } finally {
    diaryCommentSubmitting = false;
  }
}
