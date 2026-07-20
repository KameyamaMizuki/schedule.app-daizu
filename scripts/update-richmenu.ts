/**
 * LINEリッチメニュー(常駐タブボタン)を作成・差し替えするスクリプト。
 * デプロイのたびに実行し、appv付きリンクを最新SHAで再登録する
 * (LINE内蔵ブラウザのURL単位キャッシュを appv の変化で回避する狙い)。
 *
 * 実行:
 *   APP_VERSION=<git short SHA> npx ts-node --compiler-options '{"module":"commonjs"}' scripts/update-richmenu.ts
 *   (AWS_PROFILE=c3test / AWS_REGION=ap-northeast-1 をローカル実行時は環境変数で。
 *    GitHub Actions では OIDC で認証済みのため不要)
 *
 * 手順: リッチメニュー作成 → 画像(assets/richmenu.png)アップロード →
 *       全ユーザーのデフォルトに設定 → 一覧取得 → 新規以外を削除
 *
 * 資格情報(チャネルアクセストークン)はプロセス内でのみ使用し、絶対にログ出力しない。
 */
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

// APP_VERSION: 環境変数優先、なければ git SHA。
// constants.ts の APP_VERSION はモジュール読み込み時に process.env.APP_VERSION を評価するため、
// import より前に確定させる必要がある。TypeScriptの静的importは常にファイル先頭に来る制約が
// あり、その前に処理を挟めないため、ここでは意図的に require() を使う。
if (!process.env.APP_VERSION) {
  process.env.APP_VERSION = execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim();
}
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getDashboardUrl } = require('../src/utils/constants') as typeof import('../src/utils/constants');

const SECRET_ID = 'line/credentials-kame';
const IMAGE_PATH = join(__dirname, '..', 'assets', 'richmenu.png');
const RICHMENU_NAME = `スケ助メニュー-${process.env.APP_VERSION}`;

interface RichMenuArea {
  bounds: { x: number; y: number; width: number; height: number };
  action:
    | { type: 'uri'; label: string; uri: string }
    | { type: 'message'; label: string; text: string };
}

function buildAreas(): RichMenuArea[] {
  const COL = [0, 833, 1666];
  const COLW = [833, 833, 834];
  const ROW = [0, 843];
  const ROWH = 843;

  return [
    // 上段: ホーム / 予定 / 様子
    {
      bounds: { x: COL[0], y: ROW[0], width: COLW[0], height: ROWH },
      action: { type: 'uri', label: 'ホーム', uri: getDashboardUrl() }
    },
    {
      bounds: { x: COL[1], y: ROW[0], width: COLW[1], height: ROWH },
      action: { type: 'uri', label: '予定', uri: getDashboardUrl({ tab: 'schedule' }) }
    },
    {
      bounds: { x: COL[2], y: ROW[0], width: COLW[2], height: ROWH },
      action: { type: 'uri', label: '様子', uri: getDashboardUrl({ tab: 'yousu' }) }
    },
    // 下段: 日記 / WANsta / 今日の予定
    {
      bounds: { x: COL[0], y: ROW[1], width: COLW[0], height: ROWH },
      action: { type: 'uri', label: '日記', uri: getDashboardUrl({ tab: 'diary' }) }
    },
    {
      bounds: { x: COL[1], y: ROW[1], width: COLW[1], height: ROWH },
      action: { type: 'uri', label: 'WANsta', uri: getDashboardUrl({ tab: 'wansta' }) }
    },
    {
      bounds: { x: COL[2], y: ROW[1], width: COLW[2], height: ROWH },
      action: { type: 'message', label: '今日の予定', text: '今日' }
    }
  ];
}

async function getChannelAccessToken(): Promise<string> {
  const sm = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });
  const res = await sm.send(new GetSecretValueCommand({ SecretId: SECRET_ID }));
  const secret = JSON.parse(res.SecretString || '{}');
  const token: string = secret.CHANNEL_ACCESS_TOKEN_LONG;
  if (!token) throw new Error('CHANNEL_ACCESS_TOKEN_LONG missing in secret');
  return token;
}

async function createRichMenu(token: string): Promise<string> {
  const res = await fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      size: { width: 2500, height: 1686 },
      selected: true,
      name: RICHMENU_NAME,
      chatBarText: 'メニュー',
      areas: buildAreas()
    })
  });
  if (!res.ok) {
    throw new Error(`create richmenu failed: ${res.status} ${await res.text()}`);
  }
  const { richMenuId } = (await res.json()) as { richMenuId: string };
  return richMenuId;
}

async function uploadImage(token: string, richMenuId: string): Promise<void> {
  const image = readFileSync(IMAGE_PATH);
  const res = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${token}` },
    body: image
  });
  if (!res.ok) {
    throw new Error(`upload image failed: ${res.status} ${await res.text()}`);
  }
}

async function setDefault(token: string, richMenuId: string): Promise<void> {
  const res = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    throw new Error(`set default failed: ${res.status} ${await res.text()}`);
  }
}

async function listRichMenus(token: string): Promise<{ richMenuId: string; name: string }[]> {
  const res = await fetch('https://api.line.me/v2/bot/richmenu/list', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    throw new Error(`list richmenus failed: ${res.status} ${await res.text()}`);
  }
  const { richmenus } = (await res.json()) as { richmenus: { richMenuId: string; name: string }[] };
  return richmenus;
}

async function deleteRichMenu(token: string, richMenuId: string): Promise<void> {
  const res = await fetch(`https://api.line.me/v2/bot/richmenu/${richMenuId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    console.warn(`WARN: failed to delete old richmenu ${richMenuId}: ${res.status} ${await res.text()}`);
  }
}

async function main() {
  const token = await getChannelAccessToken();

  console.log(`APP_VERSION: ${process.env.APP_VERSION}`);
  console.log('Generated links:');
  for (const area of buildAreas()) {
    if (area.action.type === 'uri') {
      console.log(`  - ${area.action.label}: ${area.action.uri}`);
    } else {
      console.log(`  - ${area.action.label}: message="${area.action.text}"`);
    }
  }

  console.log('Creating rich menu...');
  let richMenuId: string | undefined;
  try {
    richMenuId = await createRichMenu(token);
    console.log(`Created: ${richMenuId}`);

    console.log('Uploading image...');
    await uploadImage(token, richMenuId);
    console.log('Image uploaded.');

    console.log('Setting as default for all users...');
    await setDefault(token, richMenuId);
    console.log('Default set.');
  } catch (err) {
    console.error('FAILED:', (err as Error).message);
    // 作成済みだが未完成(画像なし/デフォルト未設定)のメニューを残さない
    if (richMenuId) {
      console.error(`Rolling back partially-created richmenu ${richMenuId}...`);
      await deleteRichMenu(token, richMenuId);
    }
    process.exit(1);
  }

  console.log('Cleaning up old rich menus...');
  const all = await listRichMenus(token);
  const others = all.filter(m => m.richMenuId !== richMenuId);
  for (const m of others) {
    console.log(`  Deleting old menu: ${m.richMenuId} (${m.name})`);
    await deleteRichMenu(token, m.richMenuId);
  }

  console.log('DONE');
  console.log(`  richMenuId: ${richMenuId}`);
  console.log(`  name: ${RICHMENU_NAME}`);
  console.log(`  remaining menus: ${all.length - others.length}`);
}

main().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
