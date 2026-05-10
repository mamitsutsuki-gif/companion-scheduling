import { readSession } from "@/lib/session";
import { getMatchIfAllowed } from "@/lib/match-access";
import { jsonError, jsonOk } from "@/lib/json";
import {
  determineOpenableSessions,
  listSessionPlanForMatch,
} from "@/lib/repositories/match-sessions-repository";
import { listSessionFeedbacksForMatch } from "@/lib/repositories/session-feedback-repository";
import { listSessionReportsForMatch } from "@/lib/repositories/session-report-repository";

type RouteContext = { params: Promise<{ matchId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);

  const { matchId } = await context.params;
  const gate = await getMatchIfAllowed(matchId, { id: session.sub, role: session.role });
  if ("error" in gate) {
    const status = gate.error === "not_found" ? 404 : 403;
    return jsonError(status === 404 ? "見つかりません。" : "閲覧できません。", status);
  }

  const plan = await listSessionPlanForMatch(matchId);
  const openable = determineOpenableSessions(plan);
  const feedbacks = await listSessionFeedbacksForMatch(matchId);
  const reports = await listSessionReportsForMatch(matchId);

  const fbSet = new Set(feedbacks.map((f) => f.sessionNumber));
  const rpSet = new Set(reports.map((r) => r.sessionNumber));

  const rows = plan.map((row) => ({
    ...row,
    openable: openable.has(row.sessionNumber),
    hasClientFeedback: fbSet.has(row.sessionNumber),
    hasPartnerReport: rpSet.has(row.sessionNumber),
  }));

  return jsonOk({ sessions: rows, viewerRole: session.role });
}
