import { sealOAuthState } from "@/lib/oauth-state";
import { googleAuthorizationUrl } from "@/lib/oauth-google";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const next = request.nextUrl.searchParams.get("next") ?? "/dashboard";
    const rawRole = request.nextUrl.searchParams.get("role");
    const role = rawRole === "PARTNER" || rawRole === "CLIENT" ? rawRole : undefined;
    const state = await sealOAuthState({ next: next.startsWith("/") ? next : "/dashboard", role });
    return NextResponse.redirect(googleAuthorizationUrl(state));
  } catch (e) {
    const origin = request.nextUrl.origin;
    const msg =
      e instanceof Error && e.message.includes("GOOGLE_CLIENT_ID")
        ? "oauth_unconfigured"
        : "oauth_error";
    return NextResponse.redirect(`${origin}/login?error=${msg}`);
  }
}
