import type { SessionAbandonmentReason } from "@/lib/repositories/session-abandonment-repository";

/** パートナー・管理者向けの未実施・消化理由の表示文言 */
export function sessionAbandonmentReasonLabel(reason: SessionAbandonmentReason): string {
  if (reason === "no_show") return "クライアントが連絡なく参加しなかった";
  if (reason === "late_cancel") return "クライアントが24時間前を過ぎてキャンセルした";
  return "運営により日程再調整（当該日時は未実施・消化）";
}
