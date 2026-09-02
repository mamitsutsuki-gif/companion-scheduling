import type { SessionAbandonmentReason } from "@/lib/repositories/session-abandonment-repository";

export function isClientFacingRole(role: string): boolean {
  return role === "CLIENT" || role === "CLIENT_ADMIN" || role === "CLIENT_HR";
}

/** パートナー・管理者向けの未実施・消化理由の表示文言 */
export function sessionAbandonmentReasonLabel(reason: SessionAbandonmentReason): string {
  if (reason === "no_show") return "クライアントが連絡なく参加しなかった";
  if (reason === "late_cancel") return "クライアントが24時間前を過ぎてキャンセルした";
  return "運営により日程再調整（当該日時は未実施・消化）";
}

export type SessionAbandonmentDisplay = {
  label: string;
  badgeClass: string;
  rowClass: string;
  /** クライアント向けの補足（admin_reschedule 時のみ） */
  clientNotice: string | null;
};

/** ロールと理由に応じたセッション行・バッジ表示 */
export function sessionAbandonmentDisplayForViewer(
  reason: SessionAbandonmentReason,
  options: { isClientViewer: boolean },
): SessionAbandonmentDisplay {
  if (options.isClientViewer && reason === "admin_reschedule") {
    return {
      label: "日程再調整中",
      badgeClass: "border-amber-300 bg-amber-50 text-amber-900",
      rowClass: "border-amber-200 bg-amber-50/60",
      clientNotice:
        "運営の都合により、確定していた日程を解除しました。チャットの案内どおり、担当パートナーから新しい候補日時をご案内します。以前お送りした確定メールの日程は無効です。",
    };
  }
  return {
    label: "未実施・消化",
    badgeClass: "border-red-300 bg-red-50 text-red-800",
    rowClass: "border-red-200 bg-red-50/60",
    clientNotice: null,
  };
}
