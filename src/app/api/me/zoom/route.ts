import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getPartnerZoomProfile, upsertPartnerZoomProfile } from "@/lib/repositories/zoom-repository";

const putSchema = z.object({
  zoomUrl: z.string().url(),
  zoomMeetingId: z.string().max(60).optional().default(""),
  zoomPass: z.string().max(120),
});

export async function GET() {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "PARTNER") return jsonError("パートナーのみ設定できます。", 403);

  const profile = await getPartnerZoomProfile(session.sub);

  return jsonOk({ zoom: profile });
}

export async function PUT(request: Request) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "PARTNER") return jsonError("パートナーのみ設定できます。", 403);

  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  const profile = await upsertPartnerZoomProfile({
    partnerId: session.sub,
    zoomUrl: parsed.data.zoomUrl,
    zoomMeetingId:
      parsed.data.zoomMeetingId.trim() === "" ? null : parsed.data.zoomMeetingId.trim(),
    zoomPass: parsed.data.zoomPass.trim() === "" ? null : parsed.data.zoomPass,
  });

  return jsonOk({ ok: true, zoom: profile });
}
