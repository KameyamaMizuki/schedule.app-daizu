// ========== ダイ日記タブ — コアCRUD ==========
// 依存: core/config.js, core/state.js, core/utils.js, ui/user-select.js
var diaryPosts = [];
var diaryLastKey = null; // ページネーション用
var diaryEditingPostId = null; // 編集中の投稿ID（nullなら新規作成）

// ── ブロックエディタ状態（Task25） ──
var diaryBlocks = [];            // [{id,type:'text',text,bold,italic} | {id,type:'photo',data}]
var diaryBlockIdSeq = 0;
var diaryThumbBlockId = null;    // null = 自動(先頭の写真ブロック) / 明示選択時はブロックid
var diaryDateMode = 'today';     // 'today' | 'yesterday' | 'custom'
var diaryChooserAfterId = null;  // ＋タップ位置（このidの直後に挿入）
var diaryPendingPhotoAfterId = null;
var diaryPendingDraft = null;
var diaryDraftDebounceTimer = null;

async function initDiaryTab() {
  await loadDiaryPosts();
}

// ========== 投稿フォーム 開閉 ==========

function toggleDiaryInput() {
  var inputArea = document.getElementById('diaryInputArea');
  var isVisible = inputArea.style.display !== 'none';

  if (isVisible) {
    diaryCloseCompose();
    return;
  }

  // 開く：新規作成モードで初期化
  diaryEditingPostId = null;
  diaryResetComposeState();

  var titleEl = document.getElementById('diaryInputTitle');
  if (titleEl) titleEl.innerHTML = '<i class="ph-bold ph-note-pencil"></i> 日記を書く';
  var btn = document.getElementById('diarySubmitBtn');
  if (btn) btn.textContent = '投稿する';

  inputArea.style.display = 'flex';
  document.body.classList.add('modal-open');
  document.body.style.overflow = 'hidden';

  // 下書きがあれば復元確認（新規作成時のみ・編集時は対象外）
  var draft = diaryLoadDraftRaw();
  if (draft) diaryOpenDraftPrompt(draft);
}

function diaryCloseCompose() {
  var inputArea = document.getElementById('diaryInputArea');
  inputArea.style.display = 'none';
  document.body.classList.remove('modal-open');
  document.body.style.overflow = '';
  diaryEditingPostId = null;
}

function diaryDateStrFor(mode) {
  var d = new Date();
  if (mode === 'yesterday') d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function diaryResetComposeState() {
  diaryBlocks = [diaryMakeTextBlock('', false, false)];
  diaryThumbBlockId = null;
  diaryDateMode = 'today';

  var titleInput = document.getElementById('diaryTitleInput');
  if (titleInput) titleInput.value = '';

  var dateInput = document.getElementById('diaryDateInput');
  if (dateInput) {
    dateInput.value = diaryDateStrFor('today');
    dateInput.style.display = 'none';
  }
  document.querySelectorAll('.dbe-date-chip').forEach(function(b) {
    b.classList.toggle('active', b.dataset.when === 'today');
  });

  diaryRenderBlocks();
}

// ========== 日付チップ ==========

function diarySetDateChip(mode) {
  diaryDateMode = mode;
  document.querySelectorAll('.dbe-date-chip').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.when === mode);
  });
  var dateInput = document.getElementById('diaryDateInput');
  if (!dateInput) return;
  if (mode === 'custom') {
    dateInput.style.display = 'block';
    if (!dateInput.value) dateInput.value = diaryDateStrFor('today');
    dateInput.focus();
  } else {
    dateInput.style.display = 'none';
    dateInput.value = diaryDateStrFor(mode);
  }
  diaryScheduleDraftSave();
}

function diaryDateInputChanged() {
  diaryScheduleDraftSave();
}

// ========== ブロックモデル ==========

function diaryMakeTextBlock(text, bold, italic) {
  diaryBlockIdSeq++;
  return { id: 'b' + diaryBlockIdSeq, type: 'text', text: text || '', bold: !!bold, italic: !!italic };
}

function diaryMakePhotoBlock(data) {
  diaryBlockIdSeq++;
  return { id: 'b' + diaryBlockIdSeq, type: 'photo', data: data || '' };
}

function diaryInsertBlock(afterId, block) {
  var idx = diaryBlocks.findIndex(function(b) { return b.id === afterId; });
  if (idx === -1) diaryBlocks.push(block);
  else diaryBlocks.splice(idx + 1, 0, block);
  return block;
}

function diaryPhotoBlocks() {
  return diaryBlocks.filter(function(b) { return b.type === 'photo'; });
}

// サムネイル = 明示選択があればそれ、なければ先頭の写真ブロック（自動）
function diaryCurrentThumbBlock() {
  if (diaryThumbBlockId) {
    var chosen = diaryBlocks.find(function(b) { return b.id === diaryThumbBlockId && b.type === 'photo'; });
    if (chosen) return chosen;
  }
  return diaryPhotoBlocks()[0] || null;
}

// ========== ブロック描画 ==========

function diaryAutosizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function diaryFocusBlock(id) {
  if (!id) return;
  var el = document.querySelector('.dbe-textarea[data-id="' + id + '"]');
  if (!el) return;
  el.focus();
  var len = el.value.length;
  if (el.setSelectionRange) el.setSelectionRange(len, len);
}

function diaryUpdateThumbIndicator() {
  var indicator = document.getElementById('diaryThumbIndicator');
  var img = document.getElementById('diaryThumbIndicatorImg');
  var label = document.getElementById('diaryThumbIndicatorLabel');
  if (!indicator) return;
  var thumb = diaryCurrentThumbBlock();
  if (!thumb) {
    indicator.style.display = 'none';
    return;
  }
  indicator.style.display = 'flex';
  if (img) img.src = thumb.data;
  if (label) label.textContent = diaryThumbBlockId ? 'サムネ: 選択中（タップで変更）' : 'サムネ: 自動（1枚目）';
}

function diaryRenderBlocks() {
  var container = document.getElementById('diaryBlocksContainer');
  if (!container) return;
  var thumb = diaryCurrentThumbBlock();

  var html = diaryBlocks.map(function(block) {
    if (block.type === 'photo') {
      var isThumb = !!(thumb && thumb.id === block.id);
      var blockImgSrc = safeImageSrc(block.data);
      return '<div class="dbe-block dbe-block-photo" data-id="' + block.id + '">'
        + '<div class="dbe-photo-wrap">'
        + (blockImgSrc ? '<img class="dbe-photo-img" src="' + blockImgSrc + '" alt="">' : '')
        + (isThumb ? '<span class="dbe-photo-thumb-badge">サムネ</span>' : '')
        + '<div class="dbe-photo-controls">'
        + '<button type="button" class="dbe-photo-btn" onclick="diaryMoveBlock(\'' + block.id + '\',-1)" aria-label="上へ"><i class="ph-bold ph-arrow-up"></i></button>'
        + '<button type="button" class="dbe-photo-btn" onclick="diaryMoveBlock(\'' + block.id + '\',1)" aria-label="下へ"><i class="ph-bold ph-arrow-down"></i></button>'
        + '<button type="button" class="dbe-photo-btn dbe-photo-del" onclick="diaryDeleteBlock(\'' + block.id + '\')" aria-label="削除"><i class="ph-bold ph-x"></i></button>'
        + '</div>'
        + '</div>'
        + '<div class="dbe-add-row"><button type="button" class="dbe-add-btn" onclick="diaryOpenBlockChooser(\'' + block.id + '\')"><i class="ph-bold ph-plus"></i></button></div>'
        + '</div>';
    }
    return '<div class="dbe-block dbe-block-text" data-id="' + block.id + '">'
      + '<div class="dbe-text-wrap">'
      + '<textarea class="dbe-textarea" data-id="' + block.id + '" rows="1" placeholder="今日のだいずの様子…"'
      + ' style="font-weight:' + (block.bold ? '700' : '400') + ';font-style:' + (block.italic ? 'italic' : 'normal') + '"'
      + ' oninput="diaryTextBlockInput(this)" onkeydown="diaryTextBlockKeydown(event,this)"></textarea>'
      + '<div class="dbe-mini-toolbar">'
      + '<button type="button" class="dbe-mini-btn' + (block.bold ? ' active' : '') + '" data-fmt="bold" onclick="diaryToggleBlockFormat(\'' + block.id + '\',\'bold\')" aria-label="太字"><b>B</b></button>'
      + '<button type="button" class="dbe-mini-btn' + (block.italic ? ' active' : '') + '" data-fmt="italic" onclick="diaryToggleBlockFormat(\'' + block.id + '\',\'italic\')" aria-label="斜体"><i>I</i></button>'
      + '<button type="button" class="dbe-mini-btn dbe-mini-del" onclick="diaryDeleteBlock(\'' + block.id + '\')" aria-label="削除"><i class="ph-bold ph-trash"></i></button>'
      + '</div>'
      + '</div>'
      + '<div class="dbe-add-row"><button type="button" class="dbe-add-btn" onclick="diaryOpenBlockChooser(\'' + block.id + '\')"><i class="ph-bold ph-plus"></i></button></div>'
      + '</div>';
  }).join('');

  container.innerHTML = html;

  // textarea の値は属性ではなく JS で設定（改行・特殊文字を安全に扱うため）+ 自動伸長
  diaryBlocks.forEach(function(block) {
    if (block.type !== 'text') return;
    var ta = container.querySelector('.dbe-textarea[data-id="' + block.id + '"]');
    if (ta) {
      ta.value = block.text || '';
      diaryAutosizeTextarea(ta);
    }
  });

  diaryUpdateThumbIndicator();
}

// ========== ブロック操作 ==========

function diaryTextBlockInput(el) {
  var id = el.dataset.id;
  var block = diaryBlocks.find(function(b) { return b.id === id; });
  if (block) block.text = el.value;
  diaryAutosizeTextarea(el);
  diaryScheduleDraftSave();
}

// 空のテキストブロックでBackspace＝そのブロックを削除（先頭にカーソルがある時のみ）
function diaryTextBlockKeydown(event, el) {
  if (event.key !== 'Backspace') return;
  if (el.value !== '') return;
  if (el.selectionStart !== 0 || el.selectionEnd !== 0) return;

  var id = el.dataset.id;
  var idx = diaryBlocks.findIndex(function(b) { return b.id === id; });
  if (idx === -1 || diaryBlocks.length === 1) return; // 最後の1ブロックは残す

  event.preventDefault();
  diaryBlocks.splice(idx, 1);
  if (diaryThumbBlockId === id) diaryThumbBlockId = null;
  diaryRenderBlocks();
  var focusIdx = Math.max(0, idx - 1);
  var focusTarget = diaryBlocks[focusIdx];
  if (focusTarget && focusTarget.type === 'text') diaryFocusBlock(focusTarget.id);
  diaryScheduleDraftSave();
}

// B/I: ブロック全体に太字/斜体を適用するトグル（文章ブロックのミニツールバー）
function diaryToggleBlockFormat(id, fmt) {
  var block = diaryBlocks.find(function(b) { return b.id === id; });
  if (!block) return;
  block[fmt] = !block[fmt];

  var blockEl = document.querySelector('.dbe-block[data-id="' + id + '"]');
  if (blockEl) {
    var btn = blockEl.querySelector('.dbe-mini-btn[data-fmt="' + fmt + '"]');
    if (btn) btn.classList.toggle('active', !!block[fmt]);
    var ta = blockEl.querySelector('.dbe-textarea');
    if (ta) {
      ta.style.fontWeight = block.bold ? '700' : '400';
      ta.style.fontStyle = block.italic ? 'italic' : 'normal';
      ta.focus();
    }
  }
  diaryScheduleDraftSave();
}

function diaryDeleteBlock(id) {
  var idx = diaryBlocks.findIndex(function(b) { return b.id === id; });
  if (idx === -1) return;

  if (diaryBlocks.length === 1) {
    // 最後の1ブロックは削除せず空の文章ブロックにリセット
    diaryBlocks[0] = diaryMakeTextBlock('', false, false);
  } else {
    diaryBlocks.splice(idx, 1);
  }
  if (diaryThumbBlockId === id) diaryThumbBlockId = null;
  diaryRenderBlocks();
  diaryScheduleDraftSave();
}

function diaryMoveBlock(id, dir) {
  var idx = diaryBlocks.findIndex(function(b) { return b.id === id; });
  if (idx === -1) return;
  var newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= diaryBlocks.length) return;
  var tmp = diaryBlocks[idx];
  diaryBlocks[idx] = diaryBlocks[newIdx];
  diaryBlocks[newIdx] = tmp;
  diaryRenderBlocks();
  diaryScheduleDraftSave();
}

// ========== ＋ブロック追加チューザー ==========

function diaryOpenBlockChooser(afterId) {
  diaryChooserAfterId = afterId;
  var modal = document.getElementById('diaryBlockChooser');
  if (modal) modal.classList.add('active');
}

function diaryCloseBlockChooser() {
  var modal = document.getElementById('diaryBlockChooser');
  if (modal) modal.classList.remove('active');
  diaryChooserAfterId = null;
}

function diaryAddBlockFromChooser(kind) {
  var afterId = diaryChooserAfterId;
  diaryCloseBlockChooser();

  if (kind === 'text') {
    var block = diaryInsertBlock(afterId, diaryMakeTextBlock('', false, false));
    diaryRenderBlocks();
    diaryFocusBlock(block.id);
    diaryScheduleDraftSave();
    return;
  }

  if (kind === 'photo') {
    diaryPendingPhotoAfterId = afterId;
    var input = document.getElementById('diaryBlockPhotoInput');
    if (input) { input.value = ''; input.click(); }
  }
}

function diaryBlockPhotoFileSelected(event) {
  var file = event.target.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    alert('画像サイズは10MB以下にしてください');
    return;
  }
  var preset = AppConfig.IMAGE.DIARY_PHOTO;
  compressImage(file, preset.maxWidth, preset.quality).then(function(dataUrl) {
    var block = diaryMakePhotoBlock(dataUrl);
    diaryInsertBlock(diaryPendingPhotoAfterId, block);
    diaryPendingPhotoAfterId = null;
    diaryRenderBlocks();
    diaryScheduleDraftSave();
  }).catch(function(err) {
    console.error('画像圧縮エラー:', err);
    alert('画像の読み込みに失敗しました');
  });
}

// ========== サムネイル選択 ==========

function diaryOpenThumbPicker() {
  var photos = diaryPhotoBlocks();
  var grid = document.getElementById('diaryThumbPickerGrid');
  if (grid) {
    grid.innerHTML = photos.length
      ? photos.map(function(b) {
          var picImgSrc = safeImageSrc(b.data);
          return '<button type="button" class="dbe-thumb-picker-item" onclick="diarySelectThumb(\'' + b.id + '\')">' + (picImgSrc ? '<img src="' + picImgSrc + '" alt="">' : '') + '</button>';
        }).join('')
      : '<div class="dbe-thumb-picker-empty">写真ブロックがありません</div>';
  }
  var modal = document.getElementById('diaryThumbPicker');
  if (modal) modal.classList.add('active');
}

function diaryCloseThumbPicker() {
  var modal = document.getElementById('diaryThumbPicker');
  if (modal) modal.classList.remove('active');
}

function diarySelectThumb(id) {
  diaryThumbBlockId = id || null;
  diaryCloseThumbPicker();
  diaryRenderBlocks();
  diaryScheduleDraftSave();
}

// ========== 下書き自動保存（localStorage） ==========

function diaryScheduleDraftSave() {
  if (diaryEditingPostId) return; // 編集モードは下書き対象外
  clearTimeout(diaryDraftDebounceTimer);
  diaryDraftDebounceTimer = setTimeout(diarySaveDraftNow, 1000);
}

function diarySaveDraftNow() {
  if (diaryEditingPostId) return;
  try {
    var titleInput = document.getElementById('diaryTitleInput');
    var dateInput = document.getElementById('diaryDateInput');
    var draft = {
      blocks: diaryBlocks,
      thumbBlockId: diaryThumbBlockId,
      title: titleInput ? titleInput.value : '',
      date: dateInput ? dateInput.value : '',
      dateMode: diaryDateMode,
      savedAt: Date.now()
    };
    localStorage.setItem('diaryDraft', JSON.stringify(draft));
  } catch (e) {
    // localStorage失敗（容量超過等）は無視
  }
}

function diaryClearDraft() {
  try { localStorage.removeItem('diaryDraft'); } catch (e) { /* noop */ }
}

function diaryLoadDraftRaw() {
  try {
    var raw = localStorage.getItem('diaryDraft');
    if (!raw) return null;
    var draft = JSON.parse(raw);
    if (!draft || !Array.isArray(draft.blocks) || draft.blocks.length === 0) return null;
    return draft;
  } catch (e) {
    return null;
  }
}

function diaryOpenDraftPrompt(draft) {
  diaryPendingDraft = draft;
  var modal = document.getElementById('diaryDraftPrompt');
  if (modal) modal.classList.add('active');
}

function diaryClosePromptModal() {
  var modal = document.getElementById('diaryDraftPrompt');
  if (modal) modal.classList.remove('active');
}

function diaryRestoreDraft() {
  var draft = diaryPendingDraft;
  diaryClosePromptModal();
  diaryPendingDraft = null;
  if (!draft) return;

  diaryBlocks = draft.blocks.map(function(b) {
    return b.type === 'photo' ? diaryMakePhotoBlock(b.data) : diaryMakeTextBlock(b.text, b.bold, b.italic);
  });
  if (diaryBlocks.length === 0) diaryBlocks = [diaryMakeTextBlock('', false, false)];
  diaryThumbBlockId = draft.thumbBlockId || null;

  var titleInput = document.getElementById('diaryTitleInput');
  if (titleInput) titleInput.value = draft.title || '';

  diaryDateMode = draft.dateMode || 'custom';
  var dateInput = document.getElementById('diaryDateInput');
  if (dateInput) dateInput.value = draft.date || diaryDateStrFor('today');
  document.querySelectorAll('.dbe-date-chip').forEach(function(b) {
    b.classList.toggle('active', b.dataset.when === diaryDateMode);
  });
  if (dateInput) dateInput.style.display = (diaryDateMode === 'custom') ? 'block' : 'none';

  diaryRenderBlocks();
}

function diaryDiscardDraft() {
  diaryClosePromptModal();
  diaryPendingDraft = null;
  diaryClearDraft();
}

// ========== シリアライズ / デシリアライズ（保存互換・Node vm でテスト可能な純粋関数） ==========
// ブロック列 ⇄ 既存互換のHTML本文（<p>/<b>/<i>/<img>）を相互変換する。
// 依存: escapeHtml（core/utils.js）のみ。DOM(document)には依存しない。

function diaryDecodeEntities(str) {
  return String(str == null ? '' : str)
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&apos;/gi, '\'')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&');
}

// <br> を除去する前に改行へ置き換えるための一時プレースホルダ（本文中に出現しない制御文字）
var DIARY_BR_MARKER = String.fromCharCode(2);

// タグを除去してプレーンテキスト化。<br>は改行として保持（安全側フォールバックにも使用）
function diaryStripTags(html) {
  var s = html == null ? '' : String(html);
  s = s.replace(/<br\s*\/?>/gi, DIARY_BR_MARKER);
  s = s.replace(/<[^>]*>/g, '');
  s = diaryDecodeEntities(s);
  return s.split(DIARY_BR_MARKER).join('\n');
}

function diaryExtractImgSrc(tag) {
  var m = tag.match(/\bsrc\s*=\s*"([^"]*)"/i) || tag.match(/\bsrc\s*=\s*'([^']*)'/i) || tag.match(/\bsrc\s*=\s*([^\s>]+)/i);
  return m ? diaryDecodeEntities(m[1]) : '';
}

// インラインHTML断片を解析: 全体が<b>/<i>(<strong>/<em>)で丸ごと包まれていれば
// bold/italicフラグへ吸収し、それ以外の入れ子構造が残る場合はタグを除去したプレーンテキストへ
// フォールバックする（安全側）
function diaryAnalyzeInlineHtml(html) {
  var bold = false, italic = false;
  var working = html == null ? '' : String(html);
  var guard = 0;

  while (guard++ < 20) {
    var trimmed = working.trim();
    var mb = trimmed.match(/^<(b|strong)(?:\s[^>]*)?>([\s\S]*)<\/\1>$/i);
    if (mb) { bold = true; working = mb[2]; continue; }
    var mi = trimmed.match(/^<(i|em)(?:\s[^>]*)?>([\s\S]*)<\/\1>$/i);
    if (mi) { italic = true; working = mi[2]; continue; }
    break;
  }

  var withoutBr = working.replace(/<br\s*\/?>/gi, '');
  var hasOtherTag = /<[a-zA-Z][^>]*>/.test(withoutBr);
  if (hasOtherTag) {
    // 変換不能な複雑な入れ子構造 → 元のHTML全体をタグ除去してプレーンテキスト化(安全側)
    return { text: diaryStripTags(html), bold: false, italic: false };
  }
  return { text: diaryStripTags(working), bold: bold, italic: italic };
}

// テキスト系セグメント（<img>を含む可能性あり）をブロック列へ変換
function diaryPushInlineSegment(segment, blocks) {
  if (!segment) return;
  var parts = segment.split(/(<img\b[^>]*>)/i);
  parts.forEach(function(part) {
    if (!part) return;
    if (/^<img\b/i.test(part)) {
      blocks.push(diaryMakePhotoBlock(diaryExtractImgSrc(part)));
    } else {
      var analyzed = diaryAnalyzeInlineHtml(part);
      if (analyzed.text !== '') blocks.push(diaryMakeTextBlock(analyzed.text, analyzed.bold, analyzed.italic));
    }
  });
}

// <p>/<div> の中身（imgを含む可能性あり）をブロック列へ変換
function diaryPushParagraphSegment(inner, blocks) {
  if (/<img\b/i.test(inner)) {
    diaryPushInlineSegment(inner, blocks);
    return;
  }
  var analyzed = diaryAnalyzeInlineHtml(inner);
  blocks.push(diaryMakeTextBlock(analyzed.text, analyzed.bold, analyzed.italic));
}

/**
 * 既存互換のHTML本文 → ブロック列
 * <p>...</p> / <div>...</div> をそれぞれ1つの文章ブロックに、<img>を写真ブロックに変換する。
 * 新形式(ブロックエディタ自身が保存したHTML)・旧形式(素のcontenteditableが生成したフラットなHTML)の
 * 両方を吸収できるよう、トップレベルの生テキスト/インライン要素の並びも1文章ブロックとして扱う。
 */
function diaryHtmlToBlocks(html) {
  var blocks = [];
  var src = html || '';
  var re = /<img\b[^>]*>|<p(?:\s[^>]*)?>[\s\S]*?<\/p>|<div(?:\s[^>]*)?>[\s\S]*?<\/div>/gi;
  var lastIndex = 0;
  var m;

  while ((m = re.exec(src)) !== null) {
    diaryPushInlineSegment(src.slice(lastIndex, m.index), blocks);
    var token = m[0];
    if (/^<img\b/i.test(token)) {
      blocks.push(diaryMakePhotoBlock(diaryExtractImgSrc(token)));
    } else {
      var inner = token.replace(/^<[^>]*>/, '').replace(/<\/[a-zA-Z]+>$/, '');
      diaryPushParagraphSegment(inner, blocks);
    }
    lastIndex = re.lastIndex;
  }
  diaryPushInlineSegment(src.slice(lastIndex), blocks);

  if (blocks.length === 0) blocks.push(diaryMakeTextBlock('', false, false));
  return blocks;
}

/**
 * ブロック列 → 既存互換のHTML本文
 * 文章ブロック→<p>(改行は<br>、bold/italicは<b>/<i>で包む)、写真ブロック→<img src="...">
 */
function diaryBlocksToHtml(blocks) {
  return (blocks || []).map(function(block) {
    if (block.type === 'photo') {
      var imgSrc = safeImageSrc(block.data);
      return imgSrc ? '<img src="' + imgSrc + '">' : '';
    }
    var body = escapeHtml(block.text || '').replace(/\n/g, '<br>');
    if (block.bold) body = '<b>' + body + '</b>';
    if (block.italic) body = '<i>' + body + '</i>';
    return '<p>' + body + '</p>';
  }).join('');
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
  var thumb = safeImageSrc(diaryExtractThumb(parsed));
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
  var thumb = safeImageSrc(diaryExtractThumb(parsed));
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

// ========== 投稿・編集・削除 ==========

async function submitDiary() {
  var titleInput = document.getElementById('diaryTitleInput');
  var dateInput = document.getElementById('diaryDateInput');
  var title = titleInput ? titleInput.value.trim() : '';
  var selectedDate = dateInput ? dateInput.value : '';

  // 空の文章ブロック・空の写真ブロックは投稿対象外（少なくとも1つ内容があるか確認）
  var meaningful = diaryBlocks.filter(function(b) {
    return b.type === 'photo' ? !!b.data : (b.text || '').trim() !== '';
  });
  if (meaningful.length === 0) {
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
    // 1. 写真ブロックのbase64を順にS3へアップロード（既にS3 URLのものはそのまま）
    btn.textContent = '画像アップロード中...';
    var uploadedBlocks = [];
    for (var i = 0; i < diaryBlocks.length; i++) {
      var b = diaryBlocks[i];
      if (b.type === 'photo' && b.data) {
        var url = b.data.indexOf('data:') === 0 ? await uploadImageToS3(b.data, 'diary') : b.data;
        uploadedBlocks.push({ id: b.id, type: 'photo', data: url });
      } else {
        uploadedBlocks.push(b);
      }
    }

    // 2. HTML本文へシリアライズ（空の文章ブロック・空の写真ブロックは除外）
    var blocksForBody = uploadedBlocks.filter(function(b) {
      return b.type === 'photo' ? !!b.data : (b.text || '').trim() !== '';
    });
    var bodyHtml = diaryBlocksToHtml(blocksForBody);

    // 3. サムネイル = 選択中の写真ブロック、なければ先頭の写真ブロック
    var thumbBlock = null;
    if (diaryThumbBlockId) {
      thumbBlock = uploadedBlocks.find(function(b) { return b.id === diaryThumbBlockId && b.type === 'photo'; });
    }
    if (!thumbBlock) thumbBlock = uploadedBlocks.find(function(b) { return b.type === 'photo' && b.data; });
    var finalCatchImageUrl = thumbBlock ? thumbBlock.data : null;

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
    diaryClearDraft();
    diaryEditingPostId = null;
    toggleDiaryInput();
    await loadDiaryPosts(false, true);
  } catch (error) {
    alert((diaryEditingPostId ? '更新' : '投稿') + 'に失敗しました: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
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
  diaryBlocks = diaryHtmlToBlocks(editHtml);

  // キャッチ画像(catchImageUrl / 旧CATCH_IMG)がある場合、本文中に同URLの写真ブロックがあれば
  // それをサムネに、なければ先頭に補って追加する
  diaryThumbBlockId = null;
  if (editCatchImg) {
    var matching = diaryBlocks.find(function(b) { return b.type === 'photo' && b.data === editCatchImg; });
    if (matching) {
      diaryThumbBlockId = matching.id;
    } else {
      var thumbBlock = diaryMakePhotoBlock(editCatchImg);
      diaryBlocks.unshift(thumbBlock);
      diaryThumbBlockId = thumbBlock.id;
    }
  }

  var titleInput = document.getElementById('diaryTitleInput');
  if (titleInput) titleInput.value = editTitle;

  diaryDateMode = 'custom';
  var dateInput = document.getElementById('diaryDateInput');
  if (dateInput) {
    dateInput.value = editDate;
    dateInput.style.display = 'block';
  }
  document.querySelectorAll('.dbe-date-chip').forEach(function(b) {
    b.classList.toggle('active', b.dataset.when === 'custom');
  });

  diaryRenderBlocks();

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
