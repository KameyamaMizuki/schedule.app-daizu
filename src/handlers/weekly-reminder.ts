/**
 * 毎週金曜10:00：翌週の予定入力リマインド
 * EventBridge Scheduler → Lambda
 */

import { Handler } from 'aws-lambda';
import { getSystemConfig } from '../utils/dynamodb';
import { getLineCredentials } from '../utils/secrets';
import { generateNextWeekId, getWeekInfo } from '../utils/weekId';
import { pushFlexMessage, buildReminderFlexBubble, getCommonQuickReply } from '../utils/line';
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

  const dashboardUrl = getDashboardUrl({ weekId, tab: 'schedule' });
  const weekRangeLabel = `${startMonth}/${startDay}(月)〜${endMonth}/${endDay}(日)`;

  const flex = buildReminderFlexBubble(
    weekRangeLabel,
    ['来週の予定入力をお忘れなく！', 'まだの方は早めにお願いします🙏'],
    [{ label: '予定を入力する', uri: dashboardUrl }]
  );

  const quickReply = getCommonQuickReply(dashboardUrl);
  await pushFlexMessage(config.groupId, `来週(${weekRangeLabel})の予定入力リマインド`, flex, credentials.channelAccessToken, quickReply);
  console.log('Friday reminder sent for week:', weekId);
}
