import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { requireAdminish } from "@/lib/admin-access";
import { listNegotiationsForMatch } from "@/lib/repositories/negotiation-repository";
import { listMatchesForRole } from "@/lib/repositories/match-repository";
import {
  isResponseDeadlinePassed,
  resolveScheduleDisplayStatus,
  type ScheduleDisplayStatus,
} from "@/lib/negotiation-display";

export type AdminScheduleNegotiationRow = {
  matchId: string;
  negotiationId: string;
  sessionNumber: number;
  round: number;
  clientDisplayName: string;
  partnerDisplayName: string;
  status: ScheduleDisplayStatus;
  proposedAt: string | null;
  responseDeadline: string | null;
  clientRespondedAt: string | null;
  confirmedStartAt: string | null;
  isOverdue: boolean;
};

export async function GET() {
  const session = await readSession();
  const denied = requireAdminish(session);
  if (denied) return jsonError(denied.error, denied.status);

  const matches = await listMatchesForRole({ role: "ADMIN", userId: session!.sub });
  const rows: AdminScheduleNegotiationRow[] = [];

  for (const match of matches) {
    const negotiations = await listNegotiationsForMatch(match.id);
    const latestPerSession = new Map<number, (typeof negotiations)[number]>();
    for (const n of negotiations) {
      const sn = Math.max(1, n.sessionNumber ?? 1);
      const existing = latestPerSession.get(sn);
      if (!existing || n.round > existing.round) latestPerSession.set(sn, n);
    }

    if (latestPerSession.size === 0) {
      rows.push({
        matchId: match.id,
        negotiationId: "",
        sessionNumber: 1,
        round: 0,
        clientDisplayName: match.client?.displayName ?? "—",
        partnerDisplayName: match.partner?.displayName ?? "—",
        status: "未提示",
        proposedAt: null,
        responseDeadline: null,
        clientRespondedAt: null,
        confirmedStartAt: null,
        isOverdue: false,
      });
      continue;
    }

    for (const [sessionNumber, n] of latestPerSession) {
      if (n.status === "SUPERSEDED") continue;
      const confirmedSlot = n.slots.find((s) => s.isConfirmed);
      const displayStatus = resolveScheduleDisplayStatus({
        status: n.status,
        rescheduleRequestedAt: n.rescheduleRequestedAt,
        hasAnyNegotiation: true,
      });
      const overdue =
        n.status === "AWAITING_CLIENT_RESPONSE" &&
        isResponseDeadlinePassed(n.responseDeadline ?? null);
      rows.push({
        matchId: match.id,
        negotiationId: n.id,
        sessionNumber,
        round: n.round,
        clientDisplayName: match.client?.displayName ?? "—",
        partnerDisplayName: match.partner?.displayName ?? "—",
        status: displayStatus,
        proposedAt: n.createdAt ?? null,
        responseDeadline: n.responseDeadline ?? null,
        clientRespondedAt: n.clientRespondedAt ?? null,
        confirmedStartAt: confirmedSlot?.startAt ?? null,
        isOverdue: overdue,
      });
    }
  }

  rows.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    return (b.proposedAt ?? "").localeCompare(a.proposedAt ?? "");
  });

  return jsonOk({ rows });
}
