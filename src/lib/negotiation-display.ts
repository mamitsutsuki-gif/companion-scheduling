import { resolveAppTimeZone } from "@/lib/format-datetime";
import { zonedWallClockToUtc } from "@/lib/slot-schedule";

export type NegotiationStatusKey =
  | "AWAITING_CLIENT_RESPONSE"
  | "NEEDS_NEW_PROPOSAL"
  | "AWAITING_PARTNER_CONFIRM"
  | "CONFIRMED"
  | "SUPERSEDED";

/** 画面表示用ステータス（ユーザー指定ラベル） */
export type ScheduleDisplayStatus =
  | "未提示"
  | "候補提示中"
  | "クライアント回答待ち"
  | "担当パートナー確定待ち"
  | "確定"
  | "再調整中"
  | "キャンセル";

export const SCHEDULE_STATUS_LABEL: Record<ScheduleDisplayStatus, string> = {
  未提示: "未提示",
  候補提示中: "候補提示中",
  クライアント回答待ち: "クライアント回答待ち",
  "担当パートナー確定待ち": "担当パートナー確定待ち",
  確定: "確定",
  再調整中: "再調整中",
  キャンセル: "キャンセル",
};

export function computeResponseDeadline(proposedAt: Date, timezone: string): Date {
  const tz = resolveAppTimeZone(timezone);
  const deadline = new Date(proposedAt);
  deadline.setDate(deadline.getDate() + 3);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(deadline);
  const y = parts.find((p) => p.type === "year")?.value ?? "2026";
  const mo = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return zonedWallClockToUtc(`${y}-${mo}-${d}`, "18:00", tz);
}

export function formatResponseDeadlineJa(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: resolveAppTimeZone(timezone),
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function isResponseDeadlinePassed(deadlineIso: string | null | undefined): boolean {
  if (!deadlineIso) return false;
  return Date.now() > new Date(deadlineIso).getTime();
}

export function resolveScheduleDisplayStatus(input: {
  status?: NegotiationStatusKey | null;
  rescheduleRequestedAt?: string | null;
  hasAnyNegotiation?: boolean;
}): ScheduleDisplayStatus {
  if (!input.hasAnyNegotiation && !input.status) return "未提示";
  if (input.status === "SUPERSEDED") return "再調整中";
  if (input.status === "NEEDS_NEW_PROPOSAL" || input.rescheduleRequestedAt) return "再調整中";
  if (input.status === "AWAITING_CLIENT_RESPONSE") return "クライアント回答待ち";
  if (input.status === "AWAITING_PARTNER_CONFIRM") return "担当パートナー確定待ち";
  if (input.status === "CONFIRMED") return "確定";
  return "未提示";
}

export const LEGACY_STATUS_LABEL: Record<NegotiationStatusKey, string> = {
  AWAITING_CLIENT_RESPONSE: "クライアント回答待ち",
  NEEDS_NEW_PROPOSAL: "再調整中",
  AWAITING_PARTNER_CONFIRM: "担当パートナー確定待ち",
  CONFIRMED: "確定",
  SUPERSEDED: "再調整中",
};
