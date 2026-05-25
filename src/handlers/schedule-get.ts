/**
 * GET /schedule/{weekId}
 * LIFF取得API
 */

import { ScheduleGetResponse } from '../types';
import { getScheduleInput } from '../utils/dynamodb';
import { getWeekInfo } from '../utils/weekId';
import { getLineCredentials } from '../utils/secrets';
import { withHandler, ok, err } from '../utils/handler';

export const handler = withHandler(async (event) => {
  const weekId = event.pathParameters?.weekId || '';
  const userId = event.queryStringParameters?.userId || '';

  if (!weekId || !userId) return err('Missing weekId or userId');

  const weekInfo = getWeekInfo(weekId);
  const credentials = await getLineCredentials();
  const isAdmin = userId === credentials.adminUserId;
  const input = await getScheduleInput(weekId, userId);

  const response: ScheduleGetResponse = {
    weekId,
    startDate: weekInfo.startDate,
    endDate: weekInfo.endDate,
    deadline: weekInfo.deadline,
    isLocked: false,
    slots: input?.slots || {},
    notes: input?.notes || {},
    isAdmin
  };

  return ok(response);
});

