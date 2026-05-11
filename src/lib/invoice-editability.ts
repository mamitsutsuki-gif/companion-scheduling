/**
 * 請求書を編集できる期間の判定。
 *  - 既定: 当月 と 前月 のみ編集可。
 *  - 管理者が個別にアンロックした (partnerId, year, month) はサーバー側で例外的に true。
 *
 * UI 側はまずこの関数で初期判定し、サーバー側は API で同じロジック + アンロック状態を確認する。
 */
export function isMonthWithinDefaultEditWindow(
  year: number,
  month: number,
  today: Date = new Date(),
): boolean {
  const target = year * 12 + (month - 1);
  const current = today.getFullYear() * 12 + today.getMonth();
  return target === current || target === current - 1;
}

/** YYYY-MM 表記。 */
export function ym(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** 「今日」が対象月の最終日以降か（その月の請求書を促す通知のトリガ） */
export function isAtOrAfterEndOfMonth(
  year: number,
  month: number,
  today: Date = new Date(),
): boolean {
  const endOfTargetMonth = new Date(year, month, 0); // 該当月の末日
  // 当日含む
  return (
    today.getFullYear() > year ||
    (today.getFullYear() === year && today.getMonth() + 1 > month) ||
    (today.getFullYear() === year &&
      today.getMonth() + 1 === month &&
      today.getDate() >= endOfTargetMonth.getDate())
  );
}
