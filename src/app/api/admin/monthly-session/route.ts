import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { requireAdminish, requireAdminWriter } from "@/lib/admin-access";
import {
  getMonthlyGlobalSettings,
  listAllBookings,
  enrichBookingForDisplay,
  upsertMonthlyGlobalSettings,
  setProgramMonthlyLimit,
} from "@/lib/repositories/monthly-session-repository";
import { listAdminVisibleUsers } from "@/lib/repositories/user-repository";
import { normalizeMonthlyReception } from "@/lib/monthly-session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await readSession();
  const denied = requireAdminish(session);
  if (denied) return jsonError(denied.error, denied.status);

  const [settings, partners, bookings] = await Promise.all([
    getMonthlyGlobalSettings(),
    listAdminVisibleUsers("PARTNER"),
    listAllBookings({ statuses: ["confirmed", "cancelled", "completed"] }),
  ]);

  const enriched = await Promise.all(
    bookings
      .slice()
      .sort((a, b) => b.startAt.localeCompare(a.startAt))
      .slice(0, 200)
      .map((b) => enrichBookingForDisplay(b)),
  );

  return jsonOk({
    settings,
    partners: partners.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      email: p.email,
      eligible: settings.eligiblePartnerIds.includes(p.id),
    })),
    bookings: enriched,
  });
}

const patchSchema = z.object({
  eligiblePartnerIds: z.array(z.string().min(1)).max(500).optional(),
  reception: z
    .object({
      closedWeekdays: z.array(z.number().int().min(0).max(6)).optional(),
      earliestHour: z.number().int().min(0).max(23).optional(),
      latestHour: z.number().int().min(1).max(24).optional(),
    })
    .optional(),
  programMonthlyLimit: z
    .object({
      programId: z.string().min(1),
      limit: z.number().int().min(0).max(500).nullable(),
    })
    .optional(),
});

export async function PATCH(request: Request) {
  const session = await readSession();
  const denied = requireAdminWriter(session);
  if (denied) return jsonError(denied.error, denied.status);

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  if (parsed.data.programMonthlyLimit) {
    await setProgramMonthlyLimit(
      parsed.data.programMonthlyLimit.programId,
      parsed.data.programMonthlyLimit.limit,
    );
  }

  const settings = await upsertMonthlyGlobalSettings({
    eligiblePartnerIds: parsed.data.eligiblePartnerIds,
    reception: parsed.data.reception
      ? normalizeMonthlyReception({
          ...(await getMonthlyGlobalSettings()).reception,
          ...parsed.data.reception,
        })
      : undefined,
  });

  return jsonOk({ ok: true, settings });
}
