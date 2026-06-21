import { addMinutes } from "date-fns";
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
import { enqueueSessionFeedbackEmailJob } from "@/lib/repositories/session-feedback-job-repository";
import { appendAdminNotification } from "@/lib/repositories/admin-notification-repository";
import { appendMemberNotification } from "@/lib/repositories/member-notification-repository";
import { getEffectiveAppSettingsForMatch } from "@/lib/effective-app-settings";
import { formatJaDateTime } from "@/lib/format-datetime";
import {
  formatMeetingLines,
  meetingProviderLabel,
  resolveMeetingSnapshotForMatch,
} from "@/lib/meeting-provider";
import { validateManualSlotStart, validateSlotWindow } from "@/lib/slot-schedule";

const schema = z.object({
  slotId: z.string().min(1),
  adjustedStartAt: z.string().datetime().optional(),
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

  const settings = await getEffectiveAppSettingsForMatch(matchId);
  const windowSettings = {
    slotDurationMinutes: settings.slotDurationMinutes,
    slotEarliestHour: settings.slotEarliestHour,
    slotLatestHour: settings.slotLatestHour,
    allowWeekends: settings.allowWeekends,
    timezone: settings.timezone,
  };

  let finalStart = new Date(chosen.startAt);
  let finalEnd = new Date(chosen.endAt);
  if (parsed.data.adjustedStartAt) {
    const adjusted = new Date(parsed.data.adjustedStartAt);
    if (Number.isNaN(adjusted.valueOf())) {
      return jsonError("微調整の開始時刻が不正です。", 400);
    }
    const manualErr = validateManualSlotStart(adjusted, finalStart, windowSettings);
    if (manualErr) return jsonError(manualErr, 400);
    finalStart = adjusted;
    finalEnd = addMinutes(finalStart, settings.slotDurationMinutes);
    const windowErr = validateSlotWindow(finalStart, finalEnd, windowSettings);
    if (windowErr) return jsonError(windowErr, 400);
  }

  const matchFull = await getMatchById(matchId);
  if (!matchFull) return jsonOk({ ok: true });
  const meeting = await resolveMeetingSnapshotForMatch(matchId, matchFull.partnerId);
  await confirmNegotiationSlot(negotiationId, parsed.data.slotId, {
    zoomUrl: meeting?.joinUrl ?? null,
    zoomMeetingId: meeting?.zoomMeetingId ?? null,
    zoomPass: meeting?.zoomPass ?? null,
    meetingProvider: meeting?.provider ?? null,
    finalStartAt: finalStart,
    finalEndAt: finalEnd,
  });
  // 同じセッション番号で過去に立てられた「再調整中」フラグをクリア
  await clearRescheduleFlagsForSession(matchId, Number(negotiation.sessionNumber ?? 1)).catch(() => null);

  const meetingLines = formatMeetingLines(meeting);
  const meetingLine = meetingLines.join("\n");
  const providerLabel = meeting ? meetingProviderLabel(meeting.provider) : "オンライン会議";

  const ics = buildIcsEvent({
    uid: `${chosen.id}@companion-scheduling`,
    start: finalStart,
    end: finalEnd,
    title: `モチベイジ1on1（${matchFull.client.displayName}さん）`,
    description:
      `${meetingLine}\n\nご予約が確定しました。\n連絡先はプラットフォームを通じない共有はできません。`.trim(),
    location: meeting?.joinUrl,
  });

  const displayTz = settings.timezone || "Asia/Tokyo";

  const textBody =
    `次の日程が確定しました。\n` +
    `開始: ${formatJaDateTime(finalStart, displayTz)}\n` +
    `終了: ${formatJaDateTime(finalEnd, displayTz)}\n` +
    (meetingLine ? `${providerLabel}\n${meetingLine}\n` : "") +
    `\n連絡先はプラットフォーム内チャットのみをご利用ください。\nカレンダー用 .ics を添付しています。`;

  const eventTitle = `モチベイジ1on1（${matchFull.client.displayName}さん）`;
  const eventDetails =
    `${meetingLine}\n\nご予約が確定しました。`.trim();
  const googleCalendarLink = buildGoogleCalendarLink({
    title: eventTitle,
    start: finalStart,
    end: finalEnd,
    details: eventDetails,
    location: meeting?.joinUrl,
  });
  const outlookCalendarLink = buildOutlookCalendarLink({
    title: eventTitle,
    start: finalStart,
    end: finalEnd,
    details: eventDetails,
    location: meeting?.joinUrl,
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
    body: `日程確定: ${formatJaDateTime(finalStart, displayTz)} 〜 ${formatJaDateTime(finalEnd, displayTz)}${meeting ? ` / ${meeting.joinUrl}` : ""}`,
    kind: "SCHEDULE_CONFIRMED",
    payload: {
      negotiationId,
      sessionNumber: negotiation.sessionNumber ?? null,
      start: finalStart.toISOString(),
      end: finalEnd.toISOString(),
      zoomUrl: meeting?.joinUrl ?? null,
      zoomMeetingId: meeting?.zoomMeetingId ?? null,
      zoomPass: meeting?.zoomPass ?? null,
      meetingProvider: meeting?.provider ?? null,
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
    slotEndAt: finalEnd,
  });

  await appendAdminNotification({
    type: "SLOT_CONFIRMED",
    matchId,
    sessionNumber: negotiation.sessionNumber ?? null,
    actorUserId: session.sub,
    actorRole: session.role,
    summary: `${matchFull.partner.displayName}さんが ${negotiation.sessionNumber ?? "?"} 回目の日程を確定しました（${formatJaDateTime(finalStart, displayTz)}〜）。`,
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
    summary: `${matchFull.partner.displayName}さんが ${negotiation.sessionNumber ?? "?"} 回目の日程を確定しました（${formatJaDateTime(finalStart, displayTz)}〜）。`,
    link: `/match/${matchId}#schedule`,
  });

  return jsonOk({ ok: true });
}
