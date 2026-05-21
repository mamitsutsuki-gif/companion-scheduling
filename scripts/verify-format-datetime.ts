/**
 * App Hosting は UTC で動くため、メール用日時は明示的な timeZone が必須。
 * ブラウザ（JST）と同じ表示になることを検証する。
 */
import { formatJaDateTime, formatJaDateTimeRange } from "../src/lib/format-datetime";

// 12:00 JST = 03:00 UTC（5/21 の例と同じ 9 時間差）
const startUtc = "2025-05-21T03:00:00.000Z";
const endUtc = "2025-05-21T03:30:00.000Z";

const range = formatJaDateTimeRange(startUtc, endUtc, "Asia/Tokyo");
const startOnly = formatJaDateTime(startUtc, "Asia/Tokyo");

const failures: string[] = [];

if (range.includes("03:00") || range.includes("04:00") || range.includes("05:00")) {
  failures.push(`formatJaDateTimeRange must not show UTC wall clock: ${range}`);
}
if (!range.includes("12:00") || !range.includes("12:30")) {
  failures.push(`formatJaDateTimeRange expected 12:00/12:30 JST: ${range}`);
}
if (!startOnly.includes("12:00")) {
  failures.push(`formatJaDateTime expected 12:00 JST: ${startOnly}`);
}

if (failures.length > 0) {
  console.error("[verify-format-datetime] FAILED");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("[verify-format-datetime] OK", range);
