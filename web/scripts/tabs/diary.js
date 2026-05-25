// ========== ダイ日記タブ — コアCRUD ==========
// 依存: core/config.js, core/state.js, core/utils.js, ui/user-select.js
var diaryPosts = [];
var diaryLastKey = null; // ページネーション用
var diaryPhotoData = null;
var diaryPhotoPosition = 'top';
var diaryCatchImageData = null;
var diaryCropTarget = 'editor'; // 'editor' or 'catch' — crop-free.js から参照

async function initDiaryTab() {
  await loadDiaryPosts();
}

function toggleDiaryInput() {
  var inputArea = document.getElementById('diaryInputArea');
  var isVisible = inputArea.style.display !== 'none';
  inputArea.style.display = isVisible ? 'none' : 'flex';
  if (isVisible) {
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
  } else {
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
  }
  if (!isVisible) {
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
  var textContent = post.text || '';
  var title = '';
  var dateStrShort, dateStrLong;
  var catchImgData = null;

  // DATE
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

  // TITLE
  var titleMatch = textContent.match(/^\[TITLE:([^\]]+)\]/);
  if (titleMatch) {
    title = titleMatch[1];
    textContent = textContent.replace(titleMatch[0], '');
  }

  // PHOTO_POS (後方互換)
  var posMatch = textContent.match(/^\[PHOTO_POS:(top|middle|bottom)\]/);
  if (posMatch) {
    textContent = textContent.replace(posMatch[0], '');
  }

  // CATCH_IMG
  var catchImgMatch = textContent.match(/^\[CATCH_IMG:(data:[^\]]+)\]/);
  if (catchImgMatch) {
    catchImgData = catchImgMatch[1];
    textContent = textContent.replace(catchImgMatch[0], '');
  }

  return {
    title: title,
    dateStrShort: dateStrShort,
    dateStrLong: dateStrLong,
    textContent: textContent,
    catchImgData: catchImgData
  };
}

async function loadDiaryPosts(append) {
  var container = document.getElementById('diaryPosts');
  try {
    var url = API_BASE_URL + AppConfig.API.POSTS + '?type=DIARY&limit=50';
    if (append && diaryLastKey) {
      url += '&lastKey=' + encodeURIComponent(diaryLastKey);
    } else {
      // 初回ロード時はリセット
      diaryPosts = [];
      diaryLastKey = null;
    }

    var response = await fetch(url);
    if (!response.ok) throw new Error('取得失敗');

    var data = await response.json();
    var newPosts = data.posts || [];
    diaryLastKey = data.lastEvaluatedKey || null;

    diaryPosts = append ? diaryPosts.concat(newPosts) : newPosts;

    if (diaryPosts.length === 0) {
      container.innerHTML = '<div class="diary-empty">まだ日記がありません。<br>だいずの今日の様子を記録してみよう！</div>';
      return;
    }

    renderDiaryPosts();
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
      + '<span class="diary-entry-date">📅 ' + parsed.dateStrShort + '</span>'
      + '<span class="diary-entry-author">' + escapeHtml(displayName) + '</span>'
      + '</div>'
      + (parsed.title ? '<div class="diary-entry-title">' + escapeHtml(parsed.title) + '</div>' : '')
      + '<div class="diary-entry-text">' + sanitizedText + '</div>'
      + '<div class="diary-entry-actions">'
      + '<span class="diary-entry-action ' + (isLiked ? 'liked' : '') + '" onclick="event.stopPropagation();toggleDiaryLike(\'' + post.postId + '\',\'' + sk + '\')">'
      + '❤️ ' + (likeCount > 0 ? likeCount : '')
      + '</span>'
      + '<span class="diary-entry-action" onclick="event.stopPropagation();diaryShowDetail(\'' + post.postId + '\')">'
      + '💬 ' + (commentCount > 0 ? commentCount : '')
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
}

async function loadMoreDiaryPosts() {
  await loadDiaryPosts(true);
}

function sanitizeDiaryHtml(html) {
  var tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  var scripts = tempDiv.querySelectorAll('script,style,iframe,object,embed');
  scripts.forEach(function(el) { el.remove(); });
  var imgs = tempDiv.querySelectorAll('img');
  imgs.forEach(function(img) {
    img.style.maxWidth = '100%';
    img.style.borderRadius = '8px';
    img.style.margin = '8px 0';
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
  btn.disabled = true;
  btn.textContent = '投稿中...';

  try {
    var finalText = htmlContent;
    if (diaryCatchImageData) {
      finalText = '[CATCH_IMG:' + diaryCatchImageData + ']' + finalText;
    }
    if (title) {
      finalText = '[TITLE:' + title + ']' + finalText;
    }
    if (selectedDate) {
      finalText = '[DATE:' + selectedDate + ']' + finalText;
    }

    var response = await fetch(API_BASE_URL + AppConfig.API.POSTS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'DIARY',
        userId: currentUser.userId,
        displayName: currentUser.displayName,
        text: finalText
      })
    });

    if (!response.ok) throw new Error('投稿失敗');

    editor.innerHTML = '';
    if (titleInput) titleInput.value = '';
    diaryCatchImageData = null;
    document.getElementById('diaryCatchPreview').style.display = 'none';
    document.getElementById('diaryCatchPreviewImg').src = '';
    document.getElementById('diaryCatchSelectBtn').style.display = 'block';
    toggleDiaryInput();
    await loadDiaryPosts();
  } catch (error) {
    alert('投稿に失敗しました: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '投稿する';
  }
}

async function editDiary(postId) {
  var post = diaryPosts.find(function(p) { return p.postId === postId; });
  if (!post) return;

  var newText = prompt('編集:', post.text);
  if (newText === null || newText.trim() === '') return;

  try {
    await fetch(API_BASE_URL + AppConfig.API.POSTS + '/' + postId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: newText.trim(),
        type: 'DIARY',
        sk: post.SK,
        displayName: currentUser ? getDisplayName(currentUser) : '不明'
      })
    });
    await loadDiaryPosts();
  } catch (error) {
    alert('編集に失敗しました');
  }
}

async function deleteDiary(postId) {
  if (!confirm('この日記を削除しますか？')) return;

  var post = diaryPosts.find(function(p) { return p.postId === postId; });
  if (!post) return;

  try {
    await fetch(API_BASE_URL + AppConfig.API.POSTS + '/' + postId + '?type=DIARY&sk=' + encodeURIComponent(post.SK), {
      method: 'DELETE'
    });
    await loadDiaryPosts();
  } catch (error) {
    alert('削除に失敗しました');
  }
}
