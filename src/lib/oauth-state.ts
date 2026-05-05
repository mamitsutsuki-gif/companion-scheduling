import { SignJWT, jwtVerify } from "jose";

function secret() {
  const raw = process.env.AUTH_SECRET;
  if (!raw) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(raw);
}

/** Google OAuth の state に埋め込む（改ざん防止・10分有効）。 */
export async function sealOAuthState(payload: { next?: string; role?: "PARTNER" | "CLIENT" }) {
  return await new SignJWT({ ...payload, v: 1 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret());
}

export async function openOAuthState(
  token: string,
): Promise<{ next?: string; role?: "PARTNER" | "CLIENT" } | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (payload.v !== 1) return null;
    const next = typeof payload.next === "string" ? payload.next : undefined;
    const role = payload.role === "PARTNER" || payload.role === "CLIENT" ? payload.role : undefined;
    return { next, role };
  } catch {
    return null;
  }
}
