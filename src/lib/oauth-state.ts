import { SignJWT, jwtVerify } from "jose";

function secret() {
  const raw = process.env.AUTH_SECRET;
  if (!raw) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(raw);
}

type OAuthStatePayload = {
  next?: string;
  role?: "PARTNER" | "CLIENT";
  allowCreate?: boolean;
  availabilitySlotIds?: string[];
  /** パートナー新規登録時のみ（OAuth state サイズ制限のため短めに） */
  partnerZoomUrl?: string;
  partnerZoomMeetingId?: string;
  partnerZoomPass?: string;
};

/** Google OAuth の state に埋め込む（改ざん防止・10分有効）。 */
export async function sealOAuthState(payload: OAuthStatePayload) {
  return await new SignJWT({ ...payload, v: 1 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret());
}

export async function openOAuthState(token: string): Promise<OAuthStatePayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (payload.v !== 1) return null;
    const next = typeof payload.next === "string" ? payload.next : undefined;
    const role = payload.role === "PARTNER" || payload.role === "CLIENT" ? payload.role : undefined;
    const allowCreate = payload.allowCreate === true;
    const availabilitySlotIds = Array.isArray(payload.availabilitySlotIds)
      ? payload.availabilitySlotIds.filter((v): v is string => typeof v === "string").slice(0, 64)
      : undefined;
    const partnerZoomUrl =
      typeof payload.partnerZoomUrl === "string" ? payload.partnerZoomUrl.trim().slice(0, 500) : undefined;
    const partnerZoomMeetingId =
      typeof payload.partnerZoomMeetingId === "string"
        ? payload.partnerZoomMeetingId.trim().slice(0, 60)
        : undefined;
    const partnerZoomPass =
      typeof payload.partnerZoomPass === "string" ? payload.partnerZoomPass.trim().slice(0, 120) : undefined;
    return {
      next,
      role,
      allowCreate,
      availabilitySlotIds,
      partnerZoomUrl: partnerZoomUrl || undefined,
      partnerZoomMeetingId: partnerZoomMeetingId || undefined,
      partnerZoomPass: partnerZoomPass || undefined,
    };
  } catch {
    return null;
  }
}
