import { z } from "zod";
import { readSession } from "@/lib/session";
import { getMatchIfAllowed } from "@/lib/match-access";
import { jsonError, jsonOk } from "@/lib/json";
import { notifyMatchStakeholders, summarizeChatLine } from "@/lib/notify-members";
import { getUserMapByIds } from "@/lib/repositories/user-repository";
import { createMessage } from "@/lib/repositories/message-repository";
import { getNegotiationById, submitVotes } from "@/lib/repositories/negotiation-repository";
import { appendAdminNotification } from "@/lib/repositories/admin-notification-repository";
import { appendMemberNotification } from "@/lib/repositories/member-notification-repository";
import { getMatchById } from "@/lib/repositories/match-repository";

const legacySchema = z.object({ votes: z.record(z.string(), z.enum(["YES", "NO"])) });
const checkboxSchema = z.object({
  selectedSlotIds: z.array(z.string()),
  requestAlternative: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ matchId: string; negotiationId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (
    session.role !== "CLIENT" &&
    session.role !== "CLIENT_ADMIN" &&
    session.role !== "CLIENT_HR"
  ) {
    return jsonError("クライアントのみ回答できます。", 403);
  }

  const raw = await request.json().catch(() => null);
  const parsedCheckbox = checkboxSchema.safeParse(raw);
  const parsedLegacy = !parsedCheckbox.success ? legacySchema.safeParse(raw) : null;
  if (!parsedCheckbox.success && (!parsedLegacy || !parsedLegacy.success)) {
    return jsonError("入力内容が不正です。");
  }

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

  const slotIds = negotiation.slots.map((s) => s.id);
  let votes: Record<string, "YES" | "NO">;

  if (parsedCheckbox.success) {
    const selected = new Set(parsedCheckbox.data.selectedSlotIds);
    for (const id of selected) {
      if (!slotIds.includes(id)) {
        return jsonError("不正な候補が含まれています。");
      }
    }
    votes = Object.fromEntries(slotIds.map((id) => [id, selected.has(id) ? "YES" : "NO"]));
  } else if (parsedLegacy?.success) {
    votes = parsedLegacy.data.votes;
    const sameKeys =
      slotIds.length === Object.keys(votes).length &&
      slotIds.every((id) => Object.prototype.hasOwnProperty.call(votes, id));
    if (!sameKeys) return jsonError("全候補に回答してください。");
  } else {
    return jsonError("入力内容が不正です。");
  }

  const allNo = negotiation.slots.every((s) => votes[s.id] === "NO");
  await submitVotes(negotiationId, votes);

  const yesCount = negotiation.slots.filter((s) => votes[s.id] === "YES").length;
  const noCount = negotiation.slots.length - yesCount;
  const body = allNo
    ? `日程回答: 別候補を希望（参加可能 ${yesCount}件 / 不可 ${noCount}件）。担当パートナーが再提示します。`
    : `日程回答: 参加可能 ${yesCount}件 / 不可 ${noCount}件。担当パートナーの日程確定待ちです。`;

  const senderMap = await getUserMapByIds([session.sub]);
  const senderName = senderMap.get(session.sub)?.displayName ?? "クライアント";

  await createMessage({
    matchId,
    senderId: session.sub,
    body,
    kind: "VOTE_SUMMARY",
    payload: { negotiationId, yesCount, noCount, allNo },
  });

  const excerpt = await summarizeChatLine(body);
  await notifyMatchStakeholders(matchId, {
    appOrigin: new URL(request.url).origin,
    subject: `${senderName}さんが候補日時に回答しました`,
    text: `「${excerpt}」`,
    excludeUserId: session.sub,
  });

  await appendAdminNotification({
    type: "SLOT_VOTED",
    matchId,
    sessionNumber: negotiation.sessionNumber ?? null,
    actorUserId: session.sub,
    actorRole: session.role,
    summary: `${senderName}さんが候補日時に回答（参加可能 ${yesCount} / 不可 ${noCount}）。`,
    link: `/match/${matchId}#schedule`,
  });

  const matchInfo = await getMatchById(matchId).catch(() => null);
  if (matchInfo?.partner?.id) {
    await appendMemberNotification({
      recipientUserId: matchInfo.partner.id,
      type: "SLOT_VOTED",
      matchId,
      sessionNumber: negotiation.sessionNumber ?? null,
      actorUserId: session.sub,
      actorRole: session.role,
      summary: `${senderName}さんが候補日時に回答（参加可能 ${yesCount} / 不可 ${noCount}）。${allNo ? "別候補の提示が必要です。" : "参加可能な日時から1つ選んで日程を確定してください。"}`,
      link: `/match/${matchId}#schedule`,
    });
  }

  return jsonOk({ ok: true, status: allNo ? "NEEDS_NEW_PROPOSAL" : "AWAITING_PARTNER_CONFIRM", allNo });
}
