import type { ActionItem, ComputeInput, MatchSnapshot, SessionPlanSnapshot } from "@/lib/next-actions";
import { computeAllActions } from "@/lib/next-actions";
import { roleplaySideComplete, type RoleplayStore } from "@/lib/coaching-roleplay";

export type TodayFocusNextSession = {
  matchId: string;
  label: string;
  sessionNumber: number;
  startAt: string;
  /** 0 = 今日, 1 = 明日, それ以上 = N日後 */
  daysUntil: number;
};

export type TodayFocusPendingVote = {
  matchId: string;
  label: string;
  sessionNumber: number;
  href: string;
};

export type TodayFocusPendingRoleplay = {
  matchId: string;
  label: string;
  sessionNumber: number;
  href: string;
};

export type TodayFocus = {
  nextSession: TodayFocusNextSession | null;
  pendingVotes: TodayFocusPendingVote[];
  pendingRoleplay: TodayFocusPendingRoleplay[];
  topAction: ActionItem | null;
  /** 詳細リスト用（既存の next-actions 互換） */
  allActions: ActionItem[];
  /** コーチングプランのペアがある（ロールプレイ行を常時表示） */
  hasCoachingMatches: boolean;
};

export type TodayFocusMatchMeta = {
  matchId: string;
  companyPlan: string;
  roleplayStore: RoleplayStore | null;
};

function otherLabel(match: MatchSnapshot, role: ComputeInput["me"]["role"]) {
  const isClientSide =
    role === "CLIENT" || role === "CLIENT_ADMIN" || role === "CLIENT_HR";
  return isClientSide ? `${match.partnerName}さん` : `${match.clientName}さん`;
}

function calendarDaysUntil(now: Date, target: Date, timeZone = "Asia/Tokyo") {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
      d,
    );
  const a = new Date(fmt(now));
  const b = new Date(fmt(target));
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function findNextSession(
  matches: MatchSnapshot[],
  sessionPlanByMatch: Record<string, SessionPlanSnapshot[]>,
  role: ComputeInput["me"]["role"],
  now: Date,
): TodayFocusNextSession | null {
  let best: TodayFocusNextSession | null = null;
  for (const m of matches) {
    const plan = sessionPlanByMatch[m.matchId] ?? [];
    const upcoming = plan
      .filter((s) => s.confirmed && s.startAt && new Date(s.startAt) > now)
      .sort((a, b) => new Date(a.startAt!).getTime() - new Date(b.startAt!).getTime())[0];
    if (!upcoming?.startAt) continue;
    const start = new Date(upcoming.startAt);
    const daysUntil = Math.max(0, calendarDaysUntil(now, start));
    const candidate: TodayFocusNextSession = {
      matchId: m.matchId,
      label: otherLabel(m, role),
      sessionNumber: upcoming.sessionNumber,
      startAt: upcoming.startAt,
      daysUntil,
    };
    if (!best || new Date(candidate.startAt).getTime() < new Date(best.startAt).getTime()) {
      best = candidate;
    }
  }
  return best;
}

function findPendingVotes(
  matches: MatchSnapshot[],
  negotiationsByMatch: ComputeInput["negotiationsByMatch"],
  role: ComputeInput["me"]["role"],
): TodayFocusPendingVote[] {
  const isClientSide =
    role === "CLIENT" || role === "CLIENT_ADMIN" || role === "CLIENT_HR";
  if (!isClientSide) return [];

  const out: TodayFocusPendingVote[] = [];
  for (const m of matches) {
    const negs = negotiationsByMatch[m.matchId] ?? [];
    for (const n of negs) {
      if (n.status === "AWAITING_CLIENT_RESPONSE") {
        out.push({
          matchId: m.matchId,
          label: otherLabel(m, role),
          sessionNumber: n.sessionNumber,
          href: `/match/${m.matchId}#schedule`,
        });
        break;
      }
    }
  }
  return out.sort((a, b) => a.sessionNumber - b.sessionNumber);
}

function findPendingRoleplay(
  matches: MatchSnapshot[],
  sessionPlanByMatch: Record<string, SessionPlanSnapshot[]>,
  metaByMatch: Record<string, TodayFocusMatchMeta>,
  role: ComputeInput["me"]["role"],
  now: Date,
): TodayFocusPendingRoleplay[] {
  const isClientSide =
    role === "CLIENT" || role === "CLIENT_ADMIN" || role === "CLIENT_HR";
  const isPartner = role === "PARTNER";
  if (!isClientSide && !isPartner) return [];

  const out: TodayFocusPendingRoleplay[] = [];
  for (const m of matches) {
    const meta = metaByMatch[m.matchId];
    if (!meta || meta.companyPlan !== "coaching_management_training" || !meta.roleplayStore) continue;

    const plan = sessionPlanByMatch[m.matchId] ?? [];
    for (let sn = 1; sn <= 3; sn++) {
      const row = plan.find((p) => p.sessionNumber === sn);
      if (!row?.confirmed || !row.endAt || new Date(row.endAt) > now) continue;
      const session = meta.roleplayStore.sessions[sn - 1];
      if (!session) continue;
      const side = isClientSide ? "client" : "partner";
      if (roleplaySideComplete(session, side)) continue;
      out.push({
        matchId: m.matchId,
        label: otherLabel(m, role),
        sessionNumber: sn,
        href: `/match/${m.matchId}/sessions/${sn}`,
      });
    }
  }
  return out.sort((a, b) => a.sessionNumber - b.sessionNumber);
}

export function computeTodayFocus(
  input: ComputeInput,
  metaByMatch: Record<string, TodayFocusMatchMeta>,
): TodayFocus {
  const allActions = computeAllActions(input);
  return {
    nextSession: findNextSession(input.matches, input.sessionPlanByMatch, input.me.role, input.now),
    pendingVotes: findPendingVotes(input.matches, input.negotiationsByMatch, input.me.role),
    pendingRoleplay: findPendingRoleplay(
      input.matches,
      input.sessionPlanByMatch,
      metaByMatch,
      input.me.role,
      input.now,
    ),
    topAction: allActions[0] ?? null,
    allActions,
    hasCoachingMatches: Object.values(metaByMatch).some(
      (m) => m.companyPlan === "coaching_management_training",
    ),
  };
}

export function formatDaysUntil(days: number): string {
  if (days <= 0) return "今日";
  if (days === 1) return "明日";
  return `あと ${days} 日`;
}
