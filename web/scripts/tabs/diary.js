// ========== ダイ日記タブ ==========
let diaryPosts = [];
let diaryPhotoData = null;
let diaryPhotoPosition = 'top'; // 'top', 'middle', 'bottom'
let diaryCatchImageData = null;
let diaryCropTarget = 'editor'; // 'editor' or 'catch'

async function initDiaryTab() {
  await loadDiaryPosts();
}

function toggleDiaryInput() {
  const inputArea = document.getElementById('diaryInputArea');
  const isVisible = inputArea.style.display !== 'none';
  inputArea.style.display = isVisible ? 'none' : 'flex';
  if (!isVisible) {
    // エディタをクリア
    document.getElementById('diaryRichEditor').innerHTML = '';
    document.getElementById('diaryTitleInput').value = '';
    // 今日の日付をデフォルトに設定
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('diaryDateInput').value = today;
    // 写真プレビューをリセット
    diaryPhotoData = null;
    document.getElementById('diaryPhotoPreview').style.display = 'none';
    // キャッチ画像リセット
    diaryCatchImageData = null;
    const catchPreview = document.getElementById('diaryCatchPreview');
    if (catchPreview) catchPreview.style.display = 'none';
    const catchPreviewImg = document.getElementById('diaryCatchPreviewImg');
    if (catchPreviewImg) catchPreviewImg.src = '';
    const catchSelectBtn = document.getElementById('diaryCatchSelectBtn');
    if (catchSelectBtn) catchSelectBtn.style.display = 'block';
  }
}

function diaryFormatText(format) {
  document.execCommand(format, false, null);
  document.getElementById('diaryRichEditor').focus();
}

function selectDiaryPhotoPosition(pos) {
  diaryPhotoPosition = pos;
  document.querySelectorAll('.diary-position-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.pos === pos);
  });
}

async function loadDiaryPosts() {
  const container = document.getElementById('diaryPosts');
  try {
    const response = await fetch(`${API_BASE_URL}${AppConfig.API.POSTS}?type=DIARY`);
    if (!response.ok) throw new Error('取得失敗');

    const data = await response.json();
    diaryPosts = data.posts || [];

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
  const container = document.getElementById('diaryPosts');
  let html = '';

  diaryPosts.forEach(post => {
    const dayNames = AppConfig.SCHEDULE.DAYS;
    const isOwner = currentUser && post.userId === currentUser.userId;

    // 日付を解析（カスタム日付または投稿日時）— DATE を先に解析する
    let title = '';
    let textContent = post.text || '';
    let dateStr;
    const dateMatch = textContent.match(/^\[DATE:(\d{4}-\d{2}-\d{2})\]/);
    if (dateMatch) {
      const customDate = new Date(dateMatch[1] + 'T00:00:00');
      dateStr = `${customDate.getMonth() + 1}/${customDate.getDate()}(${dayNames[customDate.getDay()]})`;
      textContent = textContent.replace(dateMatch[0], '');
    } else {
      const date = new Date(post.createdAt);
      dateStr = `${date.getMonth() + 1}/${date.getDate()}(${dayNames[date.getDay()]})`;
    }

    // タイトルを解析（DATE 除去後に先頭から探す）
    const titleMatch = textContent.match(/^\[TITLE:([^\]]+)\]/);
    if (titleMatch) {
      title = titleMatch[1];
      textContent = textContent.replace(titleMatch[0], '');
    }

    // 古い形式の写真位置を解析（後方互換）
    const posMatch = textContent.match(/^\[PHOTO_POS:(top|middle|bottom)\]/);
    if (posMatch) {
      textContent = textContent.replace(posMatch[0], '');
    }

    // キャッチ画像を解析
    let catchImgData = null;
    const catchImgMatch = textContent.match(/^\[CATCH_IMG:(data:[^\]]+)\]/);
    if (catchImgMatch) {
      catchImgData = catchImgMatch[1];
      textContent = textContent.replace(catchImgMatch[0], '');
    }

    // HTMLコンテンツをサニタイズ（基本的なHTML・画像は許可）
    const sanitizedText = sanitizeDiaryHtml(textContent);

    // カスタム表示名を取得
    const member = familyMembers.find(m => m.userId === post.userId);
    const displayName = member ? getDisplayName(member) : post.displayName;

    html += `<div class="diary-entry" data-post-id="${post.postId}" onclick="diaryShowDetail('${post.postId}')">
      ${catchImgData ? `<img class="diary-entry-catch" src="${catchImgData}" alt="">` : ''}
      <div class="diary-entry-body">
        <div class="diary-entry-header">
          <span class="diary-entry-date">📅 ${dateStr}</span>
          <span class="diary-entry-author">${escapeHtml(displayName)}</span>
        </div>
        ${title ? `<div class="diary-entry-title">${escapeHtml(title)}</div>` : ''}
        <div class="diary-entry-text">${sanitizedText}</div>
        ${isOwner ? `
          <div class="diary-entry-actions">
            <span class="diary-entry-action" onclick="event.stopPropagation();editDiary('${post.postId}')">✏️ 編集</span>
            <span class="diary-entry-action" onclick="event.stopPropagation();deleteDiary('${post.postId}')">🗑 削除</span>
          </div>
        ` : ''}
      </div>
    </div>`;
  });

  container.innerHTML = html;
}

function sanitizeDiaryHtml(html) {
  // 許可するタグのみ残す（b, i, br, div, img）
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  // スクリプト等の危険なタグを削除
  const scripts = tempDiv.querySelectorAll('script,style,iframe,object,embed');
  scripts.forEach(el => el.remove());

  // img タグのスタイルを調整
  const imgs = tempDiv.querySelectorAll('img');
  imgs.forEach(img => {
    img.style.maxWidth = '100%';
    img.style.borderRadius = '8px';
    img.style.margin = '8px 0';
    img.style.display = 'block';
  });

  return tempDiv.innerHTML;
}

function diaryPhotoSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  // サイズチェック（10MB以下）
  if (file.size > 10 * 1024 * 1024) {
    alert('画像サイズは10MB以下にしてください');
    return;
  }

  // 画像を圧縮してから保存
  compressImage(file, AppConfig.IMAGE.DIARY_PHOTO.maxWidth, AppConfig.IMAGE.DIARY_PHOTO.quality).then(compressedData => {
    diaryPhotoData = compressedData;
    const preview = document.getElementById('diaryPhotoPreview');
    const previewImg = document.getElementById('diaryPreviewImg');
    previewImg.src = diaryPhotoData;
    preview.style.display = 'block';
    const positionSelector = document.getElementById('diaryPhotoPosition');
    if (positionSelector) positionSelector.style.display = 'flex';
  }).catch(err => {
    console.error('画像圧縮エラー:', err);
    alert('画像の読み込みに失敗しました');
  });
}



function diaryRemovePhoto() {
  diaryPhotoData = null;
  diaryPhotoPosition = 'top';
  document.getElementById('diaryPhotoPreview').style.display = 'none';
  document.getElementById('diaryPreviewImg').src = '';
  const photoInput = document.getElementById('diaryPhotoInput');
  if (photoInput) photoInput.value = '';
  const positionSelector = document.getElementById('diaryPhotoPosition');
  if (positionSelector) positionSelector.style.display = 'none';
}

async function submitDiary() {
  const editor = document.getElementById('diaryRichEditor');
  const htmlContent = editor.innerHTML.trim();
  const textContent = editor.textContent.trim();
  const titleInput = document.getElementById('diaryTitleInput');
  const dateInput = document.getElementById('diaryDateInput');
  const title = titleInput ? titleInput.value.trim() : '';
  const selectedDate = dateInput ? dateInput.value : '';

  if (!textContent && !htmlContent.includes('<img')) {
    alert('日記の内容を入力してください');
    return;
  }

  if (!currentUser) {
    showUserSelectModal();
    return;
  }

  const btn = document.getElementById('diarySubmitBtn');
  btn.disabled = true;
  btn.textContent = '投稿中...';

  try {
    // 保存するテキスト（日付・タイトル・キャッチ画像・本文の順）
    let finalText = htmlContent;
    if (diaryCatchImageData) {
      finalText = `[CATCH_IMG:${diaryCatchImageData}]${finalText}`;
    }
    if (title) {
      finalText = `[TITLE:${title}]${finalText}`;
    }
    if (selectedDate) {
      finalText = `[DATE:${selectedDate}]${finalText}`;
    }

    const response = await fetch(`${API_BASE_URL}${AppConfig.API.POSTS}`, {
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
    // キャッチ画像リセット
    diaryCatchImageData = null;
    document.getElementById('diaryCatchPreview').style.display = 'none';
    document.getElementById('diaryCatchPreviewImg').src = '';
    document.getElementById('diaryCatchSelectBtn').style.display = 'block';
    toggleDiaryInput(); // 投稿後は入力欄を閉じる
    await loadDiaryPosts();
  } catch (error) {
    alert('投稿に失敗しました: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '投稿する';
  }
}

async function editDiary(postId) {
  const post = diaryPosts.find(p => p.postId === postId);
  if (!post) return;

  const newText = prompt('編集:', post.text);
  if (newText === null || newText.trim() === '') return;

  try {
    await fetch(`${API_BASE_URL}${AppConfig.API.POSTS}/${postId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: newText.trim(),
        type: 'DIARY',
        sk: post.SK
      })
    });
    await loadDiaryPosts();
  } catch (error) {
    alert('編集に失敗しました');
  }
}

async function deleteDiary(postId) {
  if (!confirm('この日記を削除しますか？')) return;

  const post = diaryPosts.find(p => p.postId === postId);
  if (!post) return;

  try {
    await fetch(`${API_BASE_URL}${AppConfig.API.POSTS}/${postId}?type=DIARY&sk=${encodeURIComponent(post.SK)}`, {
      method: 'DELETE'
    });
    await loadDiaryPosts();
  } catch (error) {
    alert('削除に失敗しました');
  }
}

// ========== 日記用自由トリミングモーダル ==========
let diaryCropImage = null;
let diaryCropRatio = '16:9'; // 'free', '16:9', '4:3', '1:1'
let diaryCropX = 0, diaryCropY = 0;
let diaryCropW = 200, diaryCropH = 112; // 16:9のデフォルト
let diaryDragging = false;
let diaryDragStartX, diaryDragStartY;
let diaryResizing = false;
let diaryResizeCorner = null;
let diaryPinching = false;
let diaryPinchStartDist = 0;
let diaryPinchStartW = 0;
let diaryPinchStartH = 0;

function getDiaryTouchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function diaryOpenCatchInput() {
  diaryCropTarget = 'catch';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('画像サイズは10MB以下にしてください');
      return;
    }
    const reader = new FileReader();
    reader.onload = function(ev) {
      openDiaryCropModal(ev.target.result);
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function diaryCatchRemove() {
  diaryCatchImageData = null;
  document.getElementById('diaryCatchPreview').style.display = 'none';
  document.getElementById('diaryCatchPreviewImg').src = '';
  document.getElementById('diaryCatchSelectBtn').style.display = 'block';
}

function diaryInsertPhoto() {
  diaryCropTarget = 'editor';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('画像サイズは10MB以下にしてください');
      return;
    }
    const reader = new FileReader();
    reader.onload = function(ev) {
      openDiaryCropModal(ev.target.result);
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function openDiaryCropModal(imageSrc) {
  const modal = document.getElementById('diaryCropModal');
  const canvas = document.getElementById('diaryCropCanvas');

  diaryCropImage = new Image();
  diaryCropImage.onload = function() {
    const maxW = window.innerWidth - 20;
    const maxH = window.innerHeight - 200;
    const scale = Math.min(maxW / diaryCropImage.width, maxH / diaryCropImage.height, 1);
    canvas.width = diaryCropImage.width * scale;
    canvas.height = diaryCropImage.height * scale;

    // デフォルトで16:9の選択領域を設定
    setDiaryCropRatio('16:9');
    modal.classList.add('active');

    canvas.addEventListener('mousedown', startDiaryCropDrag);
    canvas.addEventListener('touchstart', startDiaryCropDrag, { passive: false });
  };
  diaryCropImage.src = imageSrc;
}

function setDiaryCropRatio(ratio) {
  diaryCropRatio = ratio;
  const canvas = document.getElementById('diaryCropCanvas');

  // ボタンの状態を更新
  document.querySelectorAll('.diary-ratio-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ratio === ratio);
  });

  // 選択領域のサイズを計算
  const cw = canvas.width, ch = canvas.height;
  if (ratio === '16:9') {
    diaryCropW = Math.min(cw * 0.9, ch * 0.9 * 16 / 9);
    diaryCropH = diaryCropW * 9 / 16;
  } else if (ratio === '4:3') {
    diaryCropW = Math.min(cw * 0.9, ch * 0.9 * 4 / 3);
    diaryCropH = diaryCropW * 3 / 4;
  } else if (ratio === '1:1') {
    diaryCropW = diaryCropH = Math.min(cw, ch) * 0.8;
  } else { // free
    diaryCropW = cw * 0.8;
    diaryCropH = ch * 0.8;
  }
  diaryCropX = (cw - diaryCropW) / 2;
  diaryCropY = (ch - diaryCropH) / 2;
  drawDiaryCropCanvas();
}

function drawDiaryCropCanvas() {
  const canvas = document.getElementById('diaryCropCanvas');
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(diaryCropImage, 0, 0, canvas.width, canvas.height);

  // 暗いオーバーレイ
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 切り抜き領域を明るく
  ctx.save();
  ctx.beginPath();
  ctx.rect(diaryCropX, diaryCropY, diaryCropW, diaryCropH);
  ctx.clip();
  ctx.drawImage(diaryCropImage, 0, 0, canvas.width, canvas.height);
  ctx.restore();

  // 枠線
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(diaryCropX, diaryCropY, diaryCropW, diaryCropH);

  // コーナーハンドル（自由サイズの場合のみ）
  if (diaryCropRatio === 'free') {
    ctx.fillStyle = '#fff';
    const hs = 10; // ハンドルサイズ
    // 四隅
    ctx.fillRect(diaryCropX - hs/2, diaryCropY - hs/2, hs, hs);
    ctx.fillRect(diaryCropX + diaryCropW - hs/2, diaryCropY - hs/2, hs, hs);
    ctx.fillRect(diaryCropX - hs/2, diaryCropY + diaryCropH - hs/2, hs, hs);
    ctx.fillRect(diaryCropX + diaryCropW - hs/2, diaryCropY + diaryCropH - hs/2, hs, hs);
  }

  // グリッド線（3分割）
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const tw = diaryCropW / 3, th = diaryCropH / 3;
  for (let i = 1; i < 3; i++) {
    ctx.moveTo(diaryCropX + tw * i, diaryCropY);
    ctx.lineTo(diaryCropX + tw * i, diaryCropY + diaryCropH);
    ctx.moveTo(diaryCropX, diaryCropY + th * i);
    ctx.lineTo(diaryCropX + diaryCropW, diaryCropY + th * i);
  }
  ctx.stroke();
}

function startDiaryCropDrag(e) {
  e.preventDefault();
  const canvas = document.getElementById('diaryCropCanvas');
  const rect = canvas.getBoundingClientRect();

  // 2本指ピンチ開始
  if (e.touches && e.touches.length === 2) {
    diaryDragging = false;
    diaryResizing = false;
    diaryPinching = true;
    diaryPinchStartDist = getDiaryTouchDist(e.touches);
    diaryPinchStartW = diaryCropW;
    diaryPinchStartH = diaryCropH;
    document.addEventListener('touchmove', moveDiaryCropDrag, { passive: false });
    document.addEventListener('touchend', endDiaryCropDrag);
    return;
  }

  const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;

  // 自由サイズの場合、コーナーをチェック
  if (diaryCropRatio === 'free') {
    const hs = 15;
    if (cx >= diaryCropX + diaryCropW - hs && cy >= diaryCropY + diaryCropH - hs) {
      diaryResizing = true;
      diaryResizeCorner = 'br';
    } else if (cx <= diaryCropX + hs && cy <= diaryCropY + hs) {
      diaryResizing = true;
      diaryResizeCorner = 'tl';
    }
  }

  if (!diaryResizing) {
    diaryDragging = true;
    diaryDragStartX = cx - diaryCropX;
    diaryDragStartY = cy - diaryCropY;
  }

  document.addEventListener('mousemove', moveDiaryCropDrag);
  document.addEventListener('mouseup', endDiaryCropDrag);
  document.addEventListener('touchmove', moveDiaryCropDrag, { passive: false });
  document.addEventListener('touchend', endDiaryCropDrag);
}

function moveDiaryCropDrag(e) {
  e.preventDefault();
  const canvas = document.getElementById('diaryCropCanvas');
  const rect = canvas.getBoundingClientRect();

  // 2本指ピンチで切り抜き領域を拡大縮小
  if (diaryPinching && e.touches && e.touches.length === 2) {
    const dist = getDiaryTouchDist(e.touches);
    const scale = dist / diaryPinchStartDist;
    const cw = canvas.width, ch = canvas.height;
    let newW = diaryPinchStartW * scale;
    let newH = diaryPinchStartH * scale;

    // 比率を維持しながらサイズ計算
    if (diaryCropRatio === '16:9') {
      newW = Math.max(80, Math.min(cw, newW));
      newH = newW * 9 / 16;
    } else if (diaryCropRatio === '4:3') {
      newW = Math.max(80, Math.min(cw, newW));
      newH = newW * 3 / 4;
    } else if (diaryCropRatio === '1:1') {
      newW = newH = Math.max(80, Math.min(Math.min(cw, ch), newW));
    } else {
      newW = Math.max(50, Math.min(cw, newW));
      newH = Math.max(50, Math.min(ch, newH));
    }

    // 現在の中心を維持しながら移動
    const centerX = diaryCropX + diaryCropW / 2;
    const centerY = diaryCropY + diaryCropH / 2;
    diaryCropW = newW;
    diaryCropH = newH;
    diaryCropX = Math.max(0, Math.min(cw - diaryCropW, centerX - diaryCropW / 2));
    diaryCropY = Math.max(0, Math.min(ch - diaryCropH, centerY - diaryCropH / 2));
    drawDiaryCropCanvas();
    return;
  }

  const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;

  if (diaryResizing && diaryCropRatio === 'free') {
    if (diaryResizeCorner === 'br') {
      diaryCropW = Math.max(50, Math.min(canvas.width - diaryCropX, cx - diaryCropX));
      diaryCropH = Math.max(50, Math.min(canvas.height - diaryCropY, cy - diaryCropY));
    } else if (diaryResizeCorner === 'tl') {
      const newX = Math.max(0, Math.min(diaryCropX + diaryCropW - 50, cx));
      const newY = Math.max(0, Math.min(diaryCropY + diaryCropH - 50, cy));
      diaryCropW += diaryCropX - newX;
      diaryCropH += diaryCropY - newY;
      diaryCropX = newX;
      diaryCropY = newY;
    }
  } else if (diaryDragging) {
    diaryCropX = Math.max(0, Math.min(canvas.width - diaryCropW, cx - diaryDragStartX));
    diaryCropY = Math.max(0, Math.min(canvas.height - diaryCropH, cy - diaryDragStartY));
  }
  drawDiaryCropCanvas();
}

function endDiaryCropDrag() {
  diaryDragging = false;
  diaryResizing = false;
  diaryResizeCorner = null;
  diaryPinching = false;
  document.removeEventListener('mousemove', moveDiaryCropDrag);
  document.removeEventListener('mouseup', endDiaryCropDrag);
  document.removeEventListener('touchmove', moveDiaryCropDrag);
  document.removeEventListener('touchend', endDiaryCropDrag);
}

function closeDiaryCropModal() {
  document.getElementById('diaryCropModal').classList.remove('active');
  diaryCropImage = null;
}

function confirmDiaryCrop() {
  const canvas = document.getElementById('diaryCropCanvas');

  // 切り抜き用の一時キャンバス
  const scaleX = diaryCropImage.width / canvas.width;
  const scaleY = diaryCropImage.height / canvas.height;
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = Math.round(diaryCropW * scaleX);
  tempCanvas.height = Math.round(diaryCropH * scaleY);
  const tempCtx = tempCanvas.getContext('2d');

  tempCtx.drawImage(diaryCropImage,
    diaryCropX * scaleX, diaryCropY * scaleY,
    diaryCropW * scaleX, diaryCropH * scaleY,
    0, 0, tempCanvas.width, tempCanvas.height
  );

  // 圧縮（キャッチ画像は最大600px/0.75品質、本文画像は最大1200px/0.85品質）
  const maxWidth = diaryCropTarget === 'catch' ? AppConfig.IMAGE.DIARY_CATCH.maxWidth : AppConfig.IMAGE.DIARY_PHOTO.maxWidth;
  const quality = diaryCropTarget === 'catch' ? AppConfig.IMAGE.DIARY_CATCH.quality : 0.85;
  let finalCanvas = tempCanvas;
  if (tempCanvas.width > maxWidth) {
    finalCanvas = document.createElement('canvas');
    finalCanvas.width = maxWidth;
    finalCanvas.height = Math.round(tempCanvas.height * maxWidth / tempCanvas.width);
    finalCanvas.getContext('2d').drawImage(tempCanvas, 0, 0, finalCanvas.width, finalCanvas.height);
  }

  const imageData = finalCanvas.toDataURL('image/jpeg', quality);

  // キャッチ画像として保存
  if (diaryCropTarget === 'catch') {
    diaryCatchImageData = imageData;
    document.getElementById('diaryCatchPreviewImg').src = imageData;
    document.getElementById('diaryCatchPreview').style.display = 'block';
    document.getElementById('diaryCatchSelectBtn').style.display = 'none';
    diaryCropTarget = 'editor';
    closeDiaryCropModal();
    return;
  }

  // エディタに画像を挿入
  const editor = document.getElementById('diaryRichEditor');
  const img = document.createElement('img');
  img.src = imageData;
  img.style.maxWidth = '100%';
  img.style.borderRadius = '8px';
  img.style.margin = '8px 0';

  // カーソル位置に挿入
  const selection = window.getSelection();
  if (selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
    const range = selection.getRangeAt(0);
    range.insertNode(img);
    range.setStartAfter(img);
    range.collapse(true);
  } else {
    editor.appendChild(img);
  }

  // 改行を追加
  const br = document.createElement('br');
  img.after(br);

  closeDiaryCropModal();
  editor.focus();
}

// ========== [DIARY:DETAIL] 詳細表示 ==========
function diaryShowDetail(postId) {
  const post = diaryPosts.find(p => p.postId === postId);
  if (!post) return;

  const dayNames = AppConfig.SCHEDULE.DAYS;
  const isOwner = currentUser && post.userId === currentUser.userId;

  // DATE を先に解析してから TITLE を解析する
  let textContent = post.text || '';
  let title = '';
  let dateStr;
  const dateMatch = textContent.match(/^\[DATE:(\d{4}-\d{2}-\d{2})\]/);
  if (dateMatch) {
    const d = new Date(dateMatch[1] + 'T00:00:00');
    dateStr = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${dayNames[d.getDay()]})`;
    textContent = textContent.replace(dateMatch[0], '');
  } else {
    const d = new Date(post.createdAt);
    dateStr = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${dayNames[d.getDay()]})`;
  }
  const titleMatch = textContent.match(/^\[TITLE:([^\]]+)\]/);
  if (titleMatch) { title = titleMatch[1]; textContent = textContent.replace(titleMatch[0], ''); }
  const posMatch = textContent.match(/^\[PHOTO_POS:(top|middle|bottom)\]/);
  if (posMatch) { textContent = textContent.replace(posMatch[0], ''); }

  // キャッチ画像を解析
  let catchImgData = null;
  const catchImgMatch = textContent.match(/^\[CATCH_IMG:(data:[^\]]+)\]/);
  if (catchImgMatch) {
    catchImgData = catchImgMatch[1];
    textContent = textContent.replace(catchImgMatch[0], '');
  }

  const sanitizedText = sanitizeDiaryHtml(textContent);
  const member = familyMembers.find(m => m.userId === post.userId);
  const displayName = member ? getDisplayName(member) : post.displayName;

  document.getElementById('diaryDetailContent').innerHTML = `
    <div class="diary-detail-date">📅 ${dateStr}</div>
    ${title ? `<div class="diary-detail-title">${escapeHtml(title)}</div>` : ''}
    <div class="diary-detail-author">${escapeHtml(displayName)}</div>
    ${catchImgData ? `<img class="diary-detail-catch" src="${catchImgData}" alt="">` : ''}
    <div class="diary-detail-text">${sanitizedText}</div>
    ${isOwner ? `
      <div class="diary-detail-actions">
        <span class="diary-entry-action" onclick="closeDiaryDetail();editDiary('${post.postId}')">✏️ 編集</span>
        <span class="diary-entry-action" onclick="closeDiaryDetail();deleteDiary('${post.postId}')">🗑 削除</span>
      </div>
    ` : ''}
  `;
  document.getElementById('diaryDetailModal').classList.add('active');
}

function closeDiaryDetail() {
  document.getElementById('diaryDetailModal').classList.remove('active');
}
