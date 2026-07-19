import {
  buildFlexBubble,
  buildNotifyFlexBubble,
  buildTodayScheduleFlexBubble,
  buildReminderFlexBubble,
  buildMenuFlexBubble,
  ScheduleRow
} from '../../src/utils/line';
import { FLEX_COLORS } from '../../src/utils/constants';

// ---- helpers -------------------------------------------------------------

/** box.contents から type==='button' のものだけ抽出 */
function buttonsOf(box: any): any[] {
  return (box?.contents || []).filter((c: any) => c.type === 'button');
}

/** JSON往復させても undefined なキー混入がないかを検証するための丸め込み */
function roundTrip(obj: unknown): unknown {
  return JSON.parse(JSON.stringify(obj));
}

// ---- buildFlexBubble -------------------------------------------------------

describe('buildFlexBubble', () => {
  it('ヘッダーのタイトル・背景色が反映される', () => {
    const bubble: any = buildFlexBubble('🔑 ユーザーID', FLEX_COLORS.INFO, ['U1234'], []);
    expect(bubble.type).toBe('bubble');
    expect(bubble.header.backgroundColor).toBe(FLEX_COLORS.INFO);
    expect(bubble.header.contents[0].text).toBe('🔑 ユーザーID');
    expect(bubble.header.contents[0].color).toBe('#ffffff');
  });

  it('本文テキストが新パレットの BODY_TEXT 色で並ぶ', () => {
    const bubble: any = buildFlexBubble('タイトル', FLEX_COLORS.INFO, ['1行目', '2行目'], []);
    expect(bubble.body.contents).toHaveLength(2);
    expect(bubble.body.contents[0]).toMatchObject({ type: 'text', text: '1行目', color: FLEX_COLORS.BODY_TEXT, wrap: true });
    expect(bubble.body.contents[1].text).toBe('2行目');
  });

  it('ボタンが空配列のときは footer を持たない（空contentsの不正Boxを避ける）', () => {
    const bubble: any = buildFlexBubble('タイトル', FLEX_COLORS.SUCCESS, ['グループに送信しました'], []);
    expect(bubble.footer).toBeUndefined();
  });

  it('uriボタンは https の primary ボタンになり、区切り線が先頭に入る', () => {
    const bubble: any = buildFlexBubble('タイトル', FLEX_COLORS.SCHEDULE, ['本文'], [
      { label: '詳細を見る', uri: 'https://example.com/dashboard' }
    ]);
    expect(bubble.footer.type).toBe('box');
    expect(bubble.footer.contents[0]).toEqual({ type: 'separator', margin: 'md' });
    const btn = bubble.footer.contents[1];
    expect(btn.type).toBe('button');
    expect(btn.action).toEqual({ type: 'uri', label: '詳細を見る', uri: 'https://example.com/dashboard' });
    expect(btn.action.uri.startsWith('https://')).toBe(true);
    expect(btn.style).toBe('primary');
    expect(btn.color).toBe(FLEX_COLORS.SCHEDULE);
  });

  it('text指定なしのmessageボタンは label をそのまま送信テキストにする', () => {
    const bubble: any = buildFlexBubble('タイトル', FLEX_COLORS.SCHEDULE, ['本文'], [
      { label: '今日の予定' }
    ]);
    const btn = buttonsOf(bubble.footer)[0];
    expect(btn.action).toEqual({ type: 'message', label: '今日の予定', text: '今日の予定' });
    expect(btn.style).toBe('secondary');
  });

  it('JSON往復で undefined なキーが残らない', () => {
    const bubble = buildFlexBubble('タイトル', FLEX_COLORS.SCHEDULE, ['本文'], [{ label: 'ボタン', uri: 'https://x.example/' }]);
    expect(JSON.stringify(bubble)).not.toContain('undefined');
    expect(roundTrip(bubble)).toEqual(bubble);
  });
});

// ---- buildNotifyFlexBubble -------------------------------------------------

describe('buildNotifyFlexBubble', () => {
  it('1行目=太字md(誰が何をした)、2行目=灰色smプレビューになる', () => {
    const bubble: any = buildNotifyFlexBubble(
      '📔 ダイ日記が投稿されました',
      FLEX_COLORS.DIARY,
      'ママさんが日記を書きました',
      '今日の公園散歩',
      [{ label: '詳細をアプリで確認', uri: 'https://example.com/diary' }]
    );

    expect(bubble.header.backgroundColor).toBe(FLEX_COLORS.DIARY);
    expect(bubble.body.contents[0]).toMatchObject({
      text: 'ママさんが日記を書きました',
      weight: 'bold',
      size: 'md',
      color: FLEX_COLORS.BODY_TEXT
    });
    expect(bubble.body.contents[1]).toMatchObject({
      text: '今日の公園散歩',
      size: 'sm',
      color: FLEX_COLORS.MUTED
    });
  });

  it('プレビューが未指定のときは1行のみになる', () => {
    const bubble: any = buildNotifyFlexBubble(
      '📅 スケジュール更新',
      FLEX_COLORS.SCHEDULE,
      'パパさんが来週の予定を更新しました。',
      undefined,
      [{ label: '確認する', uri: 'https://example.com/schedule' }]
    );
    expect(bubble.body.contents).toHaveLength(1);
  });

  it('フッターにセパレータ+ボタンが積まれる', () => {
    const bubble: any = buildNotifyFlexBubble(
      '🐕 だいずの様子が更新されました',
      FLEX_COLORS.DAIZU,
      'ママさんが様子を記録しました',
      'お散歩楽しかった',
      [{ label: '詳細をアプリで確認', uri: 'https://example.com/yousu' }]
    );
    expect(bubble.footer.contents[0].type).toBe('separator');
    const btn = buttonsOf(bubble.footer)[0];
    expect(btn.action.uri).toMatch(/^https:\/\//);
  });

  it('全テキストノードが空文字列ではない', () => {
    const bubble: any = buildNotifyFlexBubble('タイトル', FLEX_COLORS.DIARY, '見出し', 'プレビュー', []);
    const texts = [bubble.header.contents[0], ...bubble.body.contents];
    for (const t of texts) {
      expect(typeof t.text).toBe('string');
      expect(t.text.length).toBeGreaterThan(0);
    }
  });
});

// ---- buildTodayScheduleFlexBubble ------------------------------------------

describe('buildTodayScheduleFlexBubble', () => {
  it('ヘッダーに日付を大きく表示する', () => {
    const bubble: any = buildTodayScheduleFlexBubble('7/14(火)', [], [{ label: '予定を登録する', uri: 'https://example.com' }]);
    expect(bubble.header.backgroundColor).toBe(FLEX_COLORS.SCHEDULE);
    expect(bubble.header.contents[0]).toMatchObject({ text: '7/14(火)', weight: 'bold', size: 'xl' });
    expect(bubble.header.contents[1].text).toContain('予定');
  });

  it('終日は緑文字・お休みはグレー文字で右寄せ表示される（horizontal行、flex比2:3、折返し対応）', () => {
    const rows: ScheduleRow[] = [
      { name: 'パパ', timeLabel: '終日', isOff: false },
      { name: 'ママ', timeLabel: 'お休み', isOff: true }
    ];
    const bubble: any = buildTodayScheduleFlexBubble('7/14(火)', rows, []);
    const rowBoxes = bubble.body.contents;
    expect(rowBoxes).toHaveLength(2);

    const papaHorizontal = rowBoxes[0].contents[0];
    expect(papaHorizontal.layout).toBe('horizontal');
    const [papaName, papaTime] = papaHorizontal.contents;
    expect(papaName).toMatchObject({ text: 'パパ', weight: 'bold', flex: 2, wrap: true });
    expect(papaTime).toMatchObject({ text: '終日', color: FLEX_COLORS.SCHEDULE, weight: 'bold', flex: 3, align: 'end', wrap: true });

    const mamaHorizontal = rowBoxes[1].contents[0];
    const [, mamaTime] = mamaHorizontal.contents;
    expect(mamaTime).toMatchObject({ text: 'お休み', color: FLEX_COLORS.MUTED, align: 'end', wrap: true });
    expect(mamaTime.weight).toBeUndefined();
  });

  it('複数スロットは「・」区切りで結合される', () => {
    const rows: ScheduleRow[] = [{ name: 'パパ', timeLabel: '9時〜・17時〜', isOff: false }];
    const bubble: any = buildTodayScheduleFlexBubble('7/14(火)', rows, []);
    const timeText = bubble.body.contents[0].contents[0].contents[1];
    expect(timeText.text).toBe('9時〜・17時〜');
  });

  it('4スロット+長い名前のときも行テキストが折返し対応', () => {
    const rows: ScheduleRow[] = [{ name: '田中太郎おじいちゃん', timeLabel: '9時〜・17時〜・21時〜・24時〜', isOff: false }];
    const bubble: any = buildTodayScheduleFlexBubble('7/14(火)', rows, []);
    const rowBox = bubble.body.contents[0].contents[0];
    expect(rowBox.layout).toBe('horizontal');
    const [nameText, timeText] = rowBox.contents;
    expect(nameText).toMatchObject({ text: '田中太郎おじいちゃん', weight: 'bold', flex: 2, wrap: true });
    expect(timeText).toMatchObject({ text: '9時〜・17時〜・21時〜・24時〜', weight: 'bold', flex: 3, align: 'end', wrap: true });
  });

  it('備考があれば行の下にxsグレーで折返し表示される', () => {
    const rows: ScheduleRow[] = [{ name: 'パパ', timeLabel: '終日', isOff: false, note: '午後は買い物予定' }];
    const bubble: any = buildTodayScheduleFlexBubble('7/14(火)', rows, []);
    const rowBox = bubble.body.contents[0];
    expect(rowBox.contents).toHaveLength(2);
    expect(rowBox.contents[1]).toMatchObject({ text: '午後は買い物予定', size: 'xs', color: FLEX_COLORS.MUTED, wrap: true });
  });

  it('備考がなければ行はbaselineボックスのみ', () => {
    const rows: ScheduleRow[] = [{ name: 'パパ', timeLabel: '終日', isOff: false }];
    const bubble: any = buildTodayScheduleFlexBubble('7/14(火)', rows, []);
    expect(bubble.body.contents[0].contents).toHaveLength(1);
  });

  it('0件のときは案内メッセージのみ表示', () => {
    const bubble: any = buildTodayScheduleFlexBubble('7/14(火)', [], [{ label: '予定を登録する', uri: 'https://example.com' }]);
    expect(bubble.body.contents).toHaveLength(1);
    expect(bubble.body.contents[0].text).toBe('まだ予定が登録されていません。');
    expect(buttonsOf(bubble.footer)[0].action.label).toBe('予定を登録する');
  });

  it('JSON往復で undefined なキーが残らない', () => {
    const rows: ScheduleRow[] = [
      { name: 'パパ', timeLabel: '終日', isOff: false, note: 'メモ' },
      { name: 'ママ', timeLabel: 'お休み', isOff: true }
    ];
    const bubble = buildTodayScheduleFlexBubble('7/14(火)', rows, [{ label: '詳細を見る', uri: 'https://example.com' }]);
    expect(JSON.stringify(bubble)).not.toContain('undefined');
    expect(roundTrip(bubble)).toEqual(bubble);
  });
});

// ---- buildReminderFlexBubble ------------------------------------------------

describe('buildReminderFlexBubble', () => {
  it('週範囲が見出しに大きく表示される', () => {
    const bubble: any = buildReminderFlexBubble(
      '7/21(月)〜7/27(日)',
      ['来週の予定入力をお忘れなく！', 'まだの方は早めにお願いします🙏'],
      [{ label: '予定を入力する', uri: 'https://example.com' }]
    );
    expect(bubble.header.backgroundColor).toBe(FLEX_COLORS.REMINDER);
    const weekText = bubble.header.contents.find((c: any) => c.text === '7/21(月)〜7/27(日)');
    expect(weekText).toMatchObject({ weight: 'bold', size: 'xl' });
  });

  it('案内文は1行目太字・2行目以降グレーで階層化される', () => {
    const bubble: any = buildReminderFlexBubble(
      '7/21(月)〜7/27(日)',
      ['来週の予定入力をお忘れなく！', 'まだの方は早めにお願いします🙏'],
      []
    );
    expect(bubble.body.contents[0]).toMatchObject({ text: '来週の予定入力をお忘れなく！', weight: 'bold', size: 'md' });
    expect(bubble.body.contents[1]).toMatchObject({ text: 'まだの方は早めにお願いします🙏', size: 'sm', color: FLEX_COLORS.MUTED });
  });

  it('ボタンのアクションが保持される', () => {
    const bubble: any = buildReminderFlexBubble('7/21(月)〜7/27(日)', ['案内'], [
      { label: '予定を入力する', uri: 'https://example.com/dashboard' }
    ]);
    const btn = buttonsOf(bubble.footer)[0];
    expect(btn.action).toEqual({ type: 'uri', label: '予定を入力する', uri: 'https://example.com/dashboard' });
  });
});

// ---- buildMenuFlexBubble -----------------------------------------------------

describe('buildMenuFlexBubble', () => {
  // 呼び出し側で完成させたURLを渡す想定（appv等のクエリを含む現実的な値で検証）。
  const homeUrl = 'https://example.com/dashboard.html?appv=abc123';
  const diaryUrl = 'https://example.com/dashboard.html?tab=diary&action=new&appv=abc123';
  const liffUrl = 'https://liff.line.me/xxx';

  it('既存のボタンアクションが維持される（渡されたURLをそのまま使い、連結しない）', () => {
    const bubble: any = buildMenuFlexBubble(homeUrl, diaryUrl, liffUrl);
    const btns = buttonsOf(bubble.body);
    expect(btns).toHaveLength(4);
    expect(btns[0].action).toEqual({ type: 'message', label: '📅 今日の予定', text: '今日' });
    expect(btns[1].action).toEqual({ type: 'uri', label: '🐕 だいずの様子', uri: `${liffUrl}?mode=daizu` });
    expect(btns[2].action).toEqual({ type: 'uri', label: '📝 日記を入力', uri: diaryUrl });
    expect(btns[3].action).toEqual({ type: 'uri', label: '🏠 サイトを開く', uri: homeUrl });
  });

  it('サイトを開くボタンの手前に区切り線が入り視覚的に分離される', () => {
    const bubble: any = buildMenuFlexBubble(homeUrl, diaryUrl, liffUrl);
    const contents = bubble.body.contents;
    const separatorIdx = contents.findIndex((c: any) => c.type === 'separator');
    const siteButtonIdx = contents.findIndex((c: any) => c.action?.uri === homeUrl);
    expect(separatorIdx).toBeGreaterThan(-1);
    expect(siteButtonIdx).toBe(separatorIdx + 1);
  });

  it('サイトを開くボタンは SITE_BUTTON 色の primary スタイル', () => {
    const bubble: any = buildMenuFlexBubble(homeUrl, diaryUrl, liffUrl);
    const siteBtn = buttonsOf(bubble.body).find((b: any) => b.action.uri === homeUrl);
    expect(siteBtn.style).toBe('primary');
    expect(siteBtn.color).toBe(FLEX_COLORS.SITE_BUTTON);
  });

  it('ヘッダーが新パレット(SCHEDULE)を使う', () => {
    const bubble: any = buildMenuFlexBubble(homeUrl, diaryUrl, liffUrl);
    expect(bubble.header.backgroundColor).toBe(FLEX_COLORS.SCHEDULE);
  });
});

// ---- リグレッションガード: 二重"?"連結の再発防止 ----------------------------

describe('URI二重クエリガード（getDashboardUrl().appv連結バグの再発防止）', () => {
  /** メッセージオブジェクトを再帰的に走査し、type:'uri' の action.uri / FlexButton.uri を全て集める */
  function collectUris(node: unknown, out: string[]): void {
    if (Array.isArray(node)) {
      node.forEach(n => collectUris(n, out));
      return;
    }
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      if (typeof obj.uri === 'string') out.push(obj.uri);
      for (const v of Object.values(obj)) collectUris(v, out);
    }
  }

  it('メニューバブル + 通知バブル群の全uriに"?"が2つ以上含まれない', () => {
    // 実際の getDashboardUrl(...) が返す形（appv付き）を模した現実的なURL
    const appv = 'deadbeef';
    const dashboardUrl = (params: Record<string, string> = {}) => {
      const q = new URLSearchParams({ ...params, appv });
      return `https://example.com/dashboard.html?${q.toString()}`;
    };
    const liffUrl = 'https://liff.line.me/xxx';

    const menuBubble = buildMenuFlexBubble(
      dashboardUrl(),
      dashboardUrl({ tab: 'diary', action: 'new' }),
      liffUrl
    );
    const diaryNotifyBubble = buildNotifyFlexBubble(
      '📔 ダイ日記が投稿されました', FLEX_COLORS.DIARY, '見出し', 'プレビュー',
      [{ label: '詳細をアプリで確認', uri: dashboardUrl({ tab: 'diary' }) }]
    );
    const yousuNotifyBubble = buildNotifyFlexBubble(
      '🐕 だいずの様子が更新されました', FLEX_COLORS.DAIZU, '見出し', 'プレビュー',
      [{ label: '詳細をアプリで確認', uri: dashboardUrl({ tab: 'yousu' }) }]
    );

    const uris: string[] = [];
    collectUris([menuBubble, diaryNotifyBubble, yousuNotifyBubble], uris);

    expect(uris.length).toBeGreaterThan(0);
    for (const uri of uris) {
      expect(uri).not.toMatch(/\?[^#]*\?/);
    }
  });
});
