import { z } from "zod";
import { readSession } from "@/lib/session";
import { getMatchIfAllowed } from "@/lib/match-access";
import { jsonError, jsonOk } from "@/lib/json";
import {
  deleteSessionAbandonment,
  upsertSessionAbandonment,
} from "@/lib/repositories/session-abandonment-repository";
import { appendAdminNotification } from "@/lib/repositories/admin-notification-repository";
import { getUserMapByIds } from "@/lib/repositories/user-repository";

const bodySchema = z.object({
  reason: z.union([z.literal("no_show"), z.literal("late_cancel")]),
});

type RouteContext = { params: Promise<{ matchId: string; sessionNumber: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "PARTNER" && session.role !== "ADMIN") {
    return jsonError("この操作はパートナー（または管理者）のみ可能です。", 403);
  }

  const { matchId, sessionNumber } = await context.params;
  const n = Number(sessionNumber);
  if (!Number.isInteger(n) || n <= 0) return jsonError("回数の指定が不正です。");

  const gate = await getMatchIfAllowed(matchId, { id: session.sub, role: session.role });
  if ("error" in gate) {
    const status = gate.error === "not_found" ? 404 : 403;
    return jsonError(status === 404 ? "見つかりません。" : "操作できません。", status);
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  const saved = await upsertSessionAbandonment({
    matchId,
    sessionNumber: n,
    reason: parsed.data.reason,
    markedBy: session.sub,
  });

  const usersMap = await getUserMapByIds([session.sub]);
  const sender = usersMap.get(session.sub);
  const reasonLabel =
    parsed.data.reason === "no_show"
      ? "クライアントが連絡なく参加しなかった"
      : "クライアントが24時間前を過ぎてキャンセルした";
  await appendAdminNotification({
    type: "SESSION_ABANDONED",
    matchId,
    sessionNumber: n,
    actorUserId: session.sub,
    actorRole: session.role,
    summary: `${sender?.displayName ?? "パートナー"}さんが ${n} 回目を【未実施・消化】(${reasonLabel})としてマークしました。`,
    link: `/match/${matchId}/sessions/${n}`,
  });

  return jsonOk({ ok: true, abandonment: saved });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "PARTNER" && session.role !== "ADMIN") {
    return jsonError("この操作はパートナー（または管理者）のみ可能です。", 403);
  }

  const { matchId, sessionNumber } = await context.params;
  const n = Number(sessionNumber);
  if (!Number.isInteger(n) || n <= 0) return jsonError("回数の指定が不正です。");

  const gate = await getMatchIfAllowed(matchId, { id: session.sub, role: session.role });
  if ("error" in gate) {
    const status = gate.error === "not_found" ? 404 : 403;
    return jsonError(status === 404 ? "見つかりません。" : "操作できません。", status);
  }

  await deleteSessionAbandonment(matchId, n);
  return jsonOk({ ok: true });
}
