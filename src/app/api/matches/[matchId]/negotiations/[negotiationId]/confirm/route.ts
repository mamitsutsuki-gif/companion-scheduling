import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";
import { getMatchIfAllowed } from "@/lib/match-access";
import { jsonError, jsonOk } from "@/lib/json";
import { buildIcsEvent } from "@/lib/ics";
import { buildGoogleCalendarLink, buildOutlookCalendarLink } from "@/lib/calendar-links";
import { notifyMatchStakeholders } from "@/lib/notify-members";
import { getMatchById } from "@/lib/repositories/match-repository";
import { createMessage } from "@/lib/repositories/message-repository";
import { confirmNegotiationSlot, getNegotiationById } from "@/lib/repositories/negotiation-repository";

const schema = z.object({
  slotId: z.string().min(1),
});

type RouteContext = { params: Promise<{ matchId: string; negotiationId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "PARTNER") return jsonError("パートナーのみ確定できます。", 403);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  const { matchId, negotiationId } = await context.params;
  const gate = await getMatchIfAllowed(matchId, { id: session.sub, role: session.role });
  if ("error" in gate) {
    const status = gate.error === "not_found" ? 404 : 403;
    return jsonError(status === 404 ? "見つかりません。" : "操作できません。", status);
  }

  const negotiation = await getNegotiationById(negotiationId);

  if (!negotiation || negotiation.matchId !== matchId) return jsonError("見つかりません。", 404);
  if (negotiation.status !== "AWAITING_PARTNER_CONFIRM") {
    return jsonError("この状態では確定できません。", 409);
  }

  const chosen = negotiation.slots.find((s) => s.id === parsed.data.slotId);
  if (!chosen || chosen.clientVote !== "YES") {
    return jsonError("選択した候補はクライアントが希望していません。", 400);
  }
  await confirmNegotiationSlot(negotiationId, parsed.data.slotId);

  const matchFull = await getMatchById(matchId);
  if (!matchFull) return jsonOk({ ok: true });
  const zoom = await prisma.partnerZoomProfile.findUnique({
    where: { partnerId: matchFull.partnerId },
  });

  const zoomLine = zoom
    ? `オンライン: ${zoom.zoomUrl}${zoom.zoomPass ? `\nパスコード: ${zoom.zoomPass}` : ""}`
    : "";

  const ics = buildIcsEvent({
    uid: `${chosen.id}@companion-scheduling`,
    start: new Date(chosen.startAt),
    end: new Date(chosen.endAt),
    title: `モチベイジ1on1（${matchFull.client.displayName}さん）`,
    description:
      `${zoomLine}\n\nご予約が確定しました。アプリ内チャットにもメモをご利用ください。\n連絡先はプラットフォームを通じない共有はできません。`.trim(),
    location: zoom?.zoomUrl,
  });

  const jpFmt = (d: Date) =>
    new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);

  const textBody =
    `${matchFull.partner.displayName}さん・${matchFull.client.displayName}さん\n\n` +
    `次の日程が確定しました。\n` +
    `開始: ${jpFmt(new Date(chosen.startAt))}\n` +
    `終了: ${jpFmt(new Date(chosen.endAt))}\n` +
    (zoomLine ? `${zoomLine}\n` : "") +
    `\n連絡先はプラットフォーム内チャットのみをご利用ください。\nカレンダー用 .ics を添付しています。`;

  const eventTitle = `モチベイジ1on1（${matchFull.client.displayName}さん）`;
  const eventDetails =
    `${zoomLine}\n\nご予約が確定しました。アプリ内チャットにもメモをご利用ください。`.trim();
  const googleCalendarLink = buildGoogleCalendarLink({
    title: eventTitle,
    start: new Date(chosen.startAt),
    end: new Date(chosen.endAt),
    details: eventDetails,
    location: zoom?.zoomUrl,
  });
  const outlookCalendarLink = buildOutlookCalendarLink({
    title: eventTitle,
    start: new Date(chosen.startAt),
    end: new Date(chosen.endAt),
    details: eventDetails,
    location: zoom?.zoomUrl,
  });

  await notifyMatchStakeholders(matchId, {
    appOrigin: new URL(request.url).origin,
    subject: "日程が確定しました（カレンダー .ics 添付）",
    text:
      `${textBody}\n\n` +
      `Googleカレンダーに追加: ${googleCalendarLink}\n` +
      `Outlookカレンダーに追加: ${outlookCalendarLink}`,
    attachments: [{ filename: "session.ics", content: ics, contentType: "text/calendar; charset=utf-8" }],
  });

  await createMessage({
    matchId,
    senderId: session.sub,
    body: `日程確定: ${jpFmt(new Date(chosen.startAt))} 〜 ${jpFmt(new Date(chosen.endAt))}${zoom ? ` / ${zoom.zoomUrl}` : ""}`,
    kind: "SCHEDULE_CONFIRMED",
    payload: {
      negotiationId,
      start: chosen.startAt,
      end: chosen.endAt,
      zoomUrl: zoom?.zoomUrl ?? null,
      zoomPass: zoom?.zoomPass ?? null,
    },
  });

  return jsonOk({ ok: true });
}
