// ========== [HOME:CHIROLINFO] 知ってるチロル/だいず機能 ==========
// 依存（グローバル参照）:
//   state.js  : homeDogImages, homeDaizuImages, API_BASE_URL
//   modals.js : openCropModal
//   home.js   : homeState, homeHideAllAreas, updateHomeFab,
//               homeSetRandomDogImage, homeSetSpeechText, homeReturnToMenu,
//               homeHitokotoList

let chirolSelectedTag = null;
let chirolCroppedImageData = null;

let selectedInfoDog = 'chirol'; // 'chirol' or 'daizu'

function homeStartChirolInfo() {
  homeState = 'dog_select';
  homeSetRandomDogImage('happy');
  homeSetSpeechText('誰のことを教えてくれるんだ？');
  homeHideAllAreas();
  updateHomeFab();
  document.getElementById('dogSelectArea').classList.add('active');
}

function selectDogForInfo(dog) {
  selectedInfoDog = dog;
  homeState = 'chirol_choice';
  const dogName = dog === 'chirol' ? 'チロル' : 'だいず';
  document.getElementById('infoTargetLabel').textContent = `${dogName}に何を追加する？`;
  // だいずは丁寧語、チロルは粗野な言葉遣い
  if (dog === 'daizu') {
    homeSetSpeechText(`${dogName}のことを教えてください！`);
    // だいず画像に変更
    setHomeDogImageForDaizu();
  } else {
    homeSetSpeechText(`${dogName}のことを教えてくれ！`);
    homeSetRandomDogImage('normal');
  }
  homeHideAllAreas();
  document.getElementById('chirolChoiceArea').classList.add('active');
}

// だいず用の画像設定（homeDaizuImagesから取得）
function setHomeDogImageForDaizu(expression = 'normal') {
  const images = homeDaizuImages[expression] || homeDaizuImages.normal || [];
  const img = document.getElementById('homeDogImage');
  if (images.length > 0) {
    const randomImg = images[Math.floor(Math.random() * images.length)];
    img.src = randomImg;
  }
  img.onerror = function() {
    this.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="80">🐕</text></svg>';
  };
}

function chirolBackToDogSelect() {
  homeState = 'dog_select';
  homeHideAllAreas();
  document.getElementById('dogSelectArea').classList.add('active');
}

function chirolStartHitokoto() {
  homeState = 'chirol_hitokoto';
  if (selectedInfoDog === 'daizu') {
    setHomeDogImageForDaizu();
    homeSetSpeechText('なんて言えばいいですか？');
    document.getElementById('chirolHitokotoText').placeholder = 'だいずの一言を入力...';
  } else {
    homeSetRandomDogImage('thinking');
    homeSetSpeechText('オレに何を言わせたいんだ？');
    document.getElementById('chirolHitokotoText').placeholder = 'チロルの一言を入力...';
  }
  homeHideAllAreas();
  document.getElementById('chirolHitokotoArea').classList.add('active');
  document.getElementById('chirolHitokotoText').value = '';
  document.getElementById('chirolHitokotoCount').textContent = '0';
}

function chirolStartImage() {
  homeState = 'chirol_image';
  chirolSelectedTag = null;
  chirolCroppedImageData = null;
  if (selectedInfoDog === 'daizu') {
    setHomeDogImageForDaizu();
    homeSetSpeechText('わたしのベストショットを<br>見せてください！');
  } else {
    homeSetRandomDogImage('happy');
    homeSetSpeechText('オレのベストショットを<br>見せてくれ！');
  }
  homeHideAllAreas();
  document.getElementById('chirolImageArea').classList.add('active');
  document.getElementById('chirolImagePreview').classList.remove('active');
  document.querySelector('.image-preview-container').classList.remove('has-image');
  document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('chirolImageSubmitBtn').disabled = true;
}

function chirolCancel() {
  homeState = 'chirol_cancel';
  if (selectedInfoDog === 'daizu') {
    setHomeDogImageForDaizu();
    homeSetSpeechText('わたしのこと、知らないんですか？');
  } else {
    homeSetRandomDogImage('sad');
    homeSetSpeechText('オレのこと、知らないのか？');
  }
  homeHideAllAreas();
  homeReturnToMenu(AppConfig.TIMING.MSG_DISPLAY);
}

function chirolBackToChoice() {
  homeState = 'chirol_choice';
  if (selectedInfoDog === 'daizu') {
    setHomeDogImageForDaizu();
    homeSetSpeechText('どちらにしますか？');
  } else {
    homeSetRandomDogImage('happy');
    homeSetSpeechText('どっちにする？');
  }
  homeHideAllAreas();
  document.getElementById('chirolChoiceArea').classList.add('active');
}

// 一言入力の文字数カウントは home.page.js に移動済み

async function chirolSubmitHitokoto() {
  const text = document.getElementById('chirolHitokotoText').value.trim();
  if (!text) {
    alert(selectedInfoDog === 'daizu' ? '一言を入力してください！' : '一言を入力してくれ！');
    return;
  }

  homeState = 'chirol_saving';
  if (selectedInfoDog === 'daizu') {
    setHomeDogImageForDaizu();
    homeSetSpeechText('ちょっと待ってください...');
  } else {
    homeSetRandomDogImage('thinking');
    homeSetSpeechText('ちょっと待ってくれ...');
  }
  homeHideAllAreas();
  document.getElementById('homeProgressContainer').classList.add('active');

  try {
    // Note: Currently hitokoto is saved to the same table for both chirol and daizu
    // A 'dog' field could be added to the API for differentiation
    const [res] = await Promise.all([
      fetch(`${API_BASE_URL}${AppConfig.API.CHIROL_HITOKOTO}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, dog: selectedInfoDog })
      }),
      new Promise(r => setTimeout(r, AppConfig.TIMING.MSG_DISPLAY))
    ]);
    if (!res.ok) throw new Error('保存失敗');

    // 保存成功 → 一言リストにも追加
    homeHitokotoList.push(text);
    window.wanstaLoaded = false; // WANstaを次回タブ切替時に再フェッチ

    homeState = 'chirol_done';
    document.getElementById('homeProgressContainer').classList.remove('active');
    if (selectedInfoDog === 'daizu') {
      setHomeDogImageForDaizu();
      homeSetSpeechText('追加しました！<br>ありがとうございます！');
    } else {
      homeSetRandomDogImage('happy');
      homeSetSpeechText('追加したぜ。<br>ありがとうな！');
    }
    homeReturnToMenu(AppConfig.TIMING.MSG_DISPLAY);
  } catch (e) {
    console.error('Hitokoto save error:', e);
    homeState = 'chirol_error';
    document.getElementById('homeProgressContainer').classList.remove('active');
    if (selectedInfoDog === 'daizu') {
      setHomeDogImageForDaizu();
      homeSetSpeechText('すみません、保存できませんでした...<br>もう一度試してください！');
    } else {
      homeSetRandomDogImage('sad');
      homeSetSpeechText('すまん、保存できなかった...<br>もう一回試してくれ！');
    }
    homeReturnToMenu(AppConfig.TIMING.MSG_DISPLAY);
  }
}

// 画像選択
function chirolImageSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    openCropModal(e.target.result, function(croppedData) {
      chirolCroppedImageData = croppedData;
      var preview = document.getElementById('chirolImagePreview');
      preview.src = croppedData;
      preview.classList.add('active');
      document.querySelector('.image-preview-container').classList.add('has-image');
      updateImageSubmitButton();
    });
  };
  reader.readAsDataURL(file);
}

// タグ選択
function chirolSelectTag(tag) {
  chirolSelectedTag = tag;
  document.querySelectorAll('.tag-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.tag === tag);
  });
  updateImageSubmitButton();
}

function updateImageSubmitButton() {
  const canSubmit = chirolCroppedImageData && chirolSelectedTag;
  document.getElementById('chirolImageSubmitBtn').disabled = !canSubmit;
}

/**
 * base64 データURL → Blob に変換
 */
function dataUrlToBlob(dataUrl) {
  const [header, data] = dataUrl.split(',');
  const contentType = header.match(/:(.*?);/)[1];
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
}

async function chirolSubmitImage() {
  if (!chirolCroppedImageData || !chirolSelectedTag) {
    alert(selectedInfoDog === 'daizu' ? '画像とタグを選択してください！' : '画像とタグを選択してくれ！');
    return;
  }

  homeState = 'chirol_saving';
  if (selectedInfoDog === 'daizu') {
    setHomeDogImageForDaizu();
    homeSetSpeechText('アップロード中です...');
  } else {
    homeSetRandomDogImage('thinking');
    homeSetSpeechText('アップロード中だぜ...');
  }
  homeHideAllAreas();
  document.getElementById('homeProgressContainer').classList.add('active');

  // だいずの場合は 'wansta-daizu' タグを使用してWANstaで表示できるようにする
  const uploadTag = selectedInfoDog === 'daizu' ? 'wansta-daizu' : chirolSelectedTag;
  const imageBlob = dataUrlToBlob(chirolCroppedImageData);
  const contentType = imageBlob.type || 'image/jpeg';

  try {
    // Step 1: Presigned URL を取得
    const urlRes = await fetch(
      `${API_BASE_URL}${AppConfig.API.CHIROL_UPLOAD_URL}?tag=${uploadTag}&contentType=${encodeURIComponent(contentType)}`
    );
    if (!urlRes.ok) throw new Error('URL取得失敗');
    const { uploadUrl, s3Key, imageUrl } = await urlRes.json();

    // Step 2: S3 に直接アップロード（Lambda を経由しない）
    // ※ S3バケットのCORSにPUTメソッドを許可する設定が必要
    const [uploadRes] = await Promise.all([
      fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: imageBlob
      }),
      new Promise(r => setTimeout(r, AppConfig.TIMING.MSG_DISPLAY))
    ]);
    if (!uploadRes.ok) throw new Error('S3アップロード失敗');

    // Step 3: DynamoDBにメタデータ保存
    const metaRes = await fetch(`${API_BASE_URL}${AppConfig.API.CHIROL_IMAGES}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ s3Key, tag: uploadTag })
    });
    if (!metaRes.ok) throw new Error('メタデータ保存失敗');

    // アップロード成功 → 画像リストにも追加
    if (imageUrl && chirolSelectedTag && homeDogImages[chirolSelectedTag]) {
      homeDogImages[chirolSelectedTag].push(imageUrl);
    }
    window.wanstaLoaded = false; // WANstaを次回タブ切替時に再フェッチ

    homeState = 'chirol_done';
    document.getElementById('homeProgressContainer').classList.remove('active');
    if (selectedInfoDog === 'daizu') {
      setHomeDogImageForDaizu();
      homeSetSpeechText('追加しました！<br>かわいいでしょ？');
    } else {
      homeSetRandomDogImage('happy');
      homeSetSpeechText('追加したぜ。<br>カッコいいだろ？');
    }
    homeReturnToMenu(AppConfig.TIMING.MSG_DISPLAY);
  } catch (e) {
    console.error('Image upload error:', e);
    homeState = 'chirol_error';
    document.getElementById('homeProgressContainer').classList.remove('active');
    if (selectedInfoDog === 'daizu') {
      setHomeDogImageForDaizu();
      homeSetSpeechText('すみません、アップロードできませんでした...<br>もう一度試してください！');
    } else {
      homeSetRandomDogImage('sad');
      homeSetSpeechText('すまん、アップロードできなかった...<br>もう一回試してくれ！');
    }
    homeReturnToMenu(AppConfig.TIMING.MSG_DISPLAY);
  }
}
