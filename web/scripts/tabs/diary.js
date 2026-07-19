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
      catchImgData: post.catchImageUrl || null,  // S3 URL または null
      dateObj: dNew  // 年月ジャンプ・1年前バナー用の生Date
    };
  }

  // ── 旧形式: text フィールドにブラケット記法 ──
  var textContent = post.text || '';
  var title = '';
  var dateStrShort, dateStrLong;
  var catchImgData = null;
  var dateObj;

  var dateMatch = textContent.match(/^\[DATE:(\d{4}-\d{2}-\d{2})\]/);
  if (dateMatch) {
    var customDate = new Date(dateMatch[1] + 'T00:00:00');
    dateStrShort = (customDate.getMonth() + 1) + '/' + customDate.getDate() + '(' + dayNames[customDate.getDay()] + ')';
    dateStrLong = customDate.getFullYear() + '年' + (customDate.getMonth() + 1) + '月' + customDate.getDate() + '日(' + dayNames[customDate.getDay()] + ')';
    textContent = textContent.replace(dateMatch[0], '');
    dateObj = customDate;
  } else {
    var d = new Date(post.createdAt);
    dateStrShort = (d.getMonth() + 1) + '/' + d.getDate() + '(' + dayNames[d.getDay()] + ')';
    dateStrLong = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日(' + dayNames[d.getDay()] + ')';
    dateObj = d;
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

  return { title: title, dateStrShort: dateStrShort, dateStrLong: dateStrLong, textContent: textContent, catchImgData: catchImgData, dateObj: dateObj };
}

// ========== 一覧描画ヘルパー（Task24: マガジン型） ==========

// サムネイル抽出: catchImgData優先、なければ本文HTML先頭の<img>にフォールバック（新旧形式共通）
function diaryExtractThumb(parsed) {
  if (parsed.catchImgData) return parsed.catchImgData;
  if (!parsed.textContent) return null;
  var tempDiv = document.createElement('div');
  tempDiv.innerHTML = parsed.textContent;
  var img = tempDiv.querySelector('img');
  return img ? img.getAttribute('src') : null;
}

// 抜粋: HTMLタグ除去後の先頭maxLen字
function diaryExtractExcerpt(html, maxLen) {
  if (!html) return '';
  var tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  var text = (tempDiv.textContent || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLen ? text.substring(0, maxLen) : text;
}

// 表示用タイトル: タイトルがあればそれ、なければ本文抜粋、それも空なら「無題の日記」（escapeHtml済みで返す）
function diaryDisplayTitle(parsed, excerptLen) {
  if (parsed.title) return escapeHtml(parsed.title);
  var excerpt = diaryExtractExcerpt(parsed.textContent, excerptLen || 40);
  return excerpt ? escapeHtml(excerpt) : '無題の日記';
}

// ヒーローカード（最新1件）
function diaryBuildHeroHtml(post, parsed, displayName) {
  var thumb = diaryExtractThumb(parsed);
  var titleHtml = diaryDisplayTitle(parsed, 40);
  var metaHtml = '<div class="dj-hero-meta">'
    + '<span class="dj-hero-date"><i class="ph-bold ph-calendar"></i> ' + parsed.dateStrShort + '</span>'
    + '<span class="dj-hero-author">' + escapeHtml(displayName) + '</span>'
    + '</div>';

  if (thumb) {
    return '<button type="button" class="dj-hero" onclick="diaryShowDetail(\'' + post.postId + '\')">'
      + '<img class="dj-hero-img" src="' + thumb + '" alt="" loading="lazy" decoding="async">'
      + '<div class="dj-hero-overlay">'
      + '<div class="dj-hero-title">' + titleHtml + '</div>'
      + metaHtml
      + '</div>'
      + '</button>';
  }
  return '<button type="button" class="dj-hero dj-hero-token" onclick="diaryShowDetail(\'' + post.postId + '\')">'
    + '<div class="dj-hero-title">' + titleHtml + '</div>'
    + metaHtml
    + '</button>';
}

// 2列グリッドの小カード
function diaryBuildCardHtml(post, parsed) {
  var thumb = diaryExtractThumb(parsed);
  var hasTitle = !!parsed.title;

  if (thumb) {
    var photoTitle = hasTitle ? escapeHtml(parsed.title) : diaryDisplayTitle(parsed, 24);
    return '<button type="button" class="dj-card dj-card-photo" onclick="diaryShowDetail(\'' + post.postId + '\')">'
      + '<img class="dj-card-img" src="' + thumb + '" alt="" loading="lazy" decoding="async">'
      + '<div class="dj-card-body">'
      + '<div class="dj-card-title">' + photoTitle + '</div>'
      + '<div class="dj-card-date">' + parsed.dateStrShort + '</div>'
      + '</div>'
      + '</button>';
  }

  var excerpt = diaryExtractExcerpt(parsed.textContent, 50);
  var textTitle = hasTitle ? escapeHtml(parsed.title) : (excerpt ? escapeHtml(excerpt) : '無題の日記');
  return '<button type="button" class="dj-card dj-card-text" onclick="diaryShowDetail(\'' + post.postId + '\')">'
    + '<div class="dj-card-title">' + textTitle + '</div>'
    + '<div class="dj-card-date">' + parsed.dateStrShort + '</div>'
    + (hasTitle && excerpt ? '<div class="dj-card-excerpt">' + escapeHtml(excerpt) + '</div>' : '')
    + '</button>';
}

// 「1年前のきょう」候補: 読み込み済みデータから target(今日-1年) ±3日以内で最も近い記事を探す
function diaryFindAnniversaryPost() {
  var today = new Date();
  var target = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  var msPerDay = 24 * 60 * 60 * 1000;
  var best = null;
  var bestDiff = Infinity;

  diaryPosts.forEach(function(post) {
    var parsed = parseDiaryPost(post);
    if (!parsed.dateObj || isNaN(parsed.dateObj.getTime())) return;
    var postDay = new Date(parsed.dateObj.getFullYear(), parsed.dateObj.getMonth(), parsed.dateObj.getDate());
    var diff = Math.abs(postDay.getTime() - target.getTime());
    if (diff <= 3 * msPerDay && diff < bestDiff) {
      bestDiff = diff;
      best = { post: post, parsed: parsed };
    }
  });
  return best;
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
    var query = '?type=DIARY&limit=50';
    if (append && diaryLastKey) {
      // 追加読み込みは従来どおりネットワーク直
      query += '&lastKey=' + encodeURIComponent(diaryLastKey);
      var data = await Api.getPosts(query, null, { force: true });
      diaryLastKey = data.lastEvaluatedKey || null;
      diaryPosts = diaryPosts.concat(data.posts || []);
      renderDiaryPosts();
    } else {
      // 初回はSWR: キャッシュ即表示→裏で最新化して差分があれば再描画
      diaryPosts = [];
      diaryLastKey = null;
      applyList(await Api.getPosts(query, applyList, { force: force }));
    }
  } catch (error) {
    console.error('日記読み込みエラー:', error);
    container.innerHTML = '<div class="diary-empty">日記の読み込みに失敗しました</div>';
  }
}

function renderDiaryPosts() {
  var container = document.getElementById('diaryPosts');
  var html = '';

  // 「1年前のきょう」バナー（読み込み済みデータに該当記事があれば最上部）
  var anniversary = diaryFindAnniversaryPost();
  if (anniversary) {
    html += '<button type="button" class="dj-anniversary" onclick="diaryShowDetail(\'' + anniversary.post.postId + '\')">'
      + '<i class="ph-bold ph-clock-counter-clockwise"></i>'
      + '<span class="dj-anniversary-text">1年前のきょう: ' + diaryDisplayTitle(anniversary.parsed, 30) + '</span>'
      + '<i class="ph-bold ph-caret-right"></i>'
      + '</button>';
  }

  // ヒーローカード（最新1件）
  var heroPost = diaryPosts[0];
  var heroParsed = parseDiaryPost(heroPost);
  var heroMember = familyMembers.find(function(m) { return m.userId === heroPost.userId; });
  var heroName = heroMember ? getDisplayName(heroMember) : heroPost.displayName;
  html += diaryBuildHeroHtml(heroPost, heroParsed, heroName);

  // 以降: 月見出し + 2列グリッド（年月が変わるたびに見出しを新設）
  var lastYear = (heroParsed.dateObj && !isNaN(heroParsed.dateObj.getTime())) ? heroParsed.dateObj.getFullYear() : null;
  var currentKey = null;
  var gridOpen = false;

  diaryPosts.slice(1).forEach(function(post) {
    var parsed = parseDiaryPost(post);
    var hasDate = parsed.dateObj && !isNaN(parsed.dateObj.getTime());
    var y = hasDate ? parsed.dateObj.getFullYear() : 0;
    var m = hasDate ? (parsed.dateObj.getMonth() + 1) : 0;
    var key = y + '-' + m;

    if (key !== currentKey) {
      if (gridOpen) html += '</div>';
      var label = (y !== lastYear) ? (y + '年' + m + '月') : (m + '月');
      html += '<div class="dj-month-heading" id="diary-month-' + key + '" onclick="openDiaryArchivePicker()">— ' + escapeHtml(label) + ' —</div>';
      html += '<div class="dj-grid">';
      gridOpen = true;
      currentKey = key;
      lastYear = y;
    }

    html += diaryBuildCardHtml(post, parsed);
  });
  if (gridOpen) html += '</div>';

  // 「もっと見る」ボタン（次ページがある場合のみ）
  if (diaryLastKey) {
    html += '<div class="diary-loadmore-wrap">'
      + '<button class="diary-loadmore-btn" onclick="loadMoreDiaryPosts()">もっと見る</button>'
      + '</div>';
  }

  container.innerHTML = html;
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

async function loadMoreDiaryPosts() {
  await loadDiaryPosts(true);
}

// 記事本文のサニタイズ。インライン画像は編集時のサイズ指定(data-size)によらず
// 記事画面では常に全幅角丸で表示する（Task24: 読B統一レイアウト）
function sanitizeDiaryHtml(html) {
  var tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  var scripts = tempDiv.querySelectorAll('script,style,iframe,object,embed');
  scripts.forEach(function(el) { el.remove(); });
  var imgs = tempDiv.querySelectorAll('img');
  imgs.forEach(function(img) {
    img.style.width = '100%';
    img.style.maxWidth = '100%';
    img.style.borderRadius = '10px';
    img.style.margin = '12px 0';
    img.style.display = 'block';
  });
  return tempDiv.innerHTML;
}

// ========== 年月ジャンプ（アーカイブピッカー） ==========

// 読み込み済みデータに存在する年月を新しい順・重複なしで列挙
function diaryArchiveEntries() {
  var seen = {};
  var entries = [];
  diaryPosts.forEach(function(post) {
    var parsed = parseDiaryPost(post);
    if (!parsed.dateObj || isNaN(parsed.dateObj.getTime())) return;
    var y = parsed.dateObj.getFullYear();
    var m = parsed.dateObj.getMonth() + 1;
    var key = y + '-' + m;
    if (seen[key]) return;
    seen[key] = true;
    entries.push({ key: key, label: y + '年' + m + '月' });
  });
  return entries;
}

function renderDiaryArchiveList() {
  var listEl = document.getElementById('diaryArchiveList');
  if (!listEl) return;
  var entries = diaryArchiveEntries();
  listEl.innerHTML = entries.length
    ? entries.map(function(e) {
        return '<button type="button" class="diary-archive-item" onclick="diaryJumpToMonth(\'' + e.key + '\')">' + escapeHtml(e.label) + '</button>';
      }).join('')
    : '<div class="diary-archive-empty">まだ日記がありません</div>';

  var moreBtn = document.getElementById('diaryArchiveLoadMoreBtn');
  if (moreBtn) moreBtn.style.display = diaryLastKey ? 'block' : 'none';
}

function openDiaryArchivePicker() {
  renderDiaryArchiveList();
  var modal = document.getElementById('diaryArchiveModal');
  if (modal) modal.classList.add('active');
}

function closeDiaryArchiveModal() {
  var modal = document.getElementById('diaryArchiveModal');
  if (modal) modal.classList.remove('active');
}

// 「さらに過去を読み込む」— データ末尾(lastKeyなし)まで繰り返し可能
async function diaryArchiveLoadOlder() {
  var btn = document.getElementById('diaryArchiveLoadMoreBtn');
  if (btn) { btn.disabled = true; btn.textContent = '読み込み中...'; }
  try {
    await loadMoreDiaryPosts();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'さらに過去を読み込む'; }
    renderDiaryArchiveList();
  }
}

// 該当年月の見出しへスクロール（ヒーロー自身の年月ならトップへ）
function diaryJumpToMonth(key) {
  closeDiaryArchiveModal();

  var target = document.getElementById('diary-month-' + key);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  var heroPost = diaryPosts[0];
  if (!heroPost) return;
  var heroParsed = parseDiaryPost(heroPost);
  if (!heroParsed.dateObj || isNaN(heroParsed.dateObj.getTime())) return;
  var heroKey = heroParsed.dateObj.getFullYear() + '-' + (heroParsed.dateObj.getMonth() + 1);
  if (heroKey === key) {
    var container = document.getElementById('diaryPosts');
    if (container) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
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
      date: selectedDate
    };

    if (diaryEditingPostId) {
      // 編集モード: PUT — catchImageUrl: '' で画像をクリアできるよう常に送信
      payload.catchImageUrl = finalCatchImageUrl || '';
      await Api.updatePost(diaryEditingPostId, Object.assign({ sk: editPost ? editPost.SK : '' }, payload));
    } else {
      // 新規作成: POST — catchImageUrl が空の場合は送信しない（Invalid url エラーを回避）
      if (finalCatchImageUrl) {
        payload.catchImageUrl = finalCatchImageUrl;
      }
      await Api.createPost(Object.assign({ userId: currentUser.userId }, payload));
    }

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
    await Api.deletePost(postId, 'DIARY', post.SK);
    await loadDiaryPosts(false, true);
  } catch (error) {
    alert('削除に失敗しました');
  }
}
