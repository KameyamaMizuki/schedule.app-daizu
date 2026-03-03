// ========== つぶやき機能 ==========
let tsubuyakiPosts = [];
let currentUserId = currentUser?.userId || null;

async function initTsubuyakiTab() {
  updateTsubuyakiSkyBackground();
  await loadTsubuyakiPosts();
}

function toggleTsubuyakiInput() {
  const inputArea = document.getElementById('tsubuyakiInputArea');
  const isVisible = inputArea.style.display !== 'none';
  inputArea.style.display = isVisible ? 'none' : 'block';
  if (!isVisible) {
    document.getElementById('tsubuyakiInput').focus();
  }
}

function updateTsubuyakiSkyBackground() {
  const sky = document.getElementById('tsubuyakiSky');
  if (!sky) return;

  const now = new Date();
  const hour = now.getHours();

  sky.classList.remove('morning', 'day', 'sunset', 'dusk', 'night');

  if (hour >= 5 && hour < 7) {
    sky.classList.add('morning');
  } else if (hour >= 7 && hour < 16) {
    sky.classList.add('day');
  } else if (hour >= 16 && hour < 18) {
    sky.classList.add('sunset');
  } else if (hour >= 18 && hour < 21) {
    sky.classList.add('dusk');
  } else {
    sky.classList.add('night');
  }

  // 雲を追加（日中のみ）
  const cloudsContainer = sky.querySelector('.tsubuyaki-clouds');
  if (cloudsContainer && hour >= 7 && hour < 18) {
    cloudsContainer.innerHTML = generateClouds();
  } else if (cloudsContainer) {
    cloudsContainer.innerHTML = '';
  }
}

function generateClouds() {
  let html = '';
  for (let i = 0; i < 5; i++) {
    const left = Math.random() * 80 + 5;
    const top = Math.random() * 30 + 5;
    const size = Math.random() * 30 + 20;
    html += `<div class="tsubuyaki-cloud" style="left:${left}%;top:${top}px;width:${size}px;height:${size * 0.6}px"></div>`;
  }
  return html;
}

function renderTsubuyakiSkeleton(count = 3) {
  return Array.from({ length: count }, () => `
    <div class="skeleton-card">
      <div class="skeleton-card-header">
        <div class="skeleton skeleton-avatar"></div>
        <div style="flex:1">
          <div class="skeleton skeleton-line short"></div>
          <div class="skeleton skeleton-line" style="width:40%;margin-top:4px;height:10px"></div>
        </div>
      </div>
      <div class="skeleton-card-body">
        <div class="skeleton skeleton-line full"></div>
        <div class="skeleton skeleton-line medium"></div>
      </div>
    </div>`).join('');
}

async function loadTsubuyakiPosts() {
  const container = document.getElementById('tsubuyakiPosts');
  // スケルトンを即時表示
  container.innerHTML = renderTsubuyakiSkeleton(3);

  try {
    const response = await fetch(`${API_BASE_URL}${AppConfig.API.POSTS}?type=POST`);
    if (!response.ok) throw new Error('取得失敗');

    const data = await response.json();
    tsubuyakiPosts = data.posts || [];

    if (tsubuyakiPosts.length === 0) {
      container.innerHTML = '<div class="tsubuyaki-empty">まだつぶやきがありません。<br>最初のつぶやきを投稿してみよう！</div>';
      return;
    }

    renderTsubuyakiPosts();
  } catch (error) {
    console.error('つぶやき読み込みエラー:', error);
    container.innerHTML = '<div class="tsubuyaki-empty">つぶやきの読み込みに失敗しました</div>';
  }
}

function renderSingleTsubuyaki(post, userId) {
  const time = formatTsubuyakiTime(post.createdAt);
  const likeCount = post.reactions?.like?.length || 0;
  const commentCount = post.comments?.length || 0;
  const isLiked = userId && post.reactions?.like?.includes(userId);
  const isOwner = userId && post.userId === userId;
  const sk = encodeURIComponent(post.SK || '');
  const postMember = familyMembers.find(m => m.userId === post.userId);
  const authorName = postMember ? getDisplayName(postMember) : post.displayName;

  return `<div class="tsubuyaki-post" data-post-id="${post.postId}">
    <div class="tsubuyaki-post-header">
      <span class="tsubuyaki-post-author">${escapeHtml(authorName)}</span>
      <span class="tsubuyaki-post-time">${time}</span>
    </div>
    <div class="tsubuyaki-post-text">${escapeHtml(post.text)}</div>
    <div class="tsubuyaki-post-actions">
      <span class="tsubuyaki-action ${isLiked ? 'liked' : ''}" onclick="toggleTsubuyakiLike('${post.postId}', '${sk}', 'POST')">
        ❤️ ${likeCount > 0 ? likeCount : ''}
      </span>
      <span class="tsubuyaki-action" onclick="toggleTsubuyakiComments('${post.postId}')">
        💬 ${commentCount > 0 ? commentCount : ''}
      </span>
      ${isOwner ? `
        <span class="tsubuyaki-action-own">
          <span class="tsubuyaki-action" onclick="editTsubuyaki('${post.postId}', '${sk}')">✏️</span>
          <span class="tsubuyaki-action" onclick="deleteTsubuyaki('${post.postId}', '${sk}')">🗑</span>
        </span>
      ` : ''}
    </div>
    <div class="tsubuyaki-comment-section" id="comments-${post.postId}" style="display:none">
      ${renderTsubuyakiComments(post.comments || [])}
      <input type="text" class="tsubuyaki-comment-input" placeholder="コメントを入力..." onkeypress="handleTsubuyakiCommentKeypress(event, '${post.postId}', '${sk}')">
    </div>
  </div>`;
}

function renderTsubuyakiPosts() {
  const container = document.getElementById('tsubuyakiPosts');
  const userId = currentUser?.userId;
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const activePosts = tsubuyakiPosts.filter(p => new Date(p.createdAt) >= oneWeekAgo);
  const archivedPosts = tsubuyakiPosts.filter(p => new Date(p.createdAt) < oneWeekAgo);

  let html = '';
  activePosts.forEach(post => {
    html += renderSingleTsubuyaki(post, userId);
  });

  if (archivedPosts.length > 0) {
    html += `<div class="tsubuyaki-archive-section">
      <button class="tsubuyaki-archive-toggle" onclick="toggleTsubuyakiArchive()">
        📦 アーカイブ (${archivedPosts.length}件)
      </button>
      <div id="tsubuyakiArchive" style="display:none">`;
    archivedPosts.forEach(post => {
      html += renderSingleTsubuyaki(post, userId);
    });
    html += `</div></div>`;
  }

  container.innerHTML = html || '<div class="tsubuyaki-empty">まだつぶやきはありません</div>';
}

function renderTsubuyakiComments(comments) {
  if (!comments || comments.length === 0) return '';
  return comments.map(c => `<div class="tsubuyaki-comment"><strong>${escapeHtml(c.displayName)}:</strong> ${escapeHtml(c.text)}</div>`).join('');
}

function formatTsubuyakiTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'たった今';
  if (diffMin < 60) return `${diffMin}分前`;
  if (diffHour < 24) return `${diffHour}時間前`;
  if (diffDay < 7) return `${diffDay}日前`;

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

async function submitTsubuyaki() {
  const input = document.getElementById('tsubuyakiInput');
  const text = input.value.trim();
  if (!text) return;

  if (!currentUser) {
    alert('ユーザーが選択されていません');
    return;
  }

  const btn = document.getElementById('tsubuyakiSubmitBtn');
  btn.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}${AppConfig.API.POSTS}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'POST',
        userId: currentUser.userId,
        displayName: getDisplayName(currentUser),
        text
      })
    });

    if (!response.ok) throw new Error('投稿失敗');

    input.value = '';
    toggleTsubuyakiInput(); // 投稿後は入力欄を閉じる
    await loadTsubuyakiPosts();
  } catch (error) {
    alert('投稿に失敗しました: ' + error.message);
  } finally {
    btn.disabled = false;
  }
}

async function toggleTsubuyakiLike(postId, sk, type = 'POST') {
  if (!currentUser) {
    alert('ユーザーが選択されていません');
    return;
  }

  const userId = currentUser.userId;
  const post = tsubuyakiPosts.find(p => p.postId === postId);
  if (!post) return;

  // Optimistic UI: APIレスポンスを待たずに即時反映
  const wasLiked = post.reactions?.like?.includes(userId);
  if (!post.reactions) post.reactions = { like: [] };
  if (wasLiked) {
    post.reactions.like = post.reactions.like.filter(id => id !== userId);
  } else {
    post.reactions.like = [...(post.reactions.like || []), userId];
  }
  renderTsubuyakiPosts();

  // バックグラウンドでAPI呼び出し
  try {
    const res = await fetch(`${API_BASE_URL}${AppConfig.API.POSTS}/${postId}/reaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action: 'like', type, sk })
    });
    if (!res.ok) throw new Error('API error');
  } catch (error) {
    console.error('いいねエラー:', error);
    // ロールバック: 元の状態に戻す
    if (wasLiked) {
      post.reactions.like = [...(post.reactions.like || []), userId];
    } else {
      post.reactions.like = post.reactions.like.filter(id => id !== userId);
    }
    renderTsubuyakiPosts();
  }
}

function toggleTsubuyakiComments(postId) {
  const section = document.getElementById(`comments-${postId}`);
  if (section) {
    section.style.display = section.style.display === 'none' ? 'block' : 'none';
  }
}

async function handleTsubuyakiCommentKeypress(event, postId, sk) {
  if (event.key !== 'Enter') return;

  const input = event.target;
  const text = input.value.trim();
  if (!text || !currentUser) return;

  try {
    await fetch(`${API_BASE_URL}${AppConfig.API.POSTS}/${postId}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.userId,
        displayName: currentUser.displayName,
        text,
        type: 'POST',
        sk: decodeURIComponent(sk)
      })
    });

    input.value = '';
    await loadTsubuyakiPosts();
  } catch (error) {
    console.error('コメントエラー:', error);
  }
}

async function repostTsubuyaki(postId) {
  const post = tsubuyakiPosts.find(p => p.postId === postId);
  if (!post) return;

  const input = document.getElementById('tsubuyakiInput');
  input.value = `🔄 ${post.displayName}: ${post.text}`;
  input.focus();
}

async function editTsubuyaki(postId, sk) {
  const post = tsubuyakiPosts.find(p => p.postId === postId);
  if (!post) return;

  const newText = prompt('編集:', post.text);
  if (newText === null || newText.trim() === '') return;

  try {
    const res = await fetch(`${API_BASE_URL}${AppConfig.API.POSTS}/${postId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newText.trim(), type: 'POST', sk: decodeURIComponent(sk) })
    });
    if (!res.ok) throw new Error('Edit failed');
    await loadTsubuyakiPosts();
  } catch (error) {
    console.error('Edit error:', error);
    alert('編集に失敗しました');
  }
}

async function deleteTsubuyaki(postId, sk) {
  if (!confirm('このつぶやきを削除しますか？')) return;

  try {
    const res = await fetch(`${API_BASE_URL}${AppConfig.API.POSTS}/${postId}?type=POST&sk=${sk}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    await loadTsubuyakiPosts();
  } catch (error) {
    console.error('Delete error:', error);
    alert('削除に失敗しました');
  }
}

function toggleTsubuyakiArchive() {
  const archive = document.getElementById('tsubuyakiArchive');
  if (archive) {
    archive.style.display = archive.style.display === 'none' ? 'block' : 'none';
  }
}

