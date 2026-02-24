/**
 * POST /schedule/submit
 * スケジュール入力保存API（変更検出機能付き）
 */

import { z } from 'zod';
import { ScheduleSubmitRequest } from '../types';
import { saveScheduleInput, getScheduleInput, getSystemConfig } from '../utils/dynamodb';
import { getLineCredentials } from '../utils/secrets';
import { pushMessage } from '../utils/line';
import { withHandler, ok, err } from '../utils/handler';

const SubmitSchema = z.object({
  weekId: z.string().min(1),
  userId: z.string().min(1),
  displayName: z.string().min(1),
  slots: z.record(z.boolean()),
  notes: z.record(z.string()).optional()
});

interface ChangeInfo {
  addedSlots: string[];
  removedSlots: string[];
  changedNotes: Array<{ date: string; oldNote: string; newNote: string }>;
}

/**
 * 既存データと新規データを比較して変更箇所を検出
 */
async function detectChanges(
  weekId: string,
  userId: string,
  newSlots: { [key: string]: boolean },
  newNotes: { [dateStr: string]: string } | undefined
): Promise<{ changes: ChangeInfo | null; isNewEntry: boolean }> {
  const existing = await getScheduleInput(weekId, userId);

  if (!existing) {
    return { changes: null, isNewEntry: true };
  }

  const changes: ChangeInfo = { addedSlots: [], removedSlots: [], changedNotes: [] };

  // スロット変更検出
  const allSlotKeys = new Set([
    ...Object.keys(existing.slots || {}),
    ...Object.keys(newSlots)
  ]);

  for (const key of allSlotKeys) {
    const wasSelected = existing.slots?.[key] || false;
    const isSelected = newSlots[key] || false;
    if (!wasSelected && isSelected) {
      changes.addedSlots.push(key);
    } else if (wasSelected && !isSelected) {
      changes.removedSlots.push(key);
    }
  }

  // 備考変更検出
  const allDateKeys = new Set([
    ...Object.keys(existing.notes || {}),
    ...Object.keys(newNotes || {})
  ]);

  for (const date of allDateKeys) {
    const oldNote = existing.notes?.[date] || '';
    const newNote = newNotes?.[date] || '';
    if (oldNote !== newNote) {
      changes.changedNotes.push({ date, oldNote, newNote });
    }
  }

  const hasChanges = changes.addedSlots.length > 0 ||
                     changes.removedSlots.length > 0 ||
                     changes.changedNotes.length > 0;

  return { changes: hasChanges ? changes : null, isNewEntry: false };
}

export const handler = withHandler(async (event) => {
  const parsed = SubmitSchema.safeParse(JSON.parse(event.body || '{}'));
  if (!parsed.success) return err(parsed.error.issues[0].message);

  const { weekId, userId, displayName, slots, notes } = parsed.data;

  // 変更検出（保存前に実行）
  const { changes, isNewEntry } = await detectChanges(weekId, userId, slots, notes);

  // 保存（通知より先に実行 - 通知失敗で保存がブロックされるのを防止）
  await saveScheduleInput({
    weekId,
    userId,
    displayName,
    slots,
    notes: notes || {},
    submittedAt: new Date().toISOString(),
    isLocked: false
  });

  // グループに通知（ベストエフォート - 失敗しても保存は成功扱い）
  try {
    const credentials = await getLineCredentials();
    const config = await getSystemConfig();
    if (config?.groupId && (changes || isNewEntry)) {
      const s3BaseUrl = 'https://family-schedule-web-kame-982312822872.s3.ap-northeast-1.amazonaws.com';
      const dashboardUrl = `${s3BaseUrl}/dashboard.html?weekId=${weekId}`;
      await pushMessage(config.groupId, buildNotificationMessage(displayName, dashboardUrl), credentials.channelAccessToken);
    }
  } catch (notifyError) {
    console.error('Notification failed (save succeeded):', notifyError);
  }

  return ok({ message: 'Success' });
});

/**
 * 通知メッセージを生成
 */
function buildNotificationMessage(displayName: string, dashboardUrl: string): string {
  return `来週の予定を${displayName}さんが更新しました。\n\n▼修正する場合はこちら\n${dashboardUrl}`;
}

