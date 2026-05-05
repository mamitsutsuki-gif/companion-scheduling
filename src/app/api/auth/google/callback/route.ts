import { createSessionCookie } from "@/lib/session";
import { openOAuthState } from "@/lib/oauth-state";
import { exchangeGoogleCode, fetchGoogleProfile } from "@/lib/oauth-google";
import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { NextRequest, NextResponse } from "next/server";

function resolvedAppOrigin(request: NextRequest) {
  const fromEnv = process.env.APP_ORIGIN?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const fromReq = request.nextUrl.origin.replace(/\/$/, "");
  if (!fromReq.includes("0.0.0.0")) return fromReq;
  return "http://localhost:3001";
}

function redirectLogin(request: NextRequest, reason: string) {
  return NextResponse.redirect(new URL(`/login?error=${reason}`, resolvedAppOrigin(request)));
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
  let user:
    | {
        id: string;
        role: "ADMIN" | "PARTNER" | "CLIENT";
      }
    | null = null;

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return redirectLogin(request, "oauth_error");
    const users = db.collection("users");
    const bySub = await users.where("googleSub", "==", googleSub).limit(1).get();
    if (!bySub.empty) {
      const d = bySub.docs[0]!;
      const raw = d.data() as Record<string, unknown>;
      const role =
        raw.role === "ADMIN" || raw.role === "PARTNER" || raw.role === "CLIENT"
          ? raw.role
          : ("CLIENT" as const);
      user = { id: d.id, role };
    }
  } else {
    user = await prisma.user.findFirst({ where: { email, googleSub } });
  }

  if (!user) return redirectLogin(request, "oauth_not_allowed");
  await createSessionCookie({ sub: user.id, role: user.role });

  const next = payload.next && payload.next.startsWith("/") ? payload.next : "/dashboard";
  return NextResponse.redirect(new URL(next, resolvedAppOrigin(request)));
}
