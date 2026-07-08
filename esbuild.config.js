/**
 * esbuild ビルド設定
 *
 * 各ハンドラーを個別エントリポイントとしてバンドル。
 * @aws-sdk/* は Lambda 実行環境に同梱済みのため external（バンドルから除外）。
 * ビルド成果物: dist/handlers/{name}.js
 */

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

// ビルド時に git SHA を注入（ボットが生成するリンクの ?appv= に使用し、
// LINE内蔵ブラウザのキャッシュをデプロイごとに確実に破棄する）。
// フロント側キャッシュバスター（deploy.yml の git hash 注入）と同じ値になる。
// 引数配列でシェルを介さない（コマンドインジェクション回避）。
let APP_VERSION = process.env.APP_VERSION || 'dev';
try {
  APP_VERSION = execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim() || APP_VERSION;
} catch (e) {
  // git が無い環境では 'dev' のまま（ローカル動作用フォールバック）
}

const handlersDir = path.join(__dirname, 'src', 'handlers');
const outdir = path.join(__dirname, 'dist', 'handlers');

// handlers/ 内のすべての .ts ファイルをエントリポイントとして収集
const entryPoints = fs
  .readdirSync(handlersDir)
  .filter(f => f.endsWith('.ts'))
  .map(f => path.join(handlersDir, f));

esbuild.build({
  entryPoints,
  bundle: true,
  platform: 'node',
  target: 'node22',
  outdir,
  // AWS SDK v3 は Lambda Node.js 20 実行環境に同梱済み
  external: ['@aws-sdk/*'],
  // git SHA をビルド時に埋め込む（constants.ts の APP_VERSION）
  define: { 'process.env.APP_VERSION': JSON.stringify(APP_VERSION) },
  // ソースマップ（CloudWatch Logs でのデバッグ用）
  sourcemap: true,
  // minify は読みやすさ優先で off（Lambda コールドスタートへの影響は軽微）
  minify: false,
  logLevel: 'info',
}).then(() => {
  console.log(`✓ Built ${entryPoints.length} handlers → ${outdir}`);
}).catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
