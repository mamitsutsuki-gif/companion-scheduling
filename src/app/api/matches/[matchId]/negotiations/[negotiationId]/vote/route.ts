import { z } from "zod";
import { readSession } from "@/lib/session";
import { getMatchIfAllowed } from "@/lib/match-access";
import { jsonError, jsonOk } from "@/lib/json";
import { notifyMatchStakeholders, summarizeChatLine } from "@/lib/notify-members";
import { getUserMapByIds } from "@/lib/repositories/user-repository";
import { createMessage } from "@/lib/repositories/message-repository";
import { getNegotiationById, submitVotes } from "@/lib/repositories/negotiation-repository";

const schema = z.object({ votes: z.record(z.string(), z.enum(["YES", "NO"])) });

type RouteContext = { params: Promise<{ matchId: string; negotiationId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "CLIENT") return jsonError("クライアントのみ回答できます。", 403);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  const { matchId, negotiationId } = await context.params;
  const gate = await getMatchIfAllowed(matchId, { id: session.sub, role: session.role });
  if ("error" in gate) {
    const status = gate.error === "not_found" ? 404 : 403;
    return jsonError(status === 404 ? "見つかりません。" : "操作できません。", status);
  }

  const negotiation = await getNegotiationById(negotiationId);

  if (!negotiation || negotiation.matchId !== matchId) {
    return jsonError("見つかりません。", 404);
  }

  if (negotiation.status !== "AWAITING_CLIENT_RESPONSE") {
    return jsonError("この状態では回答できません。", 409);
  }

  const votes = parsed.data.votes;
  const slotIds = negotiation.slots.map((s) => s.id);
  const sameKeys =
    slotIds.length === Object.keys(votes).length &&
    slotIds.every((id) => Object.prototype.hasOwnProperty.call(votes, id));

  if (!sameKeys) {
    return jsonError("全候補に○×を入力してください。");
  }

  const allNo = negotiation.slots.every((s) => votes[s.id] === "NO");
  await submitVotes(negotiationId, votes);

  const yesCount = negotiation.slots.filter((s) => votes[s.id] === "YES").length;
  const noCount = negotiation.slots.length - yesCount;
  const body = allNo
    ? `日程回答: すべて×（○ ${yesCount}件 / × ${noCount}件）。再提案をお願いします。`
    : `日程回答: ○ ${yesCount}件 / × ${noCount}件。パートナーの最終確定待ちです。`;

  const senderMap = await getUserMapByIds([session.sub]);
  const senderName = senderMap.get(session.sub)?.displayName ?? "クライアント";

  await createMessage({ matchId, senderId: session.sub, body, kind: "STANDARD" });

  const excerpt = await summarizeChatLine(body);
  await notifyMatchStakeholders(matchId, {
    appOrigin: new URL(request.url).origin,
    subject: `${senderName}さんが日程回答を送信`,
    text: `「${excerpt}」`,
    excludeUserId: session.sub,
  });

  return jsonOk({ ok: true, status: allNo ? "NEEDS_NEW_PROPOSAL" : "AWAITING_PARTNER_CONFIRM" });
}
