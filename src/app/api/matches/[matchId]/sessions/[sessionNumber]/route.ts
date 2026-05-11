import { readSession } from "@/lib/session";
import { getMatchIfAllowed } from "@/lib/match-access";
import { jsonError, jsonOk } from "@/lib/json";
import { listSessionPlanForMatch } from "@/lib/repositories/match-sessions-repository";
import { getSessionFeedback } from "@/lib/repositories/session-feedback-repository";
import { getSessionReport } from "@/lib/repositories/session-report-repository";
import { getSessionAbandonment } from "@/lib/repositories/session-abandonment-repository";
import { getEffectiveAppSettingsForMatch } from "@/lib/effective-app-settings";

type RouteContext = { params: Promise<{ matchId: string; sessionNumber: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);

  const { matchId, sessionNumber } = await context.params;
  const n = Number(sessionNumber);
  if (!Number.isInteger(n) || n <= 0) return jsonError("回数の指定が不正です。");

  const gate = await getMatchIfAllowed(matchId, { id: session.sub, role: session.role });
  if ("error" in gate) {
    const status = gate.error === "not_found" ? 404 : 403;
    return jsonError(status === 404 ? "見つかりません。" : "閲覧できません。", status);
  }

  const plan = await listSessionPlanForMatch(matchId);
  // 詳細ページは「全ての回」を最初から開けるので、plan に該当回が無くても empty plan を返す。
  const target =
    plan.find((p) => p.sessionNumber === n) ?? {
      matchId,
      sessionNumber: n,
      confirmed: false,
      round: null,
      startAt: null,
      endAt: null,
      negotiationId: null,
      zoomUrl: null,
      zoomMeetingId: null,
      zoomPass: null,
    };

  // この match のクライアント企業に効く実効設定で、ガイドライン・追加質問を返す。
  const settings = await getEffectiveAppSettingsForMatch(matchId);
  const partnerExtraQuestions = settings.partnerExtraQuestionsByRound[String(n)] ?? [];
  const guidelineRaw = settings.sessionGuidelinesByRound[String(n)] ?? null;
  // ロールに応じてガイドラインを返す。クライアント管理者はクライアント向けと同じものを参照。
  const guideline = guidelineRaw
    ? session.role === "PARTNER" || session.role === "ADMIN"
      ? { partner: guidelineRaw.partner ?? "", client: guidelineRaw.client ?? "" }
      : { partner: "", client: guidelineRaw.client ?? "" }
    : null;

  const feedbackRow = await getSessionFeedback(matchId, n);
  const reportRow = await getSessionReport(matchId, n);
  const abandonmentRow = await getSessionAbandonment(matchId, n);

  // Visibility:
  // - CLIENT: own feedback only (cannot read partner report)
  // - PARTNER: own report only
  // - ADMIN: both
  const includeFeedback = session.role === "ADMIN" || session.role === "CLIENT";
  const includeReport = session.role === "ADMIN" || session.role === "PARTNER";

  return jsonOk({
    matchId,
    sessionNumber: n,
    plan: target,
    openable: true,
    viewerRole: session.role,
    partnerExtraQuestions,
    guideline,
    abandonment: abandonmentRow
      ? {
          reason: abandonmentRow.reason,
          markedAt: abandonmentRow.markedAt,
          markedBy: abandonmentRow.markedBy,
        }
      : null,
    feedback: includeFeedback ? feedbackRow : null,
    report: includeReport ? reportRow : null,
    match: {
      partnerId: gate.match.partnerId,
      clientId: gate.match.clientId,
    },
  });
}
