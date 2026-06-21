import { createSessionCookie } from "@/lib/session";
import {
  createFirebaseAuthUserWithPassword,
  deleteFirebaseAuthUserByEmail,
  getFirebaseFirestoreClient,
  isFirebaseAdminConfigured,
  isFirebaseDataBackend,
} from "@/lib/firebase-admin";
import { jsonError, jsonOk } from "@/lib/json";
import {
  AUTH_MSG_EMAIL_ALREADY_REGISTERED,
  AUTH_MSG_EMAIL_AUTH_CONFLICT,
  AUTH_MSG_REGISTRATION_FAILED,
} from "@/lib/auth-user-messages";
import { normalizeAvailabilitySelections } from "@/lib/availability";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";
import { findUserByEmail } from "@/lib/repositories/user-repository";
import {
  deletePendingRegistrationByToken,
  getPendingRegistrationByToken,
} from "@/lib/repositories/pending-registration-repository";
import {
  isClientRegistrationComplete,
  isPartnerRegistrationComplete,
} from "@/lib/registration-profile";
import { z } from "zod";

const bodySchema = z.object({
  token: z.string().min(16).max(256),
  password: z.string().min(10).max(200),
});

function isFirebaseEmailTakenError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  const code =
    typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string"
      ? (e as { code: string }).code
      : "";
  return (
    code === "auth/email-already-exists" ||
    code === "auth/email-already-in-use" ||
    msg.includes("email-already-exists") ||
    msg.includes("EMAIL_EXISTS") ||
    /already in use by another account/i.test(msg)
  );
}

async function createAuthUserForPending(pending: { email: string; password: string; displayName: string }) {
  return createFirebaseAuthUserWithPassword({
    email: pending.email,
    password: pending.password,
    displayName: pending.displayName,
  });
}

export async function POST(request: Request) {
  if (!isFirebaseDataBackend() || !isFirebaseAdminConfigured()) {
    return jsonError(AUTH_MSG_REGISTRATION_FAILED, 500);
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  const pending = await getPendingRegistrationByToken(parsed.data.token);
  if (!pending) return jsonError("リンクが無効か、有効期限切れです。新規登録からやり直してください。", 410);

  // 競合チェック: 同じメールで他経由のユーザーが先にできていれば拒否。
  const existing = await findUserByEmail(pending.email);
  if (existing) {
    await deletePendingRegistrationByToken(parsed.data.token);
    return jsonError(AUTH_MSG_EMAIL_ALREADY_REGISTERED, 409);
  }

  // Firebase Auth にユーザー作成
  let uid: string;
  try {
    const rec = await createAuthUserForPending({
      email: pending.email,
      password: parsed.data.password,
      displayName: pending.displayName,
    });
    uid = rec.uid;
  } catch (e) {
    if (isFirebaseEmailTakenError(e)) {
      // Firestore にユーザーが無いのに Auth だけ残っている（管理者削除の取りこぼし等）なら修復して再試行
      const orphaned = !(await findUserByEmail(pending.email));
      if (orphaned) {
        await deleteFirebaseAuthUserByEmail(pending.email);
        try {
          const rec = await createAuthUserForPending({
            email: pending.email,
            password: parsed.data.password,
            displayName: pending.displayName,
          });
          uid = rec.uid;
        } catch (retryError) {
          console.error("[register-email-finish] auth user recreate failed", retryError);
          await deletePendingRegistrationByToken(parsed.data.token);
          return jsonError(AUTH_MSG_EMAIL_AUTH_CONFLICT, 409);
        }
      } else {
        await deletePendingRegistrationByToken(parsed.data.token);
        return jsonError(AUTH_MSG_EMAIL_AUTH_CONFLICT, 409);
      }
    } else {
      console.error("[register-email-finish] auth user create failed", e);
      return jsonError(AUTH_MSG_REGISTRATION_FAILED, 500);
    }
  }

  // Firestore に User ドキュメント作成
  const db = getFirebaseFirestoreClient();
  if (!db) return jsonError(AUTH_MSG_REGISTRATION_FAILED, 500);

  let availabilitySlotIds: string[] = [];
  if (pending.role === "CLIENT" && pending.availabilitySlotIds.length > 0) {
    const settings = await getAppSettingsRow();
    availabilitySlotIds = normalizeAvailabilitySelections(
      pending.availabilitySlotIds,
      settings.availabilitySlotOptions,
    );
  }

  await db.collection("users").doc(uid).set(
    {
      email: pending.email,
      displayName: pending.displayName,
      role: pending.role,
      firebaseUid: uid,
      googleSub: null,
      availabilitySlotIds,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  await deletePendingRegistrationByToken(parsed.data.token);
  await createSessionCookie({ sub: uid, role: pending.role });

  const profileUser = {
    id: uid,
    role: pending.role,
    availabilitySlotIds,
  };
  const needsProfileCompletion =
    pending.role === "PARTNER"
      ? !(await isPartnerRegistrationComplete(uid))
      : pending.role === "CLIENT"
        ? !isClientRegistrationComplete(profileUser)
        : false;

  return jsonOk({
    ok: true,
    next: needsProfileCompletion ? "/register/complete-profile" : "/dashboard",
  });
}
