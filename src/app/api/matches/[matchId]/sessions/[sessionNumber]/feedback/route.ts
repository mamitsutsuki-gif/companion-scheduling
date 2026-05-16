import { z } from "zod";
import { readSession } from "@/lib/session";
import { getMatchIfAllowed } from "@/lib/match-access";
import { jsonError, jsonOk } from "@/lib/json";
import { listSessionPlanForMatch } from "@/lib/repositories/match-sessions-repository";
import { upsertSessionFeedback } from "@/lib/repositories/session-feedback-repository";
import { appendAdminNotification } from "@/lib/repositories/admin-notification-repository";
import { getUserMapByIds } from "@/lib/repositories/user-repository";

const requiredAnswer = z.string().trim().min(1, "必須項目です。").max(4000);

const bodySchema = z.object({
  answers: z.object({
    insight: requiredAnswer,
    feeling: requiredAnswer,
    nextActions: requiredAnswer,
    satisfactionReason: requiredAnswer,
    other: z.string().max(4000).optional(),
  }),
  /**
   * 管理者が「企業ごとの設定 → クライアント振り返りの追加質問」で
   * 当該回（sessionNumber）に設定した自由設問の回答。
   * key は設問のインデックス（"0","1",…）。値は string のみ。
   */
  extraAnswers: z.record(z.string(), z.string().max(4000)).optional(),
  satisfactionScore: z.number().int().min(1).max(10),
  partnerChange: z.enum(["continue", "undecided", "want_change"]),
});

type RouteContext = { params: Promise<{ matchId: string; sessionNumber: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (
    session.role !== "CLIENT" &&
    session.role !== "CLIENT_ADMIN" &&
    session.role !== "CLIENT_HR"
  ) {
    return jsonError("このフォームはクライアント専用です。", 403);
  }

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

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message;
    return jsonError(first ?? "入力内容が不正です。必須項目をご記入ください。");
  }

  const saved = await upsertSessionFeedback({
    matchId,
    sessionNumber: n,
    clientId: session.sub,
    answers: parsed.data.answers,
    extraAnswers: parsed.data.extraAnswers ?? {},
    satisfactionScore: parsed.data.satisfactionScore,
    partnerChange: parsed.data.partnerChange,
  });

  const usersMap = await getUserMapByIds([session.sub]);
  const sender = usersMap.get(session.sub);
  await appendAdminNotification({
    type: "FEEDBACK_SUBMITTED",
    matchId,
    sessionNumber: n,
    actorUserId: session.sub,
    actorRole: session.role,
    summary: `${sender?.displayName ?? "クライアント"}さんが ${n} 回目のフィードバックを提出しました。`,
    link: `/match/${matchId}/sessions/${n}`,
  });

  return jsonOk({ ok: true, feedback: saved });
}
