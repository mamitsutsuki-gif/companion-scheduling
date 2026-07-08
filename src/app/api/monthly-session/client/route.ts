import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getUserById, isDeletedUser } from "@/lib/repositories/user-repository";
import {
  cancelMonthlyBooking,
  createMonthlyBooking,
  enrichBookingForDisplay,
  listBookingsForClient,
  listOpenSlotsForService,
  resolveMonthlyProgramForClient,
} from "@/lib/repositories/monthly-session-repository";
import {
  MONTHLY_SERVICE_TYPES,
  earliestBookableAt,
  isMonthlyServiceType,
  tokyoMonthKey,
} from "@/lib/monthly-session";

export const dynamic = "force-dynamic";

async function requireMonthlyClient() {
  const session = await readSession();
  if (!session) return { error: jsonError("未ログインです。", 401) };
  const me = await getUserById(session.sub);
  if (!me || isDeletedUser(me)) return { error: jsonError("ユーザーが見つかりません。", 404) };
  if (me.role !== "CLIENT" && me.role !== "CLIENT_ADMIN" && me.role !== "CLIENT_HR") {
    return { error: jsonError("権限がありません。", 403) };
  }
  const enrollment = await resolveMonthlyProgramForClient(me.id);
  if (!enrollment) {
    return { error: jsonError("セッション申し込みの対象ではありません。", 403) };
  }
  return { me, enrollment };
}

export async function GET(request: Request) {
  const gate = await requireMonthlyClient();
  if ("error" in gate) return gate.error;

  const url = new URL(request.url);
  const serviceTypeRaw = url.searchParams.get("serviceType");
  const fromYmd = url.searchParams.get("fromYmd") ?? "";
  const toYmd = url.searchParams.get("toYmd") ?? "";

  const bookings = await listBookingsForClient(gate.me.id, {
    statuses: ["confirmed", "cancelled"],
  });
  const enriched = await Promise.all(bookings.map((b) => enrichBookingForDisplay(b)));

  let slots: Awaited<ReturnType<typeof listOpenSlotsForService>> = [];
  if (serviceTypeRaw && isMonthlyServiceType(serviceTypeRaw) && fromYmd && toYmd) {
    slots = await listOpenSlotsForService({
      serviceType: serviceTypeRaw,
      fromYmd,
      toYmd,
    });
  }

  return jsonOk({
    enrollment: gate.enrollment,
    monthKey: tokyoMonthKey(new Date()),
    serviceTypes: MONTHLY_SERVICE_TYPES,
    earliestBookableAt: earliestBookableAt().toISOString(),
    bookings: enriched,
    slots,
  });
}

const postSchema = z.object({
  serviceType: z.string(),
  partnerId: z.string().min(1),
  startAt: z.string().min(1),
});

export async function POST(request: Request) {
  const gate = await requireMonthlyClient();
  if ("error" in gate) return gate.error;

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isMonthlyServiceType(parsed.data.serviceType)) {
    return jsonError("入力内容が不正です。");
  }

  const result = await createMonthlyBooking({
    clientId: gate.me.id,
    partnerId: parsed.data.partnerId,
    companyId: gate.enrollment.companyId,
    programId: gate.enrollment.programId,
    serviceType: parsed.data.serviceType,
    startAt: parsed.data.startAt,
  });
  if (!result.ok) return jsonError(result.error, 400);
  const booking = await enrichBookingForDisplay(result.booking);
  return jsonOk({ ok: true, booking });
}

const deleteSchema = z.object({
  bookingId: z.string().min(1),
});

export async function DELETE(request: Request) {
  const gate = await requireMonthlyClient();
  if ("error" in gate) return gate.error;
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");
  const result = await cancelMonthlyBooking(parsed.data.bookingId, gate.me.id);
  if (!result.ok) return jsonError(result.error, 400);
  return jsonOk({ ok: true, booking: result.booking });
}
