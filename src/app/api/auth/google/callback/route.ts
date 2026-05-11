import { createSessionCookie } from "@/lib/session";
import { openOAuthState } from "@/lib/oauth-state";
import { exchangeGoogleCode, fetchGoogleProfile } from "@/lib/oauth-google";
import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";
import { upsertPartnerZoomProfile } from "@/lib/repositories/zoom-repository";
import { normalizeAvailabilitySelections } from "@/lib/availability";

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
  const requestedRole =
    payload.allowCreate && payload.role === "PARTNER"
      ? "PARTNER"
      : payload.allowCreate && payload.role === "CLIENT"
        ? "CLIENT"
        : null;

  if (requestedRole === "PARTNER") {
    const zoomUrl = payload.partnerZoomUrl?.trim() ?? "";
    const zoomPass = payload.partnerZoomPass?.trim() ?? "";
    try {
      // eslint-disable-next-line no-new
      new URL(zoomUrl);
    } catch {
      return redirectLogin(request, "partner_zoom_required");
    }
    if (!zoomUrl.startsWith("https://") && !zoomUrl.startsWith("http://")) {
      return redirectLogin(request, "partner_zoom_required");
    }
    if (zoomPass.length < 1 || zoomPass.length > 120) {
      return redirectLogin(request, "partner_zoom_required");
    }
  }

  let user:
    | {
        id: string;
        role: "ADMIN" | "PARTNER" | "CLIENT" | "CLIENT_ADMIN";
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
      if (typeof raw.deletedAt === "string" && raw.deletedAt.trim()) {
        return redirectLogin(request, "user_deleted");
      }
      const role =
        raw.role === "ADMIN" ||
        raw.role === "PARTNER" ||
        raw.role === "CLIENT" ||
        raw.role === "CLIENT_ADMIN"
          ? raw.role
          : ("CLIENT" as const);
      user = { id: d.id, role };
    } else if (requestedRole) {
      // セキュリティ: 同じメールが別のログイン方法（Firebase password 等）で既に登録済みなら、
      // Google アカウントを新規に紐付けて多重登録を許さない。
      const byEmail = await users.where("email", "==", email).limit(1).get();
      if (!byEmail.empty) {
        return redirectLogin(request, "email_already_registered");
      }
      const display = profile.name?.trim() || email.split("@")[0] || "Googleユーザー";
      // クライアント新規登録の場合のみ、stateに含まれる対応可能時間を保存。
      let availabilitySlotIds: string[] = [];
      if (requestedRole === "CLIENT" && payload.availabilitySlotIds && payload.availabilitySlotIds.length > 0) {
        const settings = await getAppSettingsRow();
        availabilitySlotIds = normalizeAvailabilitySelections(payload.availabilitySlotIds, settings.availabilitySlotOptions);
      }
      const ref = users.doc();
      await ref.set(
        {
          email,
          displayName: display.slice(0, 80),
          role: requestedRole,
          googleSub,
          firebaseUid: null,
          availabilitySlotIds,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      user = { id: ref.id, role: requestedRole };
      if (requestedRole === "PARTNER" && payload.partnerZoomUrl && payload.partnerZoomPass) {
        await upsertPartnerZoomProfile({
          partnerId: ref.id,
          zoomUrl: payload.partnerZoomUrl.trim(),
          zoomMeetingId: payload.partnerZoomMeetingId?.trim() || null,
          zoomPass: payload.partnerZoomPass.trim() === "なし" ? null : payload.partnerZoomPass.trim(),
        });
      }
    }
  } else {
    const existing = await prisma.user.findFirst({
      where: { email, googleSub },
      select: { id: true, role: true, deletedAt: true },
    });
    if (existing?.deletedAt) {
      return redirectLogin(request, "user_deleted");
    }
    user = existing ? { id: existing.id, role: existing.role } : null;
    if (!user && requestedRole) {
      const display = profile.name?.trim() || email.split("@")[0] || "Googleユーザー";
      user = await prisma.user.create({
        data: {
          email,
          displayName: display.slice(0, 80),
          role: requestedRole,
          googleSub,
          passwordHash: null,
        },
      });
      if (requestedRole === "PARTNER" && payload.partnerZoomUrl && payload.partnerZoomPass) {
        await upsertPartnerZoomProfile({
          partnerId: user.id,
          zoomUrl: payload.partnerZoomUrl.trim(),
          zoomMeetingId: payload.partnerZoomMeetingId?.trim() || null,
          zoomPass: payload.partnerZoomPass.trim() === "なし" ? null : payload.partnerZoomPass.trim(),
        });
      }
    }
  }

  if (!user) return redirectLogin(request, "oauth_not_allowed");
  await createSessionCookie({ sub: user.id, role: user.role });

  const next = payload.next && payload.next.startsWith("/") ? payload.next : "/dashboard";
  return NextResponse.redirect(new URL(next, resolvedAppOrigin(request)));
}
