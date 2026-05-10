import { z } from "zod";
import { readSession } from "@/lib/session";
import { getMatchIfAllowed } from "@/lib/match-access";
import { jsonError, jsonOk } from "@/lib/json";
import {
  determineOpenableSessions,
  listSessionPlanForMatch,
} from "@/lib/repositories/match-sessions-repository";
import { upsertSessionFeedback } from "@/lib/repositories/session-feedback-repository";
import { appendAdminNotification } from "@/lib/repositories/admin-notification-repository";
import { getUserMapByIds } from "@/lib/repositories/user-repository";

const bodySchema = z.object({
  answers: z
    .object({
      insight: z.string().max(4000).optional(),
      feeling: z.string().max(4000).optional(),
      nextActions: z.string().max(4000).optional(),
      satisfactionReason: z.string().max(4000).optional(),
      other: z.string().max(4000).optional(),
    })
    .default({}),
  satisfactionScore: z.union([z.number().int().min(1).max(10), z.null()]).optional(),
  partnerChange: z
    .union([z.literal("continue"), z.literal("undecided"), z.literal("want_change"), z.null()])
    .optional(),
});

type RouteContext = { params: Promise<{ matchId: string; sessionNumber: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "CLIENT") return jsonError("このフォームはクライアント専用です。", 403);

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
  const openable = determineOpenableSessions(plan);
  if (!openable.has(n)) return jsonError("この回はまだ開けません。", 403);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  const saved = await upsertSessionFeedback({
    matchId,
    sessionNumber: n,
    clientId: session.sub,
    answers: parsed.data.answers ?? {},
    satisfactionScore: parsed.data.satisfactionScore ?? null,
    partnerChange: parsed.data.partnerChange ?? null,
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
