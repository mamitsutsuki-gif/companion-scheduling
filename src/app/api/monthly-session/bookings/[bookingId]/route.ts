import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getUserById, isDeletedUser } from "@/lib/repositories/user-repository";
import {
  cancelMonthlyBooking,
  createMonthlyMessage,
  enrichBookingForDisplay,
  getBookingById,
  listMonthlyMessages,
} from "@/lib/repositories/monthly-session-repository";
import { isChatActiveForBooking, MONTHLY_SERVICE_LABELS } from "@/lib/monthly-session";
import { resolveMonthlyMeetingSnapshot } from "@/lib/notify-monthly-session";
import { buildIcsEvent } from "@/lib/ics";
import { buildGoogleCalendarLink, buildOutlookCalendarLink } from "@/lib/calendar-links";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ bookingId: string }> };

async function accessBooking(bookingId: string) {
  const session = await readSession();
  if (!session) return { error: jsonError("未ログインです。", 401) as Response };
  const me = await getUserById(session.sub);
  if (!me || isDeletedUser(me)) return { error: jsonError("ユーザーが見つかりません。", 404) as Response };
  const booking = await getBookingById(bookingId);
  if (!booking) return { error: jsonError("予約が見つかりません。", 404) as Response };

  const isAdmin = me.role === "ADMIN" || me.role === "ADMIN_ASSISTANT";
  const isParty = me.id === booking.clientId || me.id === booking.partnerId;
  if (!isAdmin && !isParty) return { error: jsonError("権限がありません。", 403) as Response };
  return { me, booking, isAdmin };
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { bookingId } = await ctx.params;
  const gate = await accessBooking(bookingId);
  if ("error" in gate) return gate.error;

  const [display, messages, meeting] = await Promise.all([
    enrichBookingForDisplay(gate.booking),
    listMonthlyMessages(bookingId),
    resolveMonthlyMeetingSnapshot(gate.booking.companyId, gate.booking.partnerId),
  ]);
  const chatActive =
    gate.isAdmin || isChatActiveForBooking(gate.booking.startAt, gate.booking.endAt);

  const senders = new Map<string, string>();
  for (const m of messages) {
    if (!senders.has(m.senderId)) {
      const u = await getUserById(m.senderId);
      senders.set(m.senderId, u?.displayName ?? "ユーザー");
    }
  }

  const start = new Date(gate.booking.startAt);
  const end = new Date(gate.booking.endAt);
  const serviceLabel =
    MONTHLY_SERVICE_LABELS[gate.booking.serviceType] ?? "セッション";
  const eventTitle = `モチベイジ セッション申し込み（${serviceLabel}・${display.clientDisplayName}さん）`;
  const eventDetails =
    `種別: ${serviceLabel}\nクライアント: ${display.clientDisplayName}さん\nパートナー: ${display.partnerDisplayName}さん\n` +
    (meeting?.joinUrl ? `会議: ${meeting.joinUrl}\n` : "") +
    `ご予約が確定しました。`;
  const icsContent =
    !Number.isNaN(start.valueOf()) && !Number.isNaN(end.valueOf())
      ? buildIcsEvent({
          uid: `monthly-${gate.booking.id}@companion-scheduling`,
          start,
          end,
          title: eventTitle,
          description: eventDetails,
          location: meeting?.joinUrl,
        })
      : null;
  const googleCalendarUrl = icsContent
    ? buildGoogleCalendarLink({
        title: eventTitle,
        start,
        end,
        details: eventDetails,
        location: meeting?.joinUrl,
      })
    : null;
  const outlookCalendarUrl = icsContent
    ? buildOutlookCalendarLink({
        title: eventTitle,
        start,
        end,
        details: eventDetails,
        location: meeting?.joinUrl,
      })
    : null;

  return jsonOk({
    booking: display,
    messages: messages.map((m) => ({
      ...m,
      senderDisplayName: senders.get(m.senderId) ?? "ユーザー",
    })),
    meeting,
    chatActive,
    calendar: {
      icsContent,
      googleCalendarUrl,
      outlookCalendarUrl,
    },
  });
}

const postSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

export async function POST(request: Request, ctx: RouteContext) {
  const { bookingId } = await ctx.params;
  const gate = await accessBooking(bookingId);
  if ("error" in gate) return gate.error;
  if (gate.booking.status !== "confirmed") {
    return jsonError("この予約ではチャットできません。", 400);
  }
  if (!gate.isAdmin && !isChatActiveForBooking(gate.booking.startAt, gate.booking.endAt)) {
    return jsonError("チャットはセッション当日のみ利用できます。", 400);
  }
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");
  const result = await createMonthlyMessage(bookingId, gate.me.id, parsed.data.body);
  if (!result.ok) return jsonError(result.error);
  return jsonOk({ ok: true, message: result.message });
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const { bookingId } = await ctx.params;
  const gate = await accessBooking(bookingId);
  if ("error" in gate) return gate.error;
  const result = await cancelMonthlyBooking(bookingId, gate.me.id);
  if (!result.ok) return jsonError(result.error, 400);
  return jsonOk({ ok: true, booking: result.booking });
}
