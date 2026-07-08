import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getUserById, isDeletedUser } from "@/lib/repositories/user-repository";
import {
  addAvailabilitySlots,
  deleteAvailabilitySlot,
  enrichBookingForDisplay,
  getMonthlyPartnerProfile,
  isEligibleMonthlyPartner,
  listAvailabilityForPartner,
  listBookingsForPartner,
  upsertMonthlyPartnerProfile,
} from "@/lib/repositories/monthly-session-repository";
import {
  MONTHLY_SERVICE_TYPES,
  earliestBookableAt,
  isMonthlyServiceType,
} from "@/lib/monthly-session";
import { getPartnerZoomProfile } from "@/lib/repositories/zoom-repository";
import { resolveMeetingSnapshotFromProfile } from "@/lib/meeting-provider";

export const dynamic = "force-dynamic";

async function requireEligiblePartner() {
  const session = await readSession();
  if (!session) return { error: jsonError("未ログインです。", 401) };
  const me = await getUserById(session.sub);
  if (!me || isDeletedUser(me)) return { error: jsonError("ユーザーが見つかりません。", 404) };
  if (me.role !== "PARTNER") return { error: jsonError("権限がありません。", 403) };
  const eligible = await isEligibleMonthlyPartner(me.id);
  if (!eligible) return { error: jsonError("この機能の対象パートナーではありません。", 403) };
  return { me };
}

export async function GET() {
  const gate = await requireEligiblePartner();
  if ("error" in gate) return gate.error;

  const [profile, availability, bookings, zoom] = await Promise.all([
    getMonthlyPartnerProfile(gate.me.id),
    listAvailabilityForPartner(gate.me.id),
    listBookingsForPartner(gate.me.id, { statuses: ["confirmed", "cancelled"] }),
    getPartnerZoomProfile(gate.me.id),
  ]);
  const enriched = await Promise.all(
    bookings
      .slice()
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .map((b) => enrichBookingForDisplay(b)),
  );
  const meeting = resolveMeetingSnapshotFromProfile("zoom", zoom);

  return jsonOk({
    profile: profile ?? {
      partnerId: gate.me.id,
      fullName: gate.me.displayName,
      career: "",
      bio: "",
      services: [],
      updatedAt: null,
    },
    availability,
    bookings: enriched,
    meetingConfigured: Boolean(meeting?.joinUrl || zoom?.googleMeetUrl),
    serviceTypes: MONTHLY_SERVICE_TYPES,
    earliestBookableAt: earliestBookableAt().toISOString(),
  });
}

const patchSchema = z.object({
  fullName: z.string().trim().min(1).max(80).optional(),
  career: z.string().max(4000).optional(),
  bio: z.string().max(4000).optional(),
  services: z.array(z.string()).max(3).optional(),
  addAvailabilityStartAts: z.array(z.string().min(1)).max(200).optional(),
  deleteAvailabilitySlotId: z.string().min(1).optional(),
});

export async function PATCH(request: Request) {
  const gate = await requireEligiblePartner();
  if ("error" in gate) return gate.error;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  if (
    parsed.data.fullName !== undefined ||
    parsed.data.career !== undefined ||
    parsed.data.bio !== undefined ||
    parsed.data.services !== undefined
  ) {
    const services = parsed.data.services
      ?.map((s) => s)
      .filter(isMonthlyServiceType);
    await upsertMonthlyPartnerProfile(gate.me.id, {
      fullName: parsed.data.fullName,
      career: parsed.data.career,
      bio: parsed.data.bio,
      services,
    });
  }

  if (parsed.data.addAvailabilityStartAts?.length) {
    const result = await addAvailabilitySlots(gate.me.id, parsed.data.addAvailabilityStartAts);
    if (!result.ok) return jsonError(result.error);
  }

  if (parsed.data.deleteAvailabilitySlotId) {
    const result = await deleteAvailabilitySlot(gate.me.id, parsed.data.deleteAvailabilitySlotId);
    if (!result.ok) return jsonError(result.error);
  }

  return jsonOk({ ok: true });
}
