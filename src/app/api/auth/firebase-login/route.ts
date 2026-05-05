import { z } from "zod";
import { createSessionCookie } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { isFirebaseAdminConfigured, verifyFirebaseIdToken } from "@/lib/firebase-admin";
import {
  attachFirebaseUid,
  createFirebaseUser,
  findUserForFirebaseLogin,
} from "@/lib/repositories/user-repository";

const bodySchema = z.object({
  idToken: z.string().min(1),
});

export async function POST(request: Request) {
  if (!isFirebaseAdminConfigured()) {
    return jsonError(
      "Firebase Auth サーバー設定が不足しています。FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY を設定してください。",
      503,
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  const decoded = await verifyFirebaseIdToken(parsed.data.idToken).catch(() => null);
  if (!decoded || !decoded.email) return jsonError("Firebase トークン検証に失敗しました。", 401);
  if (!decoded.email_verified) return jsonError("Firebase 側でメール確認が完了していません。", 401);

  const firebaseUid = decoded.uid;
  const email = decoded.email.trim().toLowerCase();
  let user = await findUserForFirebaseLogin({ email, firebaseUid });

  if (!user) {
    const displayName = (decoded.name || email.split("@")[0] || "ユーザー").slice(0, 80);
    user = await createFirebaseUser({ email, displayName, firebaseUid });
  } else if (!user.firebaseUid) {
    user = await attachFirebaseUid(user.id, firebaseUid);
  }
  if (!user) return jsonError("ユーザー連携に失敗しました。", 500);

  await createSessionCookie({ sub: user.id, role: user.role });
  return jsonOk({
    ok: true,
    user: { id: user.id, displayName: user.displayName, role: user.role, email: user.email },
  });
}
