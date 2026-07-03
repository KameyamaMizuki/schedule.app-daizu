// ========== ダイ日記タブ — コアCRUD ==========
// 依存: core/config.js, core/state.js, core/utils.js, ui/user-select.js
var diaryPosts = [];
var diaryLastKey = null; // ページネーション用
var diaryPhotoData = null;
var diaryPhotoPosition = 'top';
var diaryCatchImageData = null;
var diaryCropTarget = 'editor'; // 'editor' or 'catch' — crop-free.js から参照
var diaryEditingPostId = null; // 編集中の投稿ID（nullなら新規作成）

async function initDiaryTab() {
  await loadDiaryPosts();
}

function toggleDiaryInput() {
  var inputArea = document.getElementById('diaryInputArea');
  var isVisible = inputArea.style.display !== 'none';

  if (isVisible) {
    // 閉じる：状態をリセット
    inputArea.style.display = 'none';
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    diaryEditingPostId = null;
  } else {
    // 開く：新規作成モードで初期化
    document.getElementById('diaryRichEditor').innerHTML = '';
    document.getElementById('diaryTitleInput').value = '';
    var today = new Date().toISOString().split('T')[0];
    document.getElementById('diaryDateInput').value = today;
    diaryPhotoData = null;
    document.getElementById('diaryPhotoPreview').style.display = 'none';
    diaryCatchImageData = null;
    var catchPreview = document.getElementById('diaryCatchPreview');
    if (catchPreview) catchPreview.style.display = 'none';
    var catchPreviewImg = document.getElementById('diaryCatchPreviewImg');
    if (catchPreviewImg) catchPreviewImg.src = '';
    var catchSelectBtn = document.getElementById('diaryCatchSelectBtn');
    if (catchSelectBtn) catchSelectBtn.style.display = 'block';
    // ヘッダー・ボタンを新規作成表示に
    var titleEl = document.getElementById('diaryInputTitle');
    if (titleEl) titleEl.innerHTML = '<i class="ph-bold ph-note-pencil"></i> 日記を書く';
    var btn = document.getElementById('diarySubmitBtn');
    if (btn) btn.textContent = '投稿する';

    inputArea.style.display = 'flex';
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
  }
}

function diaryFormatText(format) {
  document.execCommand(format, false, null);
  document.getElementById('diaryRichEditor').focus();
}

function selectDiaryPhotoPosition(pos) {
  diaryPhotoPosition = pos;
  document.querySelectorAll('.diary-position-btn').forEach(function(btn) {
    btn.classList.toggle('selected', btn.dataset.pos === pos);
  });
}

// ========== 共通テキストパーサー ==========
// renderDiaryPosts と diaryShowDetail の両方で使用
function parseDiaryPost(post) {
  var dayNames = AppConfig.SCHEDULE.DAYS;

  // ── 新形式: body フィールドが存在する ──
  if (post.body !== undefined) {
    var dateStr = post.date || (post.createdAt ? post.createdAt.substring(0, 10) : '');
    var dNew = dateStr ? new Date(dateStr + 'T00:00:00') : new Date(post.createdAt);
    return {
      title: post.title || '',
      dateStrShort: (dNew.getMonth() + 1) + '/' + dNew.getDate() + '(' + dayNames[dNew.getDay()] + ')',
      dateStrLong: dNew.getFullYear() + '年' + (dNew.getMonth() + 1) + '月' + dNew.getDate() + '日(' + dayNames[dNew.getDay()] + ')',
      textContent: post.body || '',
      catchImgData: post.catchImageUrl || null  // S3 URL または null
    };
  }

  // ── 旧形式: text フィールドにブラケット記法 ──
  var textContent = post.text || '';
  var title = '';
  var dateStrShort, dateStrLong;
  var catchImgData = null;

  var dateMatch = textContent.match(/^\[DATE:(\d{4}-\d{2}-\d{2})\]/);
  if (dateMatch) {
    var customDate = new Date(dateMatch[1] + 'T00:00:00');
    dateStrShort = (customDate.getMonth() + 1) + '/' + customDate.getDate() + '(' + dayNames[customDate.getDay()] + ')';
    dateStrLong = customDate.getFullYear() + '年' + (customDate.getMonth() + 1) + '月' + customDate.getDate() + '日(' + dayNames[customDate.getDay()] + ')';
    textContent = textContent.replace(dateMatch[0], '');
  } else {
    var d = new Date(post.createdAt);
    dateStrShort = (d.getMonth() + 1) + '/' + d.getDate() + '(' + dayNames[d.getDay()] + ')';
    dateStrLong = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日(' + dayNames[d.getDay()] + ')';
  }

  var titleMatch = textContent.match(/^\[TITLE:([^\]]+)\]/);
  if (titleMatch) {
    title = titleMatch[1];
    textContent = textContent.replace(titleMatch[0], '');
  }

  var posMatch = textContent.match(/^\[PHOTO_POS:(top|middle|bottom)\]/);
  if (posMatch) textContent = textContent.replace(posMatch[0], '');

  var catchImgMatch = textContent.match(/^\[CATCH_IMG:(data:[^\]]+)\]/);
  if (catchImgMatch) {
    catchImgData = catchImgMatch[1];
    textContent = textContent.replace(catchImgMatch[0], '');
  }

  return { title: title, dateStrShort: dateStrShort, dateStrLong: dateStrLong, textContent: textContent, catchImgData: catchImgData };
}

async function loadDiaryPosts(append, force) {
  var container = document.getElementById('diaryPosts');

  // 一覧を反映して描画（初回・SWR更新の両方から使う）
  var applyList = function(data) {
    diaryPosts = data.posts || [];
    diaryLastKey = data.lastEvaluatedKey || null;
    if (diaryPosts.length === 0) {
      container.innerHTML = '<div class="diary-empty">まだ日記がありません。<br>だいずの今日の様子を記録してみよう！</div>';
      return;
    }
    renderDiaryPosts();
  };

  try {
    var url = API_BASE_URL + AppConfig.API.POSTS + '?type=DIARY&limit=50';
    if (append && diaryLastKey) {
      // 追加読み込みは従来どおりネットワーク直
      url += '&lastKey=' + encodeURIComponent(diaryLastKey);
      var response = await fetch(url);
      if (!response.ok) throw new Error('取得失敗');
      var data = await response.json();
      diaryLastKey = data.lastEvaluatedKey || null;
      diaryPosts = diaryPosts.concat(data.posts || []);
      renderDiaryPosts();
    } else {
      // 初回はSWR: キャッシュ即表示→裏で最新化して差分があれば再描画
      diaryPosts = [];
      diaryLastKey = null;
      applyList(await swrJson(url, applyList, { force: force }));
    }
  } catch (error) {
    console.error('日記読み込みエラー:', error);
    container.innerHTML = '<div class="diary-empty">日記の読み込みに失敗しました</div>';
  }
}

function renderDiaryPosts() {
  var container = document.getElementById('diaryPosts');
  var html = '';

  diaryPosts.forEach(function(post) {
    var parsed = parseDiaryPost(post);
    var isOwner = currentUser && post.userId === currentUser.userId;
    var sanitizedText = sanitizeDiaryHtml(parsed.textContent);

    var member = familyMembers.find(function(m) { return m.userId === post.userId; });
    var displayName = member ? getDisplayName(member) : post.displayName;

    var likeCount = (post.reactions && post.reactions.like) ? post.reactions.like.length : 0;
    var commentCount = post.comments ? post.comments.length : 0;
    var isLiked = currentUser && post.reactions && post.reactions.like && post.reactions.like.includes(currentUser.userId);
    var sk = encodeURIComponent(post.SK || '');

    html += '<div class="diary-entry" data-post-id="' + post.postId + '" onclick="diaryShowDetail(\'' + post.postId + '\')">'
      + (parsed.catchImgData ? '<img class="diary-entry-catch" src="' + parsed.catchImgData + '" alt="">' : '')
      + '<div class="diary-entry-body">'
      + '<div class="diary-entry-header">'
      + '<span class="diary-entry-date"><i class="ph-bold ph-calendar"></i> ' + parsed.dateStrShort + '</span>'
      + '<span class="diary-entry-author">' + escapeHtml(displayName) + '</span>'
      + '</div>'
      + (parsed.title ? '<div class="diary-entry-title">' + escapeHtml(parsed.title) + '</div>' : '')
      + '<div class="diary-text-wrapper collapsed" id="diary-text-wrap-' + post.postId + '" onclick="event.stopPropagation();toggleDiaryExpand(\'' + post.postId + '\')">'
      + '<div class="diary-entry-text">' + sanitizedText + '</div>'
      + '<div class="diary-text-fade" id="diary-text-fade-' + post.postId + '"><span class="diary-expand-label">もっと見る ▼</span></div>'
      + '</div>'
      + '<div class="diary-collapse-btn" id="diary-close-' + post.postId + '" style="display:none" onclick="event.stopPropagation();toggleDiaryExpand(\'' + post.postId + '\')">折りたたむ ▲</div>'
      + '<div class="diary-entry-actions">'
      + '<span class="diary-entry-action ' + (isLiked ? 'liked' : '') + '" id="diary-like-' + post.postId + '" onclick="event.stopPropagation();toggleDiaryLike(\'' + post.postId + '\',\'' + sk + '\')">'
      + '❤️ ' + (likeCount > 0 ? likeCount : '')
      + '</span>'
      + '<span class="diary-entry-action" onclick="event.stopPropagation();diaryShowDetail(\'' + post.postId + '\')">'
      + '<i class="ph-bold ph-chat-circle-text"></i> ' + (commentCount > 0 ? commentCount : '')
      + '</span>'
      + '</div>'
      + '</div>'
      + '</div>';
  });

  // 「もっと見る」ボタン（次ページがある場合のみ）
  if (diaryLastKey) {
    html += '<div style="text-align:center;padding:16px">'
      + '<button onclick="loadMoreDiaryPosts()" style="background:#8d6e63;color:#fff;border:none;padding:10px 24px;border-radius:20px;font-size:14px;cursor:pointer">もっと見る</button>'
      + '</div>';
  }

  container.innerHTML = html;

  // 折りたたみ中のエントリ内の画像を非表示
  container.querySelectorAll('.diary-text-wrapper.collapsed .diary-entry-text img').forEach(function(img) {
    img.style.display = 'none';
  });

  // コンテナが visible なら: はみ出していない投稿の collapsed を解除
  requestAnimationFrame(function() {
    diaryPosts.forEach(function(post) {
      var wrapper = document.getElementById('diary-text-wrap-' + post.postId);
      if (!wrapper || wrapper.scrollHeight === 0) return; // 非表示なら skip
      var fadeEl = document.getElementById('diary-text-fade-' + post.postId);
      if (wrapper.scrollHeight <= 122) {
        // コンテンツが収まっている → 折りたたみ不要
        wrapper.classList.remove('collapsed');
        wrapper.removeAttribute('onclick');
        if (fadeEl) fadeEl.style.display = 'none';
        wrapper.querySelectorAll('.diary-entry-text img').forEach(function(img) { img.style.display = 'block'; });
      }
    });
  });
}

// 一覧のいいねボタンだけを部分更新（全体再描画で「もっと見る」の展開状態を失わないため）
function updateDiaryLikeUI(postId) {
  var post = diaryPosts.find(function(p) { return p.postId === postId; });
  if (!post) return;
  var likeCount = (post.reactions && post.reactions.like) ? post.reactions.like.length : 0;
  var isLiked = currentUser && post.reactions && post.reactions.like && post.reactions.like.includes(currentUser.userId);
  var listBtn = document.getElementById('diary-like-' + postId);
  if (listBtn) {
    listBtn.classList.toggle('liked', !!isLiked);
    listBtn.textContent = '❤️ ' + (likeCount > 0 ? likeCount : '');
  }
}

function toggleDiaryExpand(postId) {
  var wrapper = document.getElementById('diary-text-wrap-' + postId);
  var fadeEl = document.getElementById('diary-text-fade-' + postId);
  var closeBtn = document.getElementById('diary-close-' + postId);
  if (!wrapper) return;

  var isCollapsed = wrapper.classList.contains('collapsed');
  if (isCollapsed) {
    // 展開
    wrapper.classList.remove('collapsed');
    wrapper.removeAttribute('onclick');
    if (fadeEl) fadeEl.style.display = 'none';
    if (closeBtn) closeBtn.style.display = 'block';
    wrapper.querySelectorAll('.diary-entry-text img').forEach(function(img) { img.style.display = 'block'; });
  } else {
    // 折りたたむ
    wrapper.classList.add('collapsed');
    wrapper.setAttribute('onclick', 'event.stopPropagation();toggleDiaryExpand(\'' + postId + '\')');
    if (fadeEl) fadeEl.style.display = '';
    if (closeBtn) closeBtn.style.display = 'none';
    wrapper.querySelectorAll('.diary-entry-text img').forEach(function(img) { img.style.display = 'none'; });
  }
}

async function loadMoreDiaryPosts() {
  await loadDiaryPosts(true);
}

function sanitizeDiaryHtml(html) {
  var tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  var scripts = tempDiv.querySelectorAll('script,style,iframe,object,embed');
  scripts.forEach(function(el) { el.remove(); });
  var sizeMap = { large: '100%', medium: '60%', small: '40%' };
  var imgs = tempDiv.querySelectorAll('img');
  imgs.forEach(function(img) {
    // data-size 属性を保持して表示サイズを正しく反映
    var size = img.dataset.size || 'large';
    var displayWidth = sizeMap[size] || '100%';
    img.style.width = displayWidth;
    img.style.maxWidth = displayWidth;
    img.style.borderRadius = '8px';
    img.style.margin = '8px auto';
    img.style.display = 'block';
  });
  return tempDiv.innerHTML;
}

function diaryPhotoSelected(event) {
  var file = event.target.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    alert('画像サイズは10MB以下にしてください');
    return;
  }
  compressImage(file, AppConfig.IMAGE.DIARY_PHOTO.maxWidth, AppConfig.IMAGE.DIARY_PHOTO.quality).then(function(compressedData) {
    diaryPhotoData = compressedData;
    var preview = document.getElementById('diaryPhotoPreview');
    var previewImg = document.getElementById('diaryPreviewImg');
    previewImg.src = diaryPhotoData;
    preview.style.display = 'block';
    var positionSelector = document.getElementById('diaryPhotoPosition');
    if (positionSelector) positionSelector.style.display = 'flex';
  }).catch(function(err) {
    console.error('画像圧縮エラー:', err);
    alert('画像の読み込みに失敗しました');
  });
}

function diaryRemovePhoto() {
  diaryPhotoData = null;
  diaryPhotoPosition = 'top';
  document.getElementById('diaryPhotoPreview').style.display = 'none';
  document.getElementById('diaryPreviewImg').src = '';
  var photoInput = document.getElementById('diaryPhotoInput');
  if (photoInput) photoInput.value = '';
  var positionSelector = document.getElementById('diaryPhotoPosition');
  if (positionSelector) positionSelector.style.display = 'none';
}

async function submitDiary() {
  var editor = document.getElementById('diaryRichEditor');
  var htmlContent = editor.innerHTML.trim();
  var textContent = editor.textContent.trim();
  var titleInput = document.getElementById('diaryTitleInput');
  var dateInput = document.getElementById('diaryDateInput');
  var title = titleInput ? titleInput.value.trim() : '';
  var selectedDate = dateInput ? dateInput.value : '';

  if (!textContent && !htmlContent.includes('<img')) {
    alert('日記の内容を入力してください');
    return;
  }

  if (!currentUser) {
    showUserSelectModal();
    return;
  }

  var btn = document.getElementById('diarySubmitBtn');
  var originalLabel = btn.textContent;
  btn.disabled = true;

  try {
    // 1. キャッチ画像をアップロード（base64 の場合のみ。S3 URL はそのまま使用）
    btn.textContent = '画像アップロード中...';
    var finalCatchImageUrl = null;
    if (diaryCatchImageData) {
      if (diaryCatchImageData.startsWith('data:')) {
        finalCatchImageUrl = await uploadImageToS3(diaryCatchImageData, 'diary');
      } else {
        finalCatchImageUrl = diaryCatchImageData; // 既に S3 URL（編集時など）
      }
    }

    // 2. 本文中の base64 インライン画像を S3 にアップロード
    var bodyHtml = await diaryUploadInlineImages(htmlContent);

    btn.textContent = '投稿中...';

    var editPost = diaryEditingPostId
      ? diaryPosts.find(function(p) { return p.postId === diaryEditingPostId; })
      : null;

    var payload = {
      type: 'DIARY',
      displayName: getDisplayName(currentUser),
      body: bodyHtml,
      title: title,
      date: selectedDate,
      catchImageUrl: finalCatchImageUrl || ''
    };

    var response;
    if (diaryEditingPostId) {
      // 編集モード: PUT
      response = await fetch(API_BASE_URL + AppConfig.API.POSTS + '/' + diaryEditingPostId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ sk: editPost ? editPost.SK : '' }, payload))
      });
    } else {
      // 新規作成: POST
      response = await fetch(API_BASE_URL + AppConfig.API.POSTS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ userId: currentUser.userId }, payload))
      });
    }

    if (!response.ok) throw new Error(diaryEditingPostId ? '更新失敗' : '投稿失敗');

    // リセット
    diaryEditingPostId = null;
    editor.innerHTML = '';
    if (titleInput) titleInput.value = '';
    diaryCatchImageData = null;
    document.getElementById('diaryCatchPreview').style.display = 'none';
    document.getElementById('diaryCatchPreviewImg').src = '';
    document.getElementById('diaryCatchSelectBtn').style.display = 'block';
    toggleDiaryInput();
    await loadDiaryPosts(false, true);
  } catch (error) {
    alert((diaryEditingPostId ? '更新' : '投稿') + 'に失敗しました: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

/** 本文 HTML 内の base64 画像を S3 にアップロードして URL に置換 */
async function diaryUploadInlineImages(html) {
  var tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  var imgs = tempDiv.querySelectorAll('img[src^="data:"]');
  for (var i = 0; i < imgs.length; i++) {
    imgs[i].src = await uploadImageToS3(imgs[i].src, 'diary');
  }
  return tempDiv.innerHTML;
}

function editDiary(postId) {
  var post = diaryPosts.find(function(p) { return p.postId === postId; });
  if (!post) return;

  var editDate = '';
  var editTitle = '';
  var editCatchImg = null;
  var editHtml = '';

  if (post.body !== undefined) {
    // ── 新形式 ──
    editDate = post.date || (post.createdAt ? post.createdAt.substring(0, 10) : '');
    editTitle = post.title || '';
    editCatchImg = post.catchImageUrl || null;  // S3 URL または null
    editHtml = post.body || '';
  } else {
    // ── 旧形式: text からパース ──
    var rawText = post.text || '';
    editHtml = rawText;

    var dateMatch = editHtml.match(/^\[DATE:(\d{4}-\d{2}-\d{2})\]/);
    if (dateMatch) {
      editDate = dateMatch[1];
      editHtml = editHtml.replace(dateMatch[0], '');
    } else {
      editDate = post.createdAt ? post.createdAt.substring(0, 10) : '';
    }

    var titleMatch = editHtml.match(/^\[TITLE:([^\]]+)\]/);
    if (titleMatch) {
      editTitle = titleMatch[1];
      editHtml = editHtml.replace(titleMatch[0], '');
    }

    var posMatch = editHtml.match(/^\[PHOTO_POS:(top|middle|bottom)\]/);
    if (posMatch) editHtml = editHtml.replace(posMatch[0], '');

    var catchMatch = editHtml.match(/^\[CATCH_IMG:(data:[^\]]+)\]/);
    if (catchMatch) {
      editCatchImg = catchMatch[1];  // base64（旧形式）— 更新時に S3 にアップロードされる
      editHtml = editHtml.replace(catchMatch[0], '');
    }
  }

  // フォームに値をセット
  diaryEditingPostId = postId;
  document.getElementById('diaryRichEditor').innerHTML = editHtml;
  document.getElementById('diaryTitleInput').value = editTitle;
  document.getElementById('diaryDateInput').value = editDate;

  diaryCatchImageData = editCatchImg;
  if (editCatchImg) {
    document.getElementById('diaryCatchPreviewImg').src = editCatchImg;
    document.getElementById('diaryCatchPreview').style.display = 'block';
    document.getElementById('diaryCatchSelectBtn').style.display = 'none';
  } else {
    document.getElementById('diaryCatchPreview').style.display = 'none';
    document.getElementById('diaryCatchSelectBtn').style.display = 'block';
  }

  // ヘッダー・ボタンを編集モード表示に
  var titleEl = document.getElementById('diaryInputTitle');
  if (titleEl) titleEl.innerHTML = '<i class="ph-bold ph-pencil-simple"></i> 日記を編集';
  var btn = document.getElementById('diarySubmitBtn');
  if (btn) btn.textContent = '更新する';

  // 入力エリアを開く
  var inputArea = document.getElementById('diaryInputArea');
  inputArea.style.display = 'flex';
  document.body.classList.add('modal-open');
  document.body.style.overflow = 'hidden';
}

async function deleteDiary(postId) {
  if (!confirm('この日記を削除しますか？')) return;

  var post = diaryPosts.find(function(p) { return p.postId === postId; });
  if (!post) return;

  try {
    await fetch(API_BASE_URL + AppConfig.API.POSTS + '/' + postId + '?type=DIARY&sk=' + encodeURIComponent(post.SK), {
      method: 'DELETE'
    });
    await loadDiaryPosts(false, true);
  } catch (error) {
    alert('削除に失敗しました');
  }
}
