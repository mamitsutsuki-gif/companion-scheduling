import { readSession, createSessionCookie } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getUserById, updateUserAvailability } from "@/lib/repositories/user-repository";
import { getPartnerZoomProfile, upsertPartnerZoomProfile } from "@/lib/repositories/zoom-repository";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";
import { normalizeAvailabilitySelections } from "@/lib/availability";
import {
  isClientRegistrationComplete,
  isPartnerRegistrationComplete,
} from "@/lib/registration-profile";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const user = await getUserById(session.sub);
  if (!user) return jsonError("ユーザーが見つかりません。", 404);

  if (session.role !== user.role) {
    await createSessionCookie({ sub: user.id, role: user.role });
  }

  if (user.role !== "PARTNER" && user.role !== "CLIENT") {
    return jsonOk({ complete: true, role: user.role });
  }
  const complete =
    user.role === "PARTNER"
      ? await isPartnerRegistrationComplete(user.id)
      : isClientRegistrationComplete(user as { role: string; availabilitySlotIds?: string[] });
  const zoom = user.role === "PARTNER" ? await getPartnerZoomProfile(user.id) : null;
  const settings = await getAppSettingsRow();
  return jsonOk({
    complete,
    role: user.role,
    availabilitySlotIds: (user as { availabilitySlotIds?: string[] }).availabilitySlotIds ?? [],
    availabilitySlotOptions: settings.availabilitySlotOptions,
    zoom: zoom
      ? {
          zoomUrl: zoom.zoomUrl,
          zoomMeetingId: zoom.zoomMeetingId ?? "",
          zoomPass: zoom.zoomPass ?? "",
          googleMeetUrl: zoom.googleMeetUrl ?? "",
        }
      : null,
  });
}

const putSchema = z.object({
  availabilitySlotIds: z.array(z.string().min(1).max(80)).max(64).optional(),
  zoomUrl: z.string().url().max(500).optional(),
  zoomMeetingId: z.string().max(60).optional(),
  zoomPass: z.string().max(120).optional(),
  googleMeetUrl: z.string().url().max(500).optional(),
});

export async function PUT(request: Request) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const user = await getUserById(session.sub);
  if (!user) return jsonError("ユーザーが見つかりません。", 404);

  if (session.role !== user.role) {
    await createSessionCookie({ sub: user.id, role: user.role });
  }

  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  if (user.role === "CLIENT") {
    const ids = parsed.data.availabilitySlotIds ?? [];
    if (ids.length === 0) return jsonError("対応可能時間を1つ以上選択してください。", 400);
    const settings = await getAppSettingsRow();
    const normalized = normalizeAvailabilitySelections(ids, settings.availabilitySlotOptions);
    if (normalized.length === 0) return jsonError("有効な対応可能時間を選択してください。", 400);
    await updateUserAvailability(user.id, normalized);
    return jsonOk({ ok: true, complete: true });
  }

  if (user.role === "PARTNER") {
    const zoomUrl = parsed.data.zoomUrl?.trim() ?? "";
    const zoomMeetingId = parsed.data.zoomMeetingId?.trim() ?? "";
    const zoomPass = parsed.data.zoomPass?.trim() ?? "";
    const googleMeetUrl = parsed.data.googleMeetUrl?.trim() ?? "";
    if (!zoomUrl || !zoomMeetingId || !zoomPass || !googleMeetUrl) {
      return jsonError("Zoom と Google Meet の情報をすべて入力してください。", 400);
    }
    await upsertPartnerZoomProfile({
      partnerId: user.id,
      zoomUrl,
      zoomMeetingId,
      zoomPass,
      googleMeetUrl,
    });
    return jsonOk({ ok: true, complete: true });
  }

  return jsonOk({ ok: true, complete: true });
}
