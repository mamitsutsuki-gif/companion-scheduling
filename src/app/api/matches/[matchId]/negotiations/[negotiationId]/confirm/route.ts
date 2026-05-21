import { z } from "zod";
import { readSession } from "@/lib/session";
import { getMatchIfAllowed } from "@/lib/match-access";
import { jsonError, jsonOk } from "@/lib/json";
import { buildIcsEvent } from "@/lib/ics";
import { buildGoogleCalendarLink, buildOutlookCalendarLink } from "@/lib/calendar-links";
import { notifyMatchStakeholders } from "@/lib/notify-members";
import { getMatchById } from "@/lib/repositories/match-repository";
import { createMessage } from "@/lib/repositories/message-repository";
import {
  clearRescheduleFlagsForSession,
  confirmNegotiationSlot,
  getNegotiationById,
} from "@/lib/repositories/negotiation-repository";
import { getPartnerZoomProfile } from "@/lib/repositories/zoom-repository";
import { enqueueSessionFeedbackEmailJob } from "@/lib/repositories/session-feedback-job-repository";
import { appendAdminNotification } from "@/lib/repositories/admin-notification-repository";
import { appendMemberNotification } from "@/lib/repositories/member-notification-repository";
import { getEffectiveAppSettingsForMatch } from "@/lib/effective-app-settings";
import { formatJaDateTime } from "@/lib/format-datetime";

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
  const matchFull = await getMatchById(matchId);
  if (!matchFull) return jsonOk({ ok: true });
  const zoom = await getPartnerZoomProfile(matchFull.partnerId);
  await confirmNegotiationSlot(negotiationId, parsed.data.slotId, {
    zoomUrl: zoom?.zoomUrl ?? null,
    zoomMeetingId: zoom?.zoomMeetingId ?? null,
    zoomPass: zoom?.zoomPass ?? null,
  });
  // 同じセッション番号で過去に立てられた「再調整中」フラグをクリア
  await clearRescheduleFlagsForSession(matchId, Number(negotiation.sessionNumber ?? 1)).catch(() => null);

  const zoomLines: string[] = [];
  if (zoom?.zoomUrl) zoomLines.push(`Zoom URL: ${zoom.zoomUrl}`);
  if (zoom?.zoomMeetingId) zoomLines.push(`ミーティング ID: ${zoom.zoomMeetingId}`);
  if (zoom?.zoomPass) zoomLines.push(`パスコード: ${zoom.zoomPass}`);
  const zoomLine = zoomLines.join("\n");

  const ics = buildIcsEvent({
    uid: `${chosen.id}@companion-scheduling`,
    start: new Date(chosen.startAt),
    end: new Date(chosen.endAt),
    title: `モチベイジ1on1（${matchFull.client.displayName}さん）`,
    description:
      `${zoomLine}\n\nご予約が確定しました。アプリ内チャットにもメモをご利用ください。\n連絡先はプラットフォームを通じない共有はできません。`.trim(),
    location: zoom?.zoomUrl,
  });

  const settings = await getEffectiveAppSettingsForMatch(matchId);
  const displayTz = settings.timezone || "Asia/Tokyo";

  const textBody =
    `次の日程が確定しました。\n` +
    `開始: ${formatJaDateTime(chosen.startAt, displayTz)}\n` +
    `終了: ${formatJaDateTime(chosen.endAt, displayTz)}\n` +
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
    body: `日程確定: ${formatJaDateTime(chosen.startAt, displayTz)} 〜 ${formatJaDateTime(chosen.endAt, displayTz)}${zoom ? ` / ${zoom.zoomUrl}` : ""}`,
    kind: "SCHEDULE_CONFIRMED",
    payload: {
      negotiationId,
      sessionNumber: negotiation.sessionNumber ?? null,
      start: chosen.startAt,
      end: chosen.endAt,
      zoomUrl: zoom?.zoomUrl ?? null,
      zoomMeetingId: zoom?.zoomMeetingId ?? null,
      zoomPass: zoom?.zoomPass ?? null,
      icsContent: ics,
      googleCalendarUrl: googleCalendarLink,
      outlookCalendarUrl: outlookCalendarLink,
    },
  });

  await enqueueSessionFeedbackEmailJob({
    negotiationId,
    slotId: chosen.id,
    matchId,
    clientId: matchFull.clientId,
    slotEndAt: new Date(chosen.endAt),
  });

  await appendAdminNotification({
    type: "SLOT_CONFIRMED",
    matchId,
    sessionNumber: negotiation.sessionNumber ?? null,
    actorUserId: session.sub,
    actorRole: session.role,
    summary: `${matchFull.partner.displayName}さんが ${negotiation.sessionNumber ?? "?"} 回目の日程を確定しました（${formatJaDateTime(chosen.startAt, displayTz)}〜）。`,
    // 日程確定は match ページの日程調整タブに直接飛ばす。
    link: `/match/${matchId}#schedule`,
  });

  // クライアントへ通知
  await appendMemberNotification({
    recipientUserId: matchFull.clientId,
    type: "SLOT_CONFIRMED",
    matchId,
    sessionNumber: negotiation.sessionNumber ?? null,
    actorUserId: session.sub,
    actorRole: session.role,
    summary: `${matchFull.partner.displayName}さんが ${negotiation.sessionNumber ?? "?"} 回目の日程を確定しました（${formatJaDateTime(chosen.startAt, displayTz)}〜）。`,
    link: `/match/${matchId}#schedule`,
  });

  return jsonOk({ ok: true });
}
