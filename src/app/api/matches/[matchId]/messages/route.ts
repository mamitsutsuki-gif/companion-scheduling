import { z } from "zod";
import { readSession } from "@/lib/session";
import { getMatchIfAllowed } from "@/lib/match-access";
import { jsonError, jsonOk } from "@/lib/json";
import { notifyMatchStakeholders, summarizeChatLine } from "@/lib/notify-members";
import { createMessage, listMessagesForMatch } from "@/lib/repositories/message-repository";
import { getUserMapByIds } from "@/lib/repositories/user-repository";

const postSchema = z.object({
  body: z.string().min(1).max(5000),
});

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

  const msgs = await listMessagesForMatch(matchId);

  return jsonOk({ messages: msgs });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  const { matchId } = await context.params;
  const gate = await getMatchIfAllowed(matchId, { id: session.sub, role: session.role });
  if ("error" in gate) {
    const status = gate.error === "not_found" ? 404 : 403;
    return jsonError(status === 404 ? "見つかりません。" : "送信できません。", status);
  }

  const senderMap = await getUserMapByIds([session.sub]);
  const sender = senderMap.get(session.sub);

  const message = await createMessage({
    matchId,
    senderId: session.sub,
    body: parsed.data.body,
    kind: "STANDARD",
  });

  const excerpt = await summarizeChatLine(parsed.data.body);

  await notifyMatchStakeholders(matchId, {
    appOrigin: new URL(request.url).origin,
    subject: `${sender?.displayName ?? "参加者"}さんからメッセージ`,
    text: `「${excerpt}」`,
    excludeUserId: session.sub,
  });

  return jsonOk({ ok: true, messageId: message.id });
}
