/**
 * build-web.js — フロントエンド JS/CSS をページ単位でバンドル（結合）する
 *
 * グローバル変数スタイルのスクリプト群を 1 ファイルにまとめ、
 * HTTP リクエスト数を削減する。
 *   dashboard.html : 全タブ（ホーム/スケジュール/様子/日記/WANsta）1ページ統合 → 1 つの dashboard.bundle.js
 *   home.html      : dashboard.html?tab=home へリダイレクトするだけのスタブ（バンドル不要）
 *   CSS も同様に dashboard.html 用の 1 ファイルにまとめる。
 */

const fs = require('fs');
const path = require('path');

const WEB = path.join(__dirname, '..', 'web');

// ── dashboard.html 用 JS（読み込み順を厳守） ─────────────────────────
// 旧 home.html のタブ（tabs/home*.js, ui/birthday.js）を core/* の直後・
// 他タブ群の前に統合。ui/sidebar.ui.js は旧サイドバー廃止に伴い削除済み。
const DASHBOARD_JS = [
  'scripts/routes.js',
  'scripts/core/config.js',
  'scripts/core/theme.js',
  'scripts/core/motion.js',
  'scripts/core/state.js',
  'scripts/core/utils.js',
  'scripts/core/api.js',
  'scripts/core/account.js',
  'scripts/core/auth.js',
  'scripts/ui/pin-login.js',
  'scripts/ui/account-edit.js',
  'scripts/ui/user-select.js',
  'scripts/ui/crop-square.js',
  'scripts/ui/birthday.js',
  'scripts/tabs/home.js',
  'scripts/tabs/home.schedule.js',
  'scripts/tabs/home.chirolinfo.js',
  'scripts/tabs/home.daizu-liff.js',
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
const DASHBOARD_CSS = [
  'styles/base.css',
  'styles/shell.css',
  'styles/crop.css',
  'styles/pin-login.css',
  'styles/tabs/home.css',
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

bundle(DASHBOARD_JS,  'scripts/dashboard.bundle.js');
bundle(DASHBOARD_CSS, 'styles/dashboard.bundle.css');

console.log('\n✓ Done\n');
