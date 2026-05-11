import { sealOAuthState } from "@/lib/oauth-state";
import { googleAuthorizationUrl } from "@/lib/oauth-google";
import { NextRequest, NextResponse } from "next/server";

function resolvedAppOrigin(request: NextRequest) {
  const fromEnv = process.env.APP_ORIGIN?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const fromReq = request.nextUrl.origin.replace(/\/$/, "");
  if (!fromReq.includes("0.0.0.0")) return fromReq;
  return "http://localhost:3001";
}

export async function GET(request: NextRequest) {
  try {
    const next = request.nextUrl.searchParams.get("next") ?? "/dashboard";
    const rawRole = request.nextUrl.searchParams.get("role");
    const role = rawRole === "PARTNER" || rawRole === "CLIENT" ? rawRole : undefined;
    const allowCreate = request.nextUrl.searchParams.get("register") === "1";
    const legalAccepted = request.nextUrl.searchParams.get("legal") === "1";
    const slotsRaw = request.nextUrl.searchParams.get("slots") ?? "";
    const availabilitySlotIds = slotsRaw
      ? slotsRaw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 64)
      : undefined;
    const state = await sealOAuthState({
      next: next.startsWith("/") ? next : "/dashboard",
      role,
      allowCreate,
      legalAccepted: legalAccepted || undefined,
      availabilitySlotIds,
      partnerZoomUrl: request.nextUrl.searchParams.get("zoomUrl")?.trim().slice(0, 500) || undefined,
      partnerZoomMeetingId:
        request.nextUrl.searchParams.get("zoomMeetingId")?.trim().slice(0, 60) || undefined,
      partnerZoomPass: request.nextUrl.searchParams.get("zoomPass")?.trim().slice(0, 120) || undefined,
    });
    return NextResponse.redirect(googleAuthorizationUrl(state));
  } catch (e) {
    const origin = resolvedAppOrigin(request);
    const msg =
      e instanceof Error && e.message.includes("GOOGLE_CLIENT_ID")
        ? "oauth_unconfigured"
        : "oauth_error";
    return NextResponse.redirect(`${origin}/login?error=${msg}`);
  }
}
