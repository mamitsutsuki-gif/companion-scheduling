import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getPartnerZoomProfile, upsertPartnerZoomProfile } from "@/lib/repositories/zoom-repository";
import { validatePartnerMeetingInput } from "@/lib/meeting-provider-shared";

const putSchema = z.object({
  zoomUrl: z.string().url(),
  zoomMeetingId: z.string().max(60).optional().default(""),
  zoomPass: z.string().max(120),
  googleMeetUrl: z.string().url().max(500),
});

export async function GET() {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "PARTNER") return jsonError("パートナーのみ設定できます。", 403);

  const profile = await getPartnerZoomProfile(session.sub);

  return jsonOk({
    zoom: profile
      ? {
          zoomUrl: profile.zoomUrl,
          zoomMeetingId: profile.zoomMeetingId ?? "",
          zoomPass: profile.zoomPass ?? "",
          googleMeetUrl: profile.googleMeetUrl ?? "",
        }
      : null,
  });
}

export async function PUT(request: Request) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "PARTNER") return jsonError("パートナーのみ設定できます。", 403);

  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  const zoomUrl = parsed.data.zoomUrl.trim();
  const zoomMeetingId = parsed.data.zoomMeetingId.trim();
  const zoomPass = parsed.data.zoomPass.trim();
  const googleMeetUrl = parsed.data.googleMeetUrl.trim();
  const validationError = validatePartnerMeetingInput({
    zoomUrl,
    zoomMeetingId,
    zoomPass,
    googleMeetUrl,
  });
  if (validationError) return jsonError(validationError, 400);

  const profile = await upsertPartnerZoomProfile({
    partnerId: session.sub,
    zoomUrl,
    zoomMeetingId: zoomMeetingId || null,
    zoomPass: zoomPass || null,
    googleMeetUrl,
  });

  return jsonOk({ ok: true, zoom: profile });
}
