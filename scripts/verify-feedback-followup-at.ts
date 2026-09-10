/**
 * computeClientFeedbackFollowupAt のカレンダー日オフセット検証（ローカル実行用）。
 * npx tsx scripts/verify-feedback-followup-at.ts
 */
import assert from "node:assert/strict";
import { computeClientFeedbackFollowupAt } from "../src/lib/session-feedback-cron";

function jstParts(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return fmt.format(d);
}

// 2026-09-09 18:00 JST = 2026-09-09 09:00 UTC
const end = new Date("2026-09-09T09:00:00.000Z");
const d1 = computeClientFeedbackFollowupAt(end, 1, "Asia/Tokyo");
const d3 = computeClientFeedbackFollowupAt(end, 3, "Asia/Tokyo");

assert.equal(jstParts(d1), "2026-09-10, 08:30");
assert.equal(jstParts(d3), "2026-09-12, 08:30");

console.log("ok: feedback followup remindAt (JST +1d/+3d @ 08:30)");
