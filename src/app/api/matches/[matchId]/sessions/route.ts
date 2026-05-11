import { readSession } from "@/lib/session";
import { getMatchIfAllowed } from "@/lib/match-access";
import { jsonError, jsonOk } from "@/lib/json";
import { listSessionPlanForMatch } from "@/lib/repositories/match-sessions-repository";
import { listSessionFeedbacksForMatch } from "@/lib/repositories/session-feedback-repository";
import { listSessionReportsForMatch } from "@/lib/repositories/session-report-repository";
import { listSessionAbandonmentsForMatch } from "@/lib/repositories/session-abandonment-repository";

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
  const feedbacks = await listSessionFeedbacksForMatch(matchId);
  const reports = await listSessionReportsForMatch(matchId);
  const abandonments = await listSessionAbandonmentsForMatch(matchId);

  const fbSet = new Set(feedbacks.map((f) => f.sessionNumber));
  const rpSet = new Set(reports.map((r) => r.sessionNumber));
  const abMap = new Map(abandonments.map((a) => [a.sessionNumber, a]));

  // 詳細ボタンは「最初から全て押せる」要件のため、openable は全 true で返す。
  // フロントで「予定 / 実施済 / 未実施・消化」のバッジを表示する。
  const rows = plan.map((row) => {
    const ab = abMap.get(row.sessionNumber) ?? null;
    return {
      ...row,
      openable: true,
      hasClientFeedback: fbSet.has(row.sessionNumber),
      hasPartnerReport: rpSet.has(row.sessionNumber),
      abandonment: ab
        ? { reason: ab.reason, markedAt: ab.markedAt, markedBy: ab.markedBy }
        : null,
    };
  });

  return jsonOk({ sessions: rows, viewerRole: session.role });
}
