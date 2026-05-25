/**
 * weekId生成・日付計算ユーティリティ
 */

import { format, addDays, startOfWeek, parseISO } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

const TIMEZONE = 'Asia/Tokyo';

/**
 * 指定日の翌週月曜日を起点としたweekIdを生成
 * フォーマット: YYYY-MM-DD (月曜日の日付)
 */
export function generateNextWeekId(baseDate: Date = new Date()): string {
  const jstDate = toZonedTime(baseDate, TIMEZONE);
  const nextMonday = addDays(startOfWeek(jstDate, { weekStartsOn: 1 }), 7);
  return format(nextMonday, 'yyyy-MM-dd');
}

/**
 * 指定日が含まれる週の月曜日をweekIdとして生成
 * フォーマット: YYYY-MM-DD (月曜日の日付)
 */
export function getCurrentWeekId(baseDate: Date = new Date()): string {
  const jstDate = toZonedTime(baseDate, TIMEZONE);
  const monday = startOfWeek(jstDate, { weekStartsOn: 1 });
  return format(monday, 'yyyy-MM-dd');
}

/**
 * 指定日の前週月曜日を起点としたweekIdを生成
 * フォーマット: YYYY-MM-DD (月曜日の日付)
 */
export function getPreviousWeekId(baseDate: Date = new Date()): string {
  const jstDate = toZonedTime(baseDate, TIMEZONE);
  const previousMonday = addDays(startOfWeek(jstDate, { weekStartsOn: 1 }), -7);
  return format(previousMonday, 'yyyy-MM-dd');
}

/**
 * weekIdから対象週の情報を取得
 */
export function getWeekInfo(weekId: string): {
  startDate: string;
  endDate: string;
  deadline: string;
  dates: string[];
} {
  const monday = parseISO(weekId);
  const sunday = addDays(monday, 6);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    dates.push(format(addDays(monday, i), 'yyyy-MM-dd'));
  }

  // 締切: 日曜23:59 (JST) - 月曜0:00に確定処理
  const sundayJst = toZonedTime(sunday, TIMEZONE);
  sundayJst.setHours(23, 59, 0, 0);
  const deadlineUtc = fromZonedTime(sundayJst, TIMEZONE);

  return {
    startDate: format(monday, 'yyyy-MM-dd'),
    endDate: format(sunday, 'yyyy-MM-dd'),
    deadline: deadlineUtc.toISOString(),
    dates
  };
}

/**
 * 現在時刻が締切を過ぎているか判定
 */
export function isAfterDeadline(weekId: string): boolean {
  const { deadline } = getWeekInfo(weekId);
  const now = new Date();
  return now > new Date(deadline);
}

/**
 * 日付文字列から曜日を取得（日本語）
 */
export function getDayOfWeekJa(dateStr: string): string {
  const date = parseISO(dateStr);
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return days[date.getDay()];
}

/**
 * 土日判定
 * dateStrはYYYY-MM-DD形式
 * ツェラーの公式で直接曜日を計算
 */
export function isWeekend(dateStr: string): boolean {
  const [year, month, day] = dateStr.split('-').map(Number);
  // ツェラーの公式で曜日を計算
  let y = year;
  let m = month;
  if (m < 3) {
    m += 12;
    y -= 1;
  }
  const k = y % 100;
  const j = Math.floor(y / 100);
  const h = (day + Math.floor(13 * (m + 1) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) - 2 * j) % 7;
  // h: 0=土, 1=日, 2=月, 3=火, 4=水, 5=木, 6=金
  // 負の剰余を処理
  const hNormalized = ((h % 7) + 7) % 7;
  return hNormalized === 0 || hNormalized === 1; // 0=土, 1=日
}

/**
 * 週の状態を判定
 * - 集計中: 入力期間中（前週の月曜0:00から前週の日曜23:59まで）
 * - 確定: 確定済み（その週の月曜0:00に確定）
 *
 * 例: 1/19(月)0:00 → 1/19週を確定、1/26週の入力開始
 */
export function getWeekState(weekId: string): '集計中' | '締切後' | '確定' {
  const now = new Date();

  // 確定時刻: その週の月曜0:00 JST
  const monday = parseISO(weekId);
  const mondayJst = toZonedTime(monday, TIMEZONE);
  mondayJst.setHours(0, 0, 0, 0);
  const mondayUtc = fromZonedTime(mondayJst, TIMEZONE);

  if (now >= mondayUtc) {
    return '確定';
  }

  // それ以外は集計中（まだその週が始まっていない）
  return '集計中';
}

/**
 * 現在入力を受け付けている週のweekIdを取得
 * 月曜0:00に今週を確定 → 翌週が入力対象
 * 例: 1/19(月)0:00 → 1/19週を確定、1/26週が入力対象
 */
export function getInputWeekId(baseDate: Date = new Date()): string {
  return generateNextWeekId(baseDate);
}
