import { z } from "zod";
import { readSession } from "@/lib/session";
import { getMatchIfAllowed } from "@/lib/match-access";
import { jsonError, jsonOk } from "@/lib/json";
import { listSessionPlanForMatch } from "@/lib/repositories/match-sessions-repository";
import { upsertSessionReport } from "@/lib/repositories/session-report-repository";
import { appendAdminNotification } from "@/lib/repositories/admin-notification-repository";
import { getUserMapByIds } from "@/lib/repositories/user-repository";

const bodySchema = z.object({
  reflection: z.string().max(4000).default(""),
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

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  const saved = await upsertSessionReport({
    matchId,
    sessionNumber: n,
    partnerId: session.sub,
    reflection: parsed.data.reflection ?? "",
    extraAnswers: parsed.data.extraAnswers ?? {},
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
