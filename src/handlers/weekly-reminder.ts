/**
 * 毎週金曜10:00：翌週の予定入力リマインド
 * EventBridge Scheduler → Lambda
 */

import { Handler } from 'aws-lambda';
import { getSystemConfig } from '../utils/dynamodb';
import { getLineCredentials } from '../utils/secrets';
import { generateNextWeekId, getWeekInfo } from '../utils/weekId';
import { pushMessage } from '../utils/line';
import { getDashboardUrl } from '../utils/constants';

export const handler: Handler = async () => {
  const config = await getSystemConfig();
  if (!config?.groupId) {
    console.error('GroupId not found in SystemConfig');
    throw new Error('GroupId not configured');
  }

  const credentials = await getLineCredentials();
  const weekId = generateNextWeekId();
  const weekInfo = getWeekInfo(weekId);

  const startDate = new Date(weekInfo.startDate);
  const endDate = new Date(weekInfo.endDate);
  const startMonth = startDate.getMonth() + 1;
  const startDay = startDate.getDate();
  const endMonth = endDate.getMonth() + 1;
  const endDay = endDate.getDate();

  const dashboardUrl = getDashboardUrl(weekId);
  const message = `【リマインド】\n来週（${startMonth}/${startDay}(月)〜${endMonth}/${endDay}(日)）の予定入力をお忘れなく！\nまだの方は早めにお願いします🙏\n\n▼管理ページ（入力・確認・調整）\n${dashboardUrl}`;

  await pushMessage(config.groupId, message, credentials.channelAccessToken);
  console.log('Friday reminder sent for week:', weekId);
}
