// yousu.js — 様子タブ（だいずの様子を記録・閲覧）
// Posts API (type=YOUSU) を使用。複数件/日対応、編集・削除可能。

var yousuPosts = [];
var yousuLastKey = null; // ページネーション用
var yousuEditingPostSk = null; // 編集中の投稿SK

async function initYousuTab() {
  var container = document.getElementById('yousuContainer');
  container.innerHTML = renderYousuSkeleton();

  await loadYousuPosts();
  renderYousuTab();
}

async function loadYousuPosts(append, force) {
  // 初回ロード時はリセット
  if (!append) {
    yousuPosts = [];
    yousuLastKey = null;
  }

  var postsQuery = '?type=YOUSU&limit=50';
  if (append && yousuLastKey) {
    postsQuery += '&lastKey=' + encodeURIComponent(yousuLastKey);
  }

  try {
    if (append) {
      // 追加読み込みは従来どおりネットワーク直
      var postsData = await Api.getPosts(postsQuery, null, { force: true });
      yousuLastKey = postsData.lastEvaluatedKey || null;
      yousuPosts = yousuPosts.concat(postsData.posts || []);
    } else {
      // 初回はSWR: キャッシュ即表示→裏で最新化して差分があれば再描画
      var data = await Api.getPosts(postsQuery, function(fresh) {
        yousuPosts = fresh.posts || [];
        yousuLastKey = fresh.lastEvaluatedKey || null;
        renderYousuTab();
      }, { force: force });
      yousuPosts = data.posts || [];
      yousuLastKey = data.lastEvaluatedKey || null;
    }
  } catch (e) {
    console.error('Failed to load yousu posts:', e);
    if (!append) yousuPosts = [];
  }
}


function renderYousuTab() {
  var container = document.getElementById('yousuContainer');

  // だいず画像をランダムに選択
  var daizuImages = homeDaizuImages.normal;
  var randomImg = daizuImages[Math.floor(Math.random() * daizuImages.length)];

  var dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  var today = new Date();
  var todayStr = formatDateForApi(today);
  var todayDate = new Date(todayStr + 'T00:00:00+09:00');
  var todayLabel = (todayDate.getMonth() + 1) + '月' + todayDate.getDate() + '日 (' + dayNames[todayDate.getDay()] + ')';

  var html = '';

  // ヘッダーバナー
  html += '<div class="yousu-banner">';
  html += '<img class="yousu-banner-img" src="' + randomImg + '" alt="だいず" onerror="this.style.display=\'none\'">';
  html += '<div>';
  html += '<div class="yousu-banner-text"><i class="ph-bold ph-paw-print"></i> だいずの様子</div>';
  html += '<div class="yousu-banner-sub">毎日の記録</div>';
  html += '</div>';
  html += '</div>';

  // 今日の入力カード
  html += '<div class="yousu-today">';
  html += '<div class="yousu-today-label">';
  html += '<span><i class="ph-bold ph-note-pencil"></i> ' + todayLabel + '</span>';
  html += '</div>';
  html += '<textarea id="yousuTodayInput" class="yousu-today-textarea" placeholder="今日のだいずの様子を入力..." maxlength="200"></textarea>';
  html += '<div class="yousu-input-footer">';
  html += '<span class="yousu-char-count"><span id="yousuCharCount">0</span>/200</span>';
  html += '<button id="yousuSaveBtn" class="yousu-save-btn" onclick="saveYousuPost()">記録する</button>';
  html += '</div>';
  html += '</div>';

  // 投稿一覧（日付ごとにグループ化）
  if (yousuPosts.length > 0) {
    var grouped = groupPostsByDate(yousuPosts);
    var dates = Object.keys(grouped).sort(function(a, b) { return b.localeCompare(a); });

    html += '<div class="yousu-timeline">';
    for (var i = 0; i < dates.length; i++) {
      var dateStr = dates[i];
      var posts = grouped[dateStr];
      var entryDate = new Date(dateStr + 'T00:00:00+09:00');
      var isToday = (dateStr === todayStr);
      var dateLabel = (entryDate.getMonth() + 1) + '/' + entryDate.getDate() + ' (' + dayNames[entryDate.getDay()] + ')';

      html += '<div class="yousu-date-group">';
      html += '<div class="yousu-date-label' + (isToday ? ' today' : '') + '">' + (isToday ? '今日 ' : '') + dateLabel + '</div>';

      for (var j = 0; j < posts.length; j++) {
        html += renderYousuPost(posts[j]);
      }
      html += '</div>';
    }
    // 「もっと見る」ボタン（次ページがある場合のみ）
    if (yousuLastKey) {
      html += '<div style="text-align:center;padding:16px">'
        + '<button onclick="loadMoreYousuPosts()" style="background:#3F6E5B;color:#fff;border:none;padding:10px 24px;border-radius:20px;font-size:14px;cursor:pointer">もっと見る</button>'
        + '</div>';
    }

    html += '</div>';
  } else {
    html += '<div class="yousu-empty">';
    html += '<div class="yousu-empty-icon"><i class="ph-bold ph-paw-print"></i></div>';
    html += '<div class="yousu-empty-text">まだ記録がありません<br>今日のだいずの様子を記録してみましょう</div>';
    html += '</div>';
  }

  container.innerHTML = html;

  // 文字数カウンターを設定
  var input = document.getElementById('yousuTodayInput');
  if (input) {
    input.addEventListener('input', function() {
      var countEl = document.getElementById('yousuCharCount');
      if (countEl) countEl.textContent = this.value.length;
    });
  }
}

function renderYousuPost(post) {
  var postDate = post.createdAt ? new Date(post.createdAt) : null;
  var timeStr = postDate ? (String(postDate.getHours()).padStart(2, '0') + ':' + String(postDate.getMinutes()).padStart(2, '0')) : '';

  var isOwner = currentUser && post.userId === currentUser.userId;
  var isLegacy = post.isLegacy === true;
  var isEditing = !isLegacy && yousuEditingPostSk === post.SK;

  var html = '<div class="yousu-entry" id="yousu-post-' + post.postId + '">';

  if (isEditing) {
    // 編集モード
    html += '<div class="yousu-edit-area">';
    html += '<textarea id="yousuEditInput" class="yousu-today-textarea" maxlength="200">' + escapeHtml(post.text) + '</textarea>';
    html += '<div class="yousu-edit-actions">';
    html += '<button class="yousu-edit-cancel" onclick="yousuCancelEdit()">キャンセル</button>';
    html += '<button class="yousu-edit-save" onclick="yousuSaveEdit(\'' + post.postId + '\',\'' + escapeHtml(post.SK) + '\')">保存</button>';
    html += '</div>';
    html += '</div>';
  } else {
    // 表示モード
    html += '<div class="yousu-entry-content">';
    html += '<div class="yousu-entry-text">' + escapeHtml(post.text) + '</div>';
    html += '<div class="yousu-entry-meta">';
    html += '<span class="yousu-entry-time">' + timeStr + '</span>';
    if (post.displayName) {
      html += '<span class="yousu-entry-author">' + escapeHtml(post.displayName) + '</span>';
    }
    if (isOwner && !isLegacy) {
      html += '<span class="yousu-entry-actions">';
      html += '<button class="yousu-action-btn" onclick="yousuStartEdit(\'' + escapeHtml(post.SK) + '\')"><i class="ph-bold ph-pencil-simple"></i></button>';
      html += '<button class="yousu-action-btn" onclick="yousuDeletePost(\'' + post.postId + '\',\'' + escapeHtml(post.SK) + '\')"><i class="ph-bold ph-trash"></i></button>';
      html += '</span>';
    }
    html += '</div>';
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function groupPostsByDate(posts) {
  var groups = {};
  for (var i = 0; i < posts.length; i++) {
    var post = posts[i];
    var dateStr = post.createdAt ? post.createdAt.substring(0, 10) : 'unknown';
    if (!groups[dateStr]) groups[dateStr] = [];
    groups[dateStr].push(post);
  }
  // 各グループ内を時間降順でソート
  for (var d in groups) {
    groups[d].sort(function(a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
  }
  return groups;
}

async function saveYousuPost() {
  var input = document.getElementById('yousuTodayInput');
  var text = input.value.trim();
  if (!text) {
    showToast('様子を入力してください');
    return;
  }

  var btn = document.getElementById('yousuSaveBtn');
  btn.disabled = true;
  btn.textContent = '記録中...';

  try {
    await Api.createPost({
      type: 'YOUSU',
      userId: currentUser ? currentUser.userId : 'unknown',
      displayName: currentUser ? getDisplayName(currentUser) : '不明',
      text: text
    });

    input.value = '';
    var countEl = document.getElementById('yousuCharCount');
    if (countEl) countEl.textContent = '0';
    showToast('だいずの様子を記録しました');
    // リロード（先頭から再取得、保存直後なのでキャッシュを使わない）
    await loadYousuPosts(false, true);
    renderYousuTab();
  } catch (e) {
    console.error('Failed to save yousu:', e);
    showToast(e.message || '保存に失敗しました');
  } finally {
    btn.disabled = false;
    btn.textContent = '記録する';
  }
}

function yousuStartEdit(sk) {
  yousuEditingPostSk = sk;
  renderYousuTab();
}

function yousuCancelEdit() {
  yousuEditingPostSk = null;
  renderYousuTab();
}

async function yousuSaveEdit(postId, sk) {
  var input = document.getElementById('yousuEditInput');
  var text = input.value.trim();
  if (!text) {
    showToast('内容を入力してください');
    return;
  }

  try {
    await Api.updatePost(postId, {
      text: text,
      type: 'YOUSU',
      sk: sk,
      displayName: currentUser ? getDisplayName(currentUser) : '不明'
    });

    yousuEditingPostSk = null;
    showToast('更新しました');
    await loadYousuPosts(false, true);
    renderYousuTab();
  } catch (e) {
    console.error('Failed to edit yousu:', e);
    showToast('更新に失敗しました');
  }
}

async function yousuDeletePost(postId, sk) {
  if (!confirm('この記録を削除しますか？')) return;

  try {
    await Api.deletePost(postId, 'YOUSU', sk);

    showToast('削除しました');
    await loadYousuPosts(false, true);
    renderYousuTab();
  } catch (e) {
    console.error('Failed to delete yousu:', e);
    showToast('削除に失敗しました');
  }
}

async function loadMoreYousuPosts() {
  await loadYousuPosts(true);
  renderYousuTab();
}

function renderYousuSkeleton() {
  var html = '';
  html += '<div class="yousu-skeleton-card"><div class="yousu-skeleton-line" style="width:40%"></div></div>';
  html += '<div class="yousu-skeleton-card"><div class="yousu-skeleton-line" style="width:100%"></div><div class="yousu-skeleton-line" style="width:80%"></div><div class="yousu-skeleton-line" style="width:60%"></div></div>';
  html += '<div class="yousu-skeleton-card"><div class="yousu-skeleton-line" style="width:30%"></div></div>';
  html += '<div class="yousu-skeleton-card"><div class="yousu-skeleton-line" style="width:90%"></div><div class="yousu-skeleton-line" style="width:70%"></div></div>';
  return html;
}
