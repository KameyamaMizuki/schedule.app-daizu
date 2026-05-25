/**
 * GET /schedule/week/{weekId}
 * 週ごとの全ユーザーデータ取得API（ダッシュボード最適化用）
 */

import { getAllScheduleInputs } from '../utils/dynamodb';
import { getWeekInfo } from '../utils/weekId';
import { withHandler, ok, err } from '../utils/handler';

export const handler = withHandler(async (event) => {
  const weekId = event.pathParameters?.weekId || '';
  if (!weekId) return err('Missing weekId');

  const weekInfo = getWeekInfo(weekId);
  const inputs = await getAllScheduleInputs(weekId);

  return ok({
    weekId,
    startDate: weekInfo.startDate,
    endDate: weekInfo.endDate,
    deadline: weekInfo.deadline,
    dates: weekInfo.dates,
    isLocked: false,
    users: inputs.map(input => ({
      userId: input.userId,
      displayName: input.displayName,
      slots: input.slots || {},
      notes: input.notes || {},
      submittedAt: input.submittedAt
    }))
  });
});
