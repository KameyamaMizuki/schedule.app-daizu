// ui/crop-free.js — 日記用自由比率トリミングモーダル
// 依存: core/config.js, diary.js (diaryCatchImageData, diaryCropTarget)

var diaryCropImage = null;
var diaryCropRatio = '16:9'; // 'free', '16:9', '4:3', '1:1', '9:16'
var diaryCropDisplaySize = 'large'; // 'large'=100%, 'medium'=60%, 'small'=40%
var diaryCropX = 0, diaryCropY = 0;
var diaryCropW = 200, diaryCropH = 112;
var diaryDragging = false;
var diaryDragStartX, diaryDragStartY;
var diaryResizing = false;
var diaryResizeCorner = null;
var diaryPinching = false;
var diaryPinchStartDist = 0;
var diaryPinchStartW = 0;
var diaryPinchStartH = 0;

function getDiaryTouchDist(touches) {
  var dx = touches[0].clientX - touches[1].clientX;
  var dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function diaryOpenCatchInput() {
  diaryCropTarget = 'catch';
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('画像サイズは10MB以下にしてください');
      return;
    }
    var reader = new FileReader();
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
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('画像サイズは10MB以下にしてください');
      return;
    }
    var reader = new FileReader();
    reader.onload = function(ev) {
      openDiaryCropModal(ev.target.result);
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function openDiaryCropModal(imageSrc) {
  var modal = document.getElementById('diaryCropModal');
  var canvas = document.getElementById('diaryCropCanvas');

  // サイズ選択行はエディタ挿入時のみ表示（キャッチ画像では非表示）
  var sizeRow = document.getElementById('diarySizeRow');
  if (sizeRow) sizeRow.style.display = diaryCropTarget === 'catch' ? 'none' : 'flex';

  // サイズをリセット
  diaryCropDisplaySize = 'large';
  document.querySelectorAll('.diary-size-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.size === 'large');
  });

  diaryCropImage = new Image();
  diaryCropImage.onload = function() {
    var maxW = window.innerWidth - 20;
    var maxH = window.innerHeight - 250;
    var scale = Math.min(maxW / diaryCropImage.width, maxH / diaryCropImage.height, 1);
    canvas.width = diaryCropImage.width * scale;
    canvas.height = diaryCropImage.height * scale;

    setDiaryCropRatio('16:9');
    modal.classList.add('active');

    canvas.addEventListener('mousedown', startDiaryCropDrag);
    canvas.addEventListener('touchstart', startDiaryCropDrag, { passive: false });
  };
  diaryCropImage.src = imageSrc;
}

function setDiaryCropSize(size) {
  diaryCropDisplaySize = size;
  document.querySelectorAll('.diary-size-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.size === size);
  });
}

function setDiaryCropRatio(ratio) {
  diaryCropRatio = ratio;
  var canvas = document.getElementById('diaryCropCanvas');

  document.querySelectorAll('.diary-ratio-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.ratio === ratio);
  });

  var cw = canvas.width, ch = canvas.height;
  if (ratio === '16:9') {
    diaryCropW = Math.min(cw * 0.9, ch * 0.9 * 16 / 9);
    diaryCropH = diaryCropW * 9 / 16;
  } else if (ratio === '4:3') {
    diaryCropW = Math.min(cw * 0.9, ch * 0.9 * 4 / 3);
    diaryCropH = diaryCropW * 3 / 4;
  } else if (ratio === '1:1') {
    diaryCropW = diaryCropH = Math.min(cw, ch) * 0.8;
  } else if (ratio === '9:16') {
    diaryCropH = Math.min(ch * 0.9, cw * 0.9 * 16 / 9);
    diaryCropW = diaryCropH * 9 / 16;
    // 縦型のデフォルトサイズを「中」に設定
    if (diaryCropTarget !== 'catch') { setDiaryCropSize('medium'); }
  } else if (ratio === '3:4') {
    diaryCropH = Math.min(ch * 0.9, cw * 0.9 * 4 / 3);
    diaryCropW = diaryCropH * 3 / 4;
    // 縦型のデフォルトサイズを「中」に設定
    if (diaryCropTarget !== 'catch') { setDiaryCropSize('medium'); }
  } else { // free
    diaryCropW = cw * 0.8;
    diaryCropH = ch * 0.8;
  }
  diaryCropX = (cw - diaryCropW) / 2;
  diaryCropY = (ch - diaryCropH) / 2;
  drawDiaryCropCanvas();
}

function drawDiaryCropCanvas() {
  var canvas = document.getElementById('diaryCropCanvas');
  var ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(diaryCropImage, 0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.beginPath();
  ctx.rect(diaryCropX, diaryCropY, diaryCropW, diaryCropH);
  ctx.clip();
  ctx.drawImage(diaryCropImage, 0, 0, canvas.width, canvas.height);
  ctx.restore();

  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(diaryCropX, diaryCropY, diaryCropW, diaryCropH);

  if (diaryCropRatio === 'free') {
    ctx.fillStyle = '#fff';
    var hs = 10;
    ctx.fillRect(diaryCropX - hs/2, diaryCropY - hs/2, hs, hs);
    ctx.fillRect(diaryCropX + diaryCropW - hs/2, diaryCropY - hs/2, hs, hs);
    ctx.fillRect(diaryCropX - hs/2, diaryCropY + diaryCropH - hs/2, hs, hs);
    ctx.fillRect(diaryCropX + diaryCropW - hs/2, diaryCropY + diaryCropH - hs/2, hs, hs);
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  var tw = diaryCropW / 3, th = diaryCropH / 3;
  for (var i = 1; i < 3; i++) {
    ctx.moveTo(diaryCropX + tw * i, diaryCropY);
    ctx.lineTo(diaryCropX + tw * i, diaryCropY + diaryCropH);
    ctx.moveTo(diaryCropX, diaryCropY + th * i);
    ctx.lineTo(diaryCropX + diaryCropW, diaryCropY + th * i);
  }
  ctx.stroke();
}

function startDiaryCropDrag(e) {
  e.preventDefault();
  var canvas = document.getElementById('diaryCropCanvas');
  var rect = canvas.getBoundingClientRect();

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

  var cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  var cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;

  if (diaryCropRatio === 'free') {
    var hs = 15;
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
  var canvas = document.getElementById('diaryCropCanvas');
  var rect = canvas.getBoundingClientRect();

  if (diaryPinching && e.touches && e.touches.length === 2) {
    var dist = getDiaryTouchDist(e.touches);
    var scale = dist / diaryPinchStartDist;
    var cw = canvas.width, ch = canvas.height;
    var newW = diaryPinchStartW * scale;
    var newH = diaryPinchStartH * scale;

    if (diaryCropRatio === '16:9') {
      newW = Math.max(80, Math.min(cw, newW));
      newH = newW * 9 / 16;
    } else if (diaryCropRatio === '4:3') {
      newW = Math.max(80, Math.min(cw, newW));
      newH = newW * 3 / 4;
    } else if (diaryCropRatio === '1:1') {
      newW = newH = Math.max(80, Math.min(Math.min(cw, ch), newW));
    } else if (diaryCropRatio === '9:16') {
      newH = Math.max(80, Math.min(ch, newH));
      newW = newH * 9 / 16;
    } else if (diaryCropRatio === '3:4') {
      newH = Math.max(80, Math.min(ch, newH));
      newW = newH * 3 / 4;
    } else {
      newW = Math.max(50, Math.min(cw, newW));
      newH = Math.max(50, Math.min(ch, newH));
    }

    var centerX = diaryCropX + diaryCropW / 2;
    var centerY = diaryCropY + diaryCropH / 2;
    diaryCropW = newW;
    diaryCropH = newH;
    diaryCropX = Math.max(0, Math.min(cw - diaryCropW, centerX - diaryCropW / 2));
    diaryCropY = Math.max(0, Math.min(ch - diaryCropH, centerY - diaryCropH / 2));
    drawDiaryCropCanvas();
    return;
  }

  var cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  var cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;

  if (diaryResizing && diaryCropRatio === 'free') {
    if (diaryResizeCorner === 'br') {
      diaryCropW = Math.max(50, Math.min(canvas.width - diaryCropX, cx - diaryCropX));
      diaryCropH = Math.max(50, Math.min(canvas.height - diaryCropY, cy - diaryCropY));
    } else if (diaryResizeCorner === 'tl') {
      var newX = Math.max(0, Math.min(diaryCropX + diaryCropW - 50, cx));
      var newY = Math.max(0, Math.min(diaryCropY + diaryCropH - 50, cy));
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
  var canvas = document.getElementById('diaryCropCanvas');

  var scaleX = diaryCropImage.width / canvas.width;
  var scaleY = diaryCropImage.height / canvas.height;
  var tempCanvas = document.createElement('canvas');
  tempCanvas.width = Math.round(diaryCropW * scaleX);
  tempCanvas.height = Math.round(diaryCropH * scaleY);
  var tempCtx = tempCanvas.getContext('2d');

  tempCtx.drawImage(diaryCropImage,
    diaryCropX * scaleX, diaryCropY * scaleY,
    diaryCropW * scaleX, diaryCropH * scaleY,
    0, 0, tempCanvas.width, tempCanvas.height
  );

  var maxWidth = diaryCropTarget === 'catch' ? AppConfig.IMAGE.DIARY_CATCH.maxWidth : AppConfig.IMAGE.DIARY_PHOTO.maxWidth;
  var quality = diaryCropTarget === 'catch' ? AppConfig.IMAGE.DIARY_CATCH.quality : 0.85;
  var finalCanvas = tempCanvas;
  if (tempCanvas.width > maxWidth) {
    finalCanvas = document.createElement('canvas');
    finalCanvas.width = maxWidth;
    finalCanvas.height = Math.round(tempCanvas.height * maxWidth / tempCanvas.width);
    finalCanvas.getContext('2d').drawImage(tempCanvas, 0, 0, finalCanvas.width, finalCanvas.height);
  }

  var imageData = finalCanvas.toDataURL('image/jpeg', quality);

  if (diaryCropTarget === 'catch') {
    diaryCatchImageData = imageData;
    document.getElementById('diaryCatchPreviewImg').src = imageData;
    document.getElementById('diaryCatchPreview').style.display = 'block';
    document.getElementById('diaryCatchSelectBtn').style.display = 'none';
    diaryCropTarget = 'editor';
    closeDiaryCropModal();
    return;
  }

  var editor = document.getElementById('diaryRichEditor');
  var img = document.createElement('img');
  img.src = imageData;
  // 表示サイズをdata属性とstyleに設定
  var sizeMap = { large: '100%', medium: '60%', small: '40%' };
  var displayWidth = sizeMap[diaryCropDisplaySize] || '100%';
  img.dataset.size = diaryCropDisplaySize;
  img.style.width = displayWidth;
  img.style.maxWidth = displayWidth;
  img.style.borderRadius = '8px';
  img.style.margin = '8px auto';
  img.style.display = 'block';

  var selection = window.getSelection();
  if (selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
    var range = selection.getRangeAt(0);
    range.insertNode(img);
    range.setStartAfter(img);
    range.collapse(true);
  } else {
    editor.appendChild(img);
  }

  var br = document.createElement('br');
  img.after(br);

  closeDiaryCropModal();
  editor.focus();
}
