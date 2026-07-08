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
import { isChatActiveForBooking } from "@/lib/monthly-session";
import { getPartnerZoomProfile } from "@/lib/repositories/zoom-repository";
import { resolveMeetingSnapshotFromProfile } from "@/lib/meeting-provider";
import { getEffectiveAppSettings } from "@/lib/repositories/app-settings-repository";

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

  const [display, messages, profile, effective] = await Promise.all([
    enrichBookingForDisplay(gate.booking),
    listMonthlyMessages(bookingId),
    getPartnerZoomProfile(gate.booking.partnerId),
    getEffectiveAppSettings({ companyId: gate.booking.companyId }),
  ]);
  const meeting = resolveMeetingSnapshotFromProfile(effective.meetingProvider, profile);
  const chatActive =
    gate.isAdmin || isChatActiveForBooking(gate.booking.startAt, gate.booking.endAt);

  const senders = new Map<string, string>();
  for (const m of messages) {
    if (!senders.has(m.senderId)) {
      const u = await getUserById(m.senderId);
      senders.set(m.senderId, u?.displayName ?? "ユーザー");
    }
  }

  return jsonOk({
    booking: display,
    messages: messages.map((m) => ({
      ...m,
      senderDisplayName: senders.get(m.senderId) ?? "ユーザー",
    })),
    meeting,
    chatActive,
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
