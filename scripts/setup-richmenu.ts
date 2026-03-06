/**
 * LINE リッチメニュー セットアップスクリプト
 * 2段×3列（6ボタン）のリッチメニューを作成・設定する
 *
 * 上段（情報系）: サイトに行く | 今日の予定は？ | だいずの様子
 * 下段（投稿系）: ダイ日記      | つぶやき       | ワンスタ
 *
 * 使い方:
 *   1. npm install sharp （初回のみ）
 *   2. npx ts-node scripts/setup-richmenu.ts
 *
 * 環境変数:
 *   CHANNEL_ACCESS_TOKEN — LINE チャネルアクセストークン（long-lived）
 */

const DASHBOARD_URL = 'https://family-schedule-web-kame-982312822872.s3.ap-northeast-1.amazonaws.com/dashboard.html';

const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN || '';

if (!CHANNEL_ACCESS_TOKEN) {
  console.error('❌ 環境変数 CHANNEL_ACCESS_TOKEN を設定してください');
  console.error('   例: CHANNEL_ACCESS_TOKEN=xxxxx npx ts-node scripts/setup-richmenu.ts');
  process.exit(1);
}

// リッチメニュー定義（2500×1686, 2段×3列）
const RICH_MENU_OBJECT = {
  size: { width: 2500, height: 1686 },
  selected: true,
  name: 'スケ助メニュー',
  chatBarText: 'メニュー',
  areas: [
    // 上段左: サイトに行く
    {
      bounds: { x: 0, y: 0, width: 833, height: 843 },
      action: { type: 'uri', label: 'サイトに行く', uri: DASHBOARD_URL }
    },
    // 上段中央: 今日の予定は？
    {
      bounds: { x: 833, y: 0, width: 834, height: 843 },
      action: { type: 'message', label: '今日の予定は？', text: '今日' }
    },
    // 上段右: だいずの様子
    {
      bounds: { x: 1667, y: 0, width: 833, height: 843 },
      action: { type: 'message', label: 'だいずの様子', text: 'だいず' }
    },
    // 下段左: ダイ日記
    {
      bounds: { x: 0, y: 843, width: 833, height: 843 },
      action: { type: 'uri', label: 'ダイ日記', uri: `${DASHBOARD_URL}?tab=diary&action=new` }
    },
    // 下段中央: つぶやき
    {
      bounds: { x: 833, y: 843, width: 834, height: 843 },
      action: { type: 'uri', label: 'つぶやき', uri: `${DASHBOARD_URL}?tab=tsubuyaki` }
    },
    // 下段右: ワンスタ
    {
      bounds: { x: 1667, y: 843, width: 833, height: 843 },
      action: { type: 'uri', label: 'ワンスタ', uri: `${DASHBOARD_URL}?tab=wansta` }
    }
  ]
};

async function createRichMenuImage(): Promise<Buffer> {
  // sharp を動的 import（インストールされていない場合のエラーを分かりやすくする）
  let sharp: any;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error('❌ sharp がインストールされていません。先に実行してください:');
    console.error('   npm install sharp');
    process.exit(1);
  }

  const WIDTH = 2500;
  const HEIGHT = 1686;
  const CELL_W = Math.floor(WIDTH / 3);
  const CELL_H = Math.floor(HEIGHT / 2);

  // セル定義（色・テキスト・アイコン）
  const cells = [
    // 上段
    { x: 0, y: 0, bg: '#4CAF50', icon: '🏠', text: 'サイトに行く' },
    { x: CELL_W, y: 0, bg: '#2196F3', icon: '📅', text: '今日の予定は？' },
    { x: CELL_W * 2, y: 0, bg: '#FF9800', icon: '🐕', text: 'だいずの様子' },
    // 下段
    { x: 0, y: CELL_H, bg: '#8D6E63', icon: '📔', text: 'ダイ日記' },
    { x: CELL_W, y: CELL_H, bg: '#42A5F5', icon: '☁️', text: 'つぶやき' },
    { x: CELL_W * 2, y: CELL_H, bg: '#9C27B0', icon: '📸', text: 'ワンスタ' }
  ];

  // SVG で画像を生成
  const svgCells = cells.map(cell => {
    const cx = cell.x + CELL_W / 2;
    const cy = cell.y + CELL_H / 2;
    return `
      <rect x="${cell.x}" y="${cell.y}" width="${CELL_W}" height="${CELL_H}" fill="${cell.bg}" />
      <rect x="${cell.x}" y="${cell.y}" width="${CELL_W}" height="${CELL_H}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="4" />
      <text x="${cx}" y="${cy - 40}" text-anchor="middle" font-size="100" fill="white">${cell.icon}</text>
      <text x="${cx}" y="${cy + 80}" text-anchor="middle" font-size="64" font-weight="bold" fill="white" font-family="sans-serif">${cell.text}</text>
    `;
  }).join('');

  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    ${svgCells}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  console.log('🚀 リッチメニューセットアップ開始...\n');

  // 1. リッチメニュー作成
  console.log('1️⃣  リッチメニューオブジェクトを作成中...');
  const createRes = await fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify(RICH_MENU_OBJECT)
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    console.error('❌ リッチメニュー作成に失敗:', err);
    process.exit(1);
  }

  const { richMenuId } = await createRes.json() as { richMenuId: string };
  console.log(`   ✅ 作成完了: ${richMenuId}\n`);

  // 2. 画像アップロード
  console.log('2️⃣  メニュー画像を生成・アップロード中...');
  const imageBuffer = await createRichMenuImage();

  const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers: {
      'Content-Type': 'image/png',
      Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`
    },
    body: imageBuffer
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    console.error('❌ 画像アップロードに失敗:', err);
    process.exit(1);
  }
  console.log('   ✅ 画像アップロード完了\n');

  // 3. デフォルトリッチメニューに設定
  console.log('3️⃣  デフォルトリッチメニューに設定中...');
  const defaultRes = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`
    }
  });

  if (!defaultRes.ok) {
    const err = await defaultRes.text();
    console.error('❌ デフォルト設定に失敗:', err);
    process.exit(1);
  }
  console.log('   ✅ デフォルト設定完了\n');

  console.log('🎉 リッチメニューセットアップ完了！');
  console.log(`   Rich Menu ID: ${richMenuId}`);
  console.log('   LINE グループでメニューが表示されるか確認してください。');
}

main().catch(err => {
  console.error('❌ エラー:', err);
  process.exit(1);
});
