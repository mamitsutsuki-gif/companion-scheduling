import { z } from "zod";
import { readSession } from "@/lib/session";
import { getMatchIfAllowed } from "@/lib/match-access";
import { jsonError, jsonOk } from "@/lib/json";
import {
  isSessionEnded,
  listSessionPlanForMatch,
} from "@/lib/repositories/match-sessions-repository";
import { upsertSessionReport } from "@/lib/repositories/session-report-repository";
import { appendAdminNotification } from "@/lib/repositories/admin-notification-repository";
import { getUserMapByIds } from "@/lib/repositories/user-repository";
import {
  emptySessionReportAnswers,
  mergeSessionReportExtraAnswers,
  parseSessionReportAnswers,
  validateSessionReportAnswers,
} from "@/lib/session-report-fields";

const answerFieldSchema = z.string().trim().max(4000);

const bodySchema = z.object({
  reflection: answerFieldSchema.optional(),
  answers: z
    .object({
      sessionTheme: answerFieldSchema,
      clientCurrentFocus: answerFieldSchema,
      clientSmallChange: answerFieldSchema.optional(),
      partnerReflection: answerFieldSchema,
      partnerMemo: answerFieldSchema.optional(),
    })
    .optional(),
  extraAnswers: z.record(z.string(), z.string().max(4000)).optional(),
});

type RouteContext = { params: Promise<{ matchId: string; sessionNumber: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "PARTNER") return jsonError("このフォームはパートナー専用です。", 403);

  const { matchId, sessionNumber } = await context.params;
  const n = Number(sessionNumber);
  if (!Number.isInteger(n) || n <= 0) return jsonError("回数の指定が不正です。");

  const gate = await getMatchIfAllowed(matchId, { id: session.sub, role: session.role });
  if ("error" in gate) {
    const status = gate.error === "not_found" ? 404 : 403;
    return jsonError(status === 404 ? "見つかりません。" : "送信できません。", status);
  }

  const plan = await listSessionPlanForMatch(matchId);
  const target = plan.find((p) => p.sessionNumber === n);
  if (!target) return jsonError("回が見つかりません。", 404);
  if (!isSessionEnded(target)) {
    return jsonError("セッションレポートはセッション終了後に入力できます。", 403);
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message;
    return jsonError(first ?? "入力内容が不正です。");
  }

  const answers = parsed.data.answers
    ? {
        ...emptySessionReportAnswers(),
        ...parsed.data.answers,
      }
    : parseSessionReportAnswers({
        reflection: parsed.data.reflection,
        extraAnswers: parsed.data.extraAnswers,
      });

  const validationError = validateSessionReportAnswers(answers);
  if (validationError) return jsonError(validationError);

  const partnerQuestionAnswers: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.data.extraAnswers ?? {})) {
    if (/^\d+$/.test(k)) partnerQuestionAnswers[k] = v;
  }

  const reflection = answers.partnerReflection;
  const extraAnswers = mergeSessionReportExtraAnswers(answers, partnerQuestionAnswers);

  const saved = await upsertSessionReport({
    matchId,
    sessionNumber: n,
    partnerId: session.sub,
    reflection,
    extraAnswers,
  });

  const usersMap = await getUserMapByIds([session.sub]);
  const sender = usersMap.get(session.sub);
  await appendAdminNotification({
    type: "REPORT_SUBMITTED",
    matchId,
    sessionNumber: n,
    actorUserId: session.sub,
    actorRole: session.role,
    summary: `${sender?.displayName ?? "パートナー"}さんが ${n} 回目のレポートを提出しました。`,
    link: `/match/${matchId}/sessions/${n}`,
  });

  return jsonOk({ ok: true, report: saved });
}
