/** アプリ全体のデフォルト表示タイムゾーン（日程調整の設定と揃える） */
export const DEFAULT_APP_TIMEZONE = "Asia/Tokyo";

export function resolveAppTimeZone(timeZone?: string | null): string {
  const tz = (timeZone ?? "").trim();
  return tz.length > 0 ? tz : DEFAULT_APP_TIMEZONE;
}

function toDate(input: Date | string): Date {
  return input instanceof Date ? input : new Date(input);
}

/**
 * サーバー側メール・通知用の日時表示。
 * timeZone 未指定だとホスト TZ（App Hosting では UTC）になり、アプリ表示とずれる。
 */
export function formatJaDateTime(
  input: Date | string,
  timeZone: string = DEFAULT_APP_TIMEZONE,
): string {
  const d = toDate(input);
  if (Number.isNaN(d.valueOf())) return String(input);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: resolveAppTimeZone(timeZone),
    weekday: "short",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** メール本文など「開始〜終了」1 行用 */
export function formatJaDateTimeRange(
  start: Date | string,
  end: Date | string,
  timeZone: string = DEFAULT_APP_TIMEZONE,
): string {
  return `${formatJaDateTime(start, timeZone)}〜${formatJaDateTime(end, timeZone)}`;
}
