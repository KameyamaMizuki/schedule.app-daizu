/**
 * build-web.js — フロントエンド JS/CSS をページ単位でバンドル（結合）する
 *
 * グローバル変数スタイルのスクリプト群を 1 ファイルにまとめ、
 * HTTP リクエスト数を削減する。
 *   home.html      : 17 個の <script> → 1 つの home.bundle.js
 *   dashboard.html : 19 個の <script> → 1 つの dashboard.bundle.js
 *   CSS も同様に各ページ 1 ファイルにまとめる。
 */

const fs = require('fs');
const path = require('path');

const WEB = path.join(__dirname, '..', 'web');

// ── home.html 用 JS（読み込み順を厳守） ──────────────────────────────
const HOME_JS = [
  'scripts/routes.js',
  'scripts/core/config.js',
  'scripts/core/state.js',
  'scripts/core/utils.js',
  'scripts/ui/sidebar.ui.js',
  'scripts/core/account.js',
  'scripts/ui/account-edit.js',
  'scripts/ui/user-select.js',
  'scripts/ui/crop-square.js',
  'scripts/tabs/home.js',
  'scripts/tabs/home.schedule.js',
  'scripts/tabs/home.uranau.js',
  'scripts/tabs/home.wannade.js',
  'scripts/tabs/home.chirolinfo.js',
  'scripts/tabs/home.daizu-liff.js',
  'scripts/home.page.js',
];

// ── dashboard.html 用 JS（読み込み順を厳守） ─────────────────────────
const DASHBOARD_JS = [
  'scripts/routes.js',
  'scripts/core/config.js',
  'scripts/core/state.js',
  'scripts/core/utils.js',
  'scripts/ui/sidebar.ui.js',
  'scripts/core/account.js',
  'scripts/ui/account-edit.js',
  'scripts/ui/user-select.js',
  'scripts/ui/crop-square.js',
  'scripts/tabs/schedule.js',
  'scripts/tabs/schedule-calendar.js',
  'scripts/tabs/schedule-weekview.js',
  'scripts/tabs/yousu.js',
  'scripts/tabs/diary.js',
  'scripts/tabs/diary-detail.js',
  'scripts/ui/crop-free.js',
  'scripts/tabs/wansta.js',
  'scripts/tabs/wansta-social.js',
  'scripts/dashboard.page.js',
];

// ── CSS ──────────────────────────────────────────────────────────────
const HOME_CSS = [
  'styles/base.css',
  'styles/crop.css',
  'styles/tabs/home.css',
];

const DASHBOARD_CSS = [
  'styles/base.css',
  'styles/crop.css',
  'styles/tabs/schedule.css',
  'styles/tabs/yousu.css',
  'styles/tabs/diary.css',
  'styles/tabs/wansta.css',
];

// ────────────────────────────────────────────────────────────────────

function bundle(files, outRel) {
  const parts = files.map(f => {
    const src = path.join(WEB, f);
    if (!fs.existsSync(src)) { console.warn(`  ⚠ 見つかりません: ${f}`); return ''; }
    return fs.readFileSync(src, 'utf-8');
  });

  const combined = parts.join('\n');
  const outPath = path.join(WEB, outRel);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, combined, 'utf-8');

  const kb = (Buffer.byteLength(combined, 'utf-8') / 1024).toFixed(1);
  console.log(`  ✓ ${outRel}  ${kb} KB  (${files.length} files)`);
}

console.log('\nBuilding web bundles...\n');

bundle(HOME_JS,       'scripts/home.bundle.js');
bundle(DASHBOARD_JS,  'scripts/dashboard.bundle.js');
bundle(HOME_CSS,      'styles/home.bundle.css');
bundle(DASHBOARD_CSS, 'styles/dashboard.bundle.css');

console.log('\n✓ Done\n');
