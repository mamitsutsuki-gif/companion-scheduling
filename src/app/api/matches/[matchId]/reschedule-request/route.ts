import { addHours } from "date-fns";
import { z } from "zod";
import { getMatchIfAllowed } from "@/lib/match-access";
import { jsonError, jsonOk } from "@/lib/json";
import { notifyMatchStakeholders } from "@/lib/notify-members";
import { createMessage } from "@/lib/repositories/message-repository";
import {
  listNegotiationsForMatch,
  setRescheduleRequestedFlag,
} from "@/lib/repositories/negotiation-repository";
import { readSession } from "@/lib/session";
import { appendAdminNotification } from "@/lib/repositories/admin-notification-repository";
import { appendMemberNotification } from "@/lib/repositories/member-notification-repository";
import { getUserMapByIds } from "@/lib/repositories/user-repository";
import { getMatchById } from "@/lib/repositories/match-repository";

type RouteContext = { params: Promise<{ matchId: string }> };
const payloadSchema = z.object({
  sessionNumber: z.number().int().min(1).optional(),
});

function roleLabel(role: "ADMIN" | "PARTNER" | "CLIENT" | "CLIENT_ADMIN") {
  if (role === "PARTNER") return "パートナー";
  if (role === "CLIENT" || role === "CLIENT_ADMIN") return "クライアント";
  return "管理者";
}

export async function POST(request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "PARTNER" && session.role !== "CLIENT" && session.role !== "CLIENT_ADMIN") {
    return jsonError("この操作はパートナーかクライアントのみ可能です。", 403);
  }

  const { matchId } = await context.params;
  const gate = await getMatchIfAllowed(matchId, { id: session.sub, role: session.role });
  if ("error" in gate) {
    const status = gate.error === "not_found" ? 404 : 403;
    return jsonError(status === 404 ? "見つかりません。" : "操作できません。", status);
  }

  const raw = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return jsonError("対象回の指定が不正です。", 400);
  const requestedSession = parsed.data.sessionNumber;

  const negotiations = await listNegotiationsForMatch(matchId);
  const active = negotiations.find((n) => n.status !== "CONFIRMED" && n.status !== "SUPERSEDED");
  if (active) {
    return jsonError("すでに調整中のラウンドがあります。現在の調整を進めてください。", 409);
  }

  const now = new Date();
  const nextConfirmed = negotiations
    .flatMap((n) =>
      n.slots
        .filter((s) => s.isConfirmed)
        .map((s) => ({
          slot: s,
          negotiationId: n.id,
          sessionNumber: Math.max(1, n.sessionNumber ?? 1),
          start: new Date(s.startAt),
        })),
    )
    .filter((x) => (requestedSession ? x.sessionNumber === requestedSession : true))
    .filter((x) => !Number.isNaN(x.start.valueOf()) && x.start > now)
    .sort((a, b) => a.start.valueOf() - b.start.valueOf())[0];

  if (!nextConfirmed) {
    return jsonError("変更対象となる今後の確定日程がありません。", 400);
  }

  if (nextConfirmed.start <= addHours(now, 24)) {
    return jsonError("日程変更は開始24時間前まで可能です。", 400);
  }

  const pretty = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(nextConfirmed.start);

  const messageBody =
    `第${nextConfirmed.sessionNumber}回の予定を再調整させてください。\n` +
    `${roleLabel(session.role)}からの変更希望です。\n` +
    `対象: ${pretty}\n` +
    `パートナー側が再度候補を提示し、双方希望があればチャットでやり取りをしてください。\n` +
    `開始24時間前まで変更可能です。`;

  await createMessage({
    matchId,
    senderId: session.sub,
    body: messageBody,
  });

  // 「再調整中」フラグを当該確定 Negotiation に立てる（次の round が CONFIRMED で解除）
  await setRescheduleRequestedFlag(nextConfirmed.negotiationId).catch(() => null);

  await notifyMatchStakeholders(matchId, {
    appOrigin: new URL(request.url).origin,
    subject: `第${nextConfirmed.sessionNumber}回の日程変更希望が届きました`,
    text: `${messageBody}\n\n通常のチャット通知と同様に、ルームで確認できます。`,
    excludeUserId: session.sub,
  });

  const usersMap = await getUserMapByIds([session.sub]);
  const sender = usersMap.get(session.sub);
  await appendAdminNotification({
    type: "RESCHEDULE",
    matchId,
    sessionNumber: nextConfirmed.sessionNumber,
    actorUserId: session.sub,
    actorRole: session.role,
    summary: `${sender?.displayName ?? "参加者"}さん（${roleLabel(session.role)}）が ${nextConfirmed.sessionNumber} 回目の日程変更を希望しました（${pretty}）。`,
    link: `/admin/matches?focus=${encodeURIComponent(matchId)}`,
  });

  // 相手側へ通知
  const matchInfo = await getMatchById(matchId).catch(() => null);
  if (matchInfo) {
    const otherUserId = session.sub === matchInfo.partner.id ? matchInfo.client.id : matchInfo.partner.id;
    if (otherUserId) {
      await appendMemberNotification({
        recipientUserId: otherUserId,
        type: "RESCHEDULE",
        matchId,
        sessionNumber: nextConfirmed.sessionNumber,
        actorUserId: session.sub,
        actorRole: session.role,
        summary: `${sender?.displayName ?? "相手"}さんが ${nextConfirmed.sessionNumber} 回目（${pretty}）の日程変更を希望しました。`,
        link: `/match/${matchId}#schedule`,
      });
    }
  }

  return jsonOk({ ok: true });
}
