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
  target: 'node20',
  outdir,
  // AWS SDK v3 は Lambda Node.js 20 実行環境に同梱済み
  external: ['@aws-sdk/*'],
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
