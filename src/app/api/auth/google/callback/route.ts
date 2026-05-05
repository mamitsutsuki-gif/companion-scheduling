import { prisma } from "@/lib/prisma";
import { createSessionCookie } from "@/lib/session";
import { openOAuthState } from "@/lib/oauth-state";
import { exchangeGoogleCode, fetchGoogleProfile } from "@/lib/oauth-google";
import { hashPassword } from "@/lib/password";
import { NextRequest, NextResponse } from "next/server";

function redirectLogin(request: NextRequest, reason: string) {
  return NextResponse.redirect(new URL(`/login?error=${reason}`, request.nextUrl.origin));
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state) return redirectLogin(request, "oauth_missing");

  const payload = await openOAuthState(state);
  if (!payload) return redirectLogin(request, "oauth_state");

  let profile;
  try {
    const token = await exchangeGoogleCode(code);
    profile = await fetchGoogleProfile(token);
  } catch {
    return redirectLogin(request, "oauth_token");
  }

  if (profile.email_verified === false) {
    return redirectLogin(request, "oauth_unverified");
  }

  const email = profile.email.trim().toLowerCase();
  const googleSub = profile.sub;
  const newUserRole = payload.role === "PARTNER" ? "PARTNER" : "CLIENT";
  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    const display =
      profile.name?.trim() ||
      email.split("@")[0] ||
      "Googleユーザー";
    try {
      user = await prisma.user.create({
        data: {
          email,
          displayName: display.slice(0, 80),
          role: newUserRole,
          googleSub,
          passwordHash: null,
        },
      });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("Unknown argument `googleSub`")) throw error;
      // Compatibility path while dev server is still using an old Prisma client.
      const fallbackPasswordHash = await hashPassword(`oauth-only:${googleSub}:${email}`);
      user = await prisma.user.create({
        data: {
          email,
          displayName: display.slice(0, 80),
          role: newUserRole,
          passwordHash: fallbackPasswordHash,
        },
      });
    }
  } else {
    try {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleSub },
      });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("Unknown argument `googleSub`")) throw error;
      // Compatibility path while dev server is still using an old Prisma client.
      user = await prisma.user.update({
        where: { id: user.id },
        data: {},
      });
    }
  }

  await createSessionCookie({ sub: user.id, role: user.role });

  const next = payload.next && payload.next.startsWith("/") ? payload.next : "/dashboard";
  return NextResponse.redirect(new URL(next, request.nextUrl.origin));
}
