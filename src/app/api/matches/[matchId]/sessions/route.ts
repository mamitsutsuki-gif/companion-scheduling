import { readSession } from "@/lib/session";
import { getMatchIfAllowed } from "@/lib/match-access";
import { jsonError, jsonOk } from "@/lib/json";
import { listSessionPlanForMatch } from "@/lib/repositories/match-sessions-repository";
import { listSessionFeedbacksForMatch } from "@/lib/repositories/session-feedback-repository";
import { listSessionReportsForMatch } from "@/lib/repositories/session-report-repository";
import { listSessionAbandonmentsForMatch } from "@/lib/repositories/session-abandonment-repository";
import { getEffectiveAppSettingsForMatch } from "@/lib/effective-app-settings";
import { getRoleplayStore } from "@/lib/repositories/coaching-repository";
import { roleplaySideComplete } from "@/lib/coaching-roleplay";

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
  const effective = await getEffectiveAppSettingsForMatch(matchId);
  const isCoachingPlan = effective.companyPlan === "coaching_management_training";
  const roleplayStore = isCoachingPlan ? await getRoleplayStore(matchId) : null;

  const fbSet = new Set(feedbacks.map((f) => f.sessionNumber));
  const rpSet = new Set(reports.map((r) => r.sessionNumber));
  const abMap = new Map(abandonments.map((a) => [a.sessionNumber, a]));

  // 詳細ボタンは「最初から全て押せる」要件のため、openable は全 true で返す。
  // フロントで「予定 / 実施済 / 未実施・消化」のバッジを表示する。
  const rows = plan.map((row) => {
    const ab = abMap.get(row.sessionNumber) ?? null;
    const roleplaySession =
      isCoachingPlan && row.sessionNumber >= 1 && row.sessionNumber <= 3
        ? roleplayStore?.sessions[row.sessionNumber - 1] ?? null
        : null;
    const hasClientFeedback = isCoachingPlan && roleplaySession
      ? roleplaySideComplete(roleplaySession, "client")
      : fbSet.has(row.sessionNumber);
    const hasPartnerReport = isCoachingPlan && roleplaySession
      ? roleplaySideComplete(roleplaySession, "partner")
      : rpSet.has(row.sessionNumber);
    return {
      ...row,
      openable: true,
      hasClientFeedback,
      hasPartnerReport,
      abandonment: ab
        ? { reason: ab.reason, markedAt: ab.markedAt, markedBy: ab.markedBy }
        : null,
    };
  });

  return jsonOk({ sessions: rows, viewerRole: session.role });
}
