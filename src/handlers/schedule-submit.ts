/**
 * POST /schedule/submit
 * スケジュール入力保存API（変更検出機能付き）
 */

import { z } from 'zod';
import { ScheduleSubmitRequest } from '../types';
import { saveScheduleInput, getScheduleInput, getSystemConfig } from '../utils/dynamodb';
import { getLineCredentials } from '../utils/secrets';
import { pushFlexMessage, buildFlexBubble, getCommonQuickReply } from '../utils/line';
import { withHandler, ok, err } from '../utils/handler';
import { getDashboardUrl, getHomeUrl, FLEX_COLORS, DB_KEYS } from '../utils/constants';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const SubmitSchema = z.object({
  weekId: z.string().min(1),
  userId: z.string().min(1),
  displayName: z.string().min(1),
  slots: z.record(z.boolean()),
  notes: z.record(z.string()).optional(),
  skipNotification: z.boolean().optional(),
  notifierName: z.string().optional()
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

  // グループに通知（ベストエフォート - skipNotification の場合はスキップ）
  if (!parsed.data.skipNotification) {
    try {
      const credentials = await getLineCredentials();
      const config = await getSystemConfig();

      if (config?.groupId) {
        if (userId === DB_KEYS.DAIZU_STATUS_USER) {
          // だいずステータス通知
          const now = new Date();
          const jstNow = toZonedTime(now, 'Asia/Tokyo');
          const todayStr = format(jstNow, 'yyyy-MM-dd');
          const month = jstNow.getMonth() + 1;
          const day = jstNow.getDate();
          const dayNames = ['日','月','火','水','木','金','土'];
          const dayOfWeek = dayNames[jstNow.getDay()];
          const noteText = notes?.[todayStr] || '';

          if (noteText) {
            const calendarUrl = getDashboardUrl({ tab: 'schedule', subTab: 'calendar' });
            const flex = buildFlexBubble(
              `🐕 だいずの様子 ${month}/${day}(${dayOfWeek})`,
              FLEX_COLORS.DAIZU,
              [noteText],
              [{ label: 'カレンダーを見る', uri: calendarUrl }]
            );
            const quickReply = getCommonQuickReply(getDashboardUrl(), getHomeUrl(), credentials.liffUrl);
            await pushFlexMessage(config.groupId, 'だいずの様子', flex, credentials.channelAccessToken, quickReply);
          }
        } else if (changes || isNewEntry) {
          // スケジュール更新通知（既存ロジック）
          const dashboardUrl = getDashboardUrl({ weekId });
          const notifier = parsed.data.notifierName || displayName;
          const flex = buildFlexBubble(
            '📅 スケジュール更新',
            FLEX_COLORS.SCHEDULE,
            [`${notifier}さんが来週の予定を更新しました。`],
            [
              { label: '確認する', uri: dashboardUrl },
              { label: '今日の予定', text: '今日' }
            ]
          );
          const quickReply = getCommonQuickReply(dashboardUrl, getHomeUrl(), credentials.liffUrl);
          await pushFlexMessage(config.groupId, 'スケジュール更新', flex, credentials.channelAccessToken, quickReply);
        }
      }
    } catch (notifyError) {
      console.error('Notification failed (save succeeded):', notifyError);
    }
  }

  return ok({ message: 'Success' });
});


