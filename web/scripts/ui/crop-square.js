// ui/crop-square.js — 正方形画像切り抜きモーダル
// 依存: core/config.js

var cropImage = null;
var cropStartX = 0, cropStartY = 0;
var cropSize = 200;
var _cropCallback = null;

function openCropModal(imageSrc, callback) {
  _cropCallback = callback || null;
  var modal = document.getElementById('cropModal');
  var canvas = document.getElementById('cropCanvas');

  cropImage = new Image();
  cropImage.onload = function() {
    var maxSize = Math.min(window.innerWidth - 40, window.innerHeight - 200);
    var scale = Math.min(maxSize / cropImage.width, maxSize / cropImage.height);
    canvas.width = cropImage.width * scale;
    canvas.height = cropImage.height * scale;

    cropSize = Math.min(canvas.width, canvas.height) * 0.8;
    cropStartX = (canvas.width - cropSize) / 2;
    cropStartY = (canvas.height - cropSize) / 2;

    drawCropCanvas();
    modal.classList.add('active');

    canvas.addEventListener('mousedown', startCropDrag);
    canvas.addEventListener('touchstart', startCropDrag, { passive: false });
  };
  cropImage.src = imageSrc;
}

function drawCropCanvas() {
  var canvas = document.getElementById('cropCanvas');
  var ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(cropImage, 0, 0, canvas.width, canvas.height);

  // 暗いオーバーレイ
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 切り抜き領域を明るく
  ctx.clearRect(cropStartX, cropStartY, cropSize, cropSize);
  ctx.drawImage(cropImage,
    cropStartX / canvas.width * cropImage.width,
    cropStartY / canvas.height * cropImage.height,
    cropSize / canvas.width * cropImage.width,
    cropSize / canvas.height * cropImage.height,
    cropStartX, cropStartY, cropSize, cropSize
  );

  // 枠線
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(cropStartX, cropStartY, cropSize, cropSize);

  // グリッド線（3分割）
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  var third = cropSize / 3;
  ctx.beginPath();
  ctx.moveTo(cropStartX + third, cropStartY);
  ctx.lineTo(cropStartX + third, cropStartY + cropSize);
  ctx.moveTo(cropStartX + third * 2, cropStartY);
  ctx.lineTo(cropStartX + third * 2, cropStartY + cropSize);
  ctx.moveTo(cropStartX, cropStartY + third);
  ctx.lineTo(cropStartX + cropSize, cropStartY + third);
  ctx.moveTo(cropStartX, cropStartY + third * 2);
  ctx.lineTo(cropStartX + cropSize, cropStartY + third * 2);
  ctx.stroke();
}

var isDragging = false;
var dragStartX, dragStartY;
var isPinching = false;
var pinchStartDistance = 0;
var pinchStartCropSize = 200;

function getPinchDistance(e) {
  var dx = e.touches[0].clientX - e.touches[1].clientX;
  var dy = e.touches[0].clientY - e.touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function startCropDrag(e) {
  e.preventDefault();
  if (e.touches && e.touches.length === 2) {
    isPinching = true;
    isDragging = false;
    pinchStartDistance = getPinchDistance(e);
    pinchStartCropSize = cropSize;
    document.addEventListener('touchmove', moveCropDrag, { passive: false });
    document.addEventListener('touchend', endCropDrag);
    return;
  }
  isDragging = true;
  isPinching = false;
  var pos = getEventPos(e);
  dragStartX = pos.x - cropStartX;
  dragStartY = pos.y - cropStartY;

  document.addEventListener('mousemove', moveCropDrag);
  document.addEventListener('mouseup', endCropDrag);
  document.addEventListener('touchmove', moveCropDrag, { passive: false });
  document.addEventListener('touchend', endCropDrag);
}

function moveCropDrag(e) {
  if (!isDragging && !isPinching) return;
  e.preventDefault();
  var canvas = document.getElementById('cropCanvas');

  if (isPinching && e.touches && e.touches.length === 2) {
    var currentDistance = getPinchDistance(e);
    var scale = currentDistance / pinchStartDistance;
    var minSize = 50;
    var maxSize = Math.min(canvas.width, canvas.height);
    var newSize = Math.max(minSize, Math.min(maxSize, pinchStartCropSize * scale));
    var centerX = cropStartX + cropSize / 2;
    var centerY = cropStartY + cropSize / 2;
    cropSize = newSize;
    cropStartX = Math.max(0, Math.min(canvas.width - cropSize, centerX - cropSize / 2));
    cropStartY = Math.max(0, Math.min(canvas.height - cropSize, centerY - cropSize / 2));
    drawCropCanvas();
    return;
  }

  if (isDragging) {
    var pos = getEventPos(e);
    cropStartX = Math.max(0, Math.min(canvas.width - cropSize, pos.x - dragStartX));
    cropStartY = Math.max(0, Math.min(canvas.height - cropSize, pos.y - dragStartY));
    drawCropCanvas();
  }
}

function endCropDrag() {
  isDragging = false;
  isPinching = false;
  document.removeEventListener('mousemove', moveCropDrag);
  document.removeEventListener('mouseup', endCropDrag);
  document.removeEventListener('touchmove', moveCropDrag);
  document.removeEventListener('touchend', endCropDrag);
}

function getEventPos(e) {
  var canvas = document.getElementById('cropCanvas');
  var rect = canvas.getBoundingClientRect();
  var clientX = e.touches ? e.touches[0].clientX : e.clientX;
  var clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
}

function closeCropModal() {
  document.getElementById('cropModal').classList.remove('active');
  var chirolInput = document.getElementById('chirolImageInput');
  if (chirolInput) chirolInput.value = '';
  var wanstaInput = document.getElementById('wanstaPhotoInput');
  if (wanstaInput) wanstaInput.value = '';
}

function confirmCrop() {
  var canvas = document.getElementById('cropCanvas');

  var tempCanvas = document.createElement('canvas');
  tempCanvas.width = AppConfig.IMAGE.CROP_RESULT.maxWidth;
  tempCanvas.height = AppConfig.IMAGE.CROP_RESULT.maxWidth;
  var tempCtx = tempCanvas.getContext('2d');

  var scaleX = cropImage.width / canvas.width;
  var scaleY = cropImage.height / canvas.height;

  tempCtx.drawImage(cropImage,
    cropStartX * scaleX, cropStartY * scaleY,
    cropSize * scaleX, cropSize * scaleY,
    0, 0, AppConfig.IMAGE.CROP_RESULT.maxWidth, AppConfig.IMAGE.CROP_RESULT.maxWidth
  );

  var result = tempCanvas.toDataURL('image/jpeg', AppConfig.IMAGE.CROP_RESULT.quality);

  closeCropModal();

  if (_cropCallback) {
    _cropCallback(result);
    _cropCallback = null;
  }
}
