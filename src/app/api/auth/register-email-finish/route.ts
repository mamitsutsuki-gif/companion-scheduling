import { z } from "zod";
import {
  createFirebaseAuthUserWithPassword,
  getFirebaseFirestoreClient,
  isFirebaseAdminConfigured,
  isFirebaseDataBackend,
} from "@/lib/firebase-admin";
import { jsonError, jsonOk } from "@/lib/json";
import { findUserByEmail } from "@/lib/repositories/user-repository";
import {
  deletePendingRegistrationByToken,
  getPendingRegistrationByToken,
} from "@/lib/repositories/pending-registration-repository";
import { upsertPartnerZoomProfile } from "@/lib/repositories/zoom-repository";
import { normalizeAvailabilitySelections } from "@/lib/availability";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";

const bodySchema = z.object({
  token: z.string().min(16).max(256),
  password: z.string().min(10).max(200),
});

export async function POST(request: Request) {
  if (!isFirebaseDataBackend() || !isFirebaseAdminConfigured()) {
    return jsonError("このフローは Firebase バックエンドでのみ利用できます。", 400);
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  const pending = await getPendingRegistrationByToken(parsed.data.token);
  if (!pending) return jsonError("リンクが無効か、有効期限切れです。新規登録からやり直してください。", 410);

  // 競合チェック: 同じメールで他経由のユーザーが先にできていれば拒否。
  const existing = await findUserByEmail(pending.email);
  if (existing) {
    await deletePendingRegistrationByToken(parsed.data.token);
    return jsonError(
      "このメールアドレスは既に登録されています。ログイン画面からログインしてください。",
      409,
    );
  }

  // Firebase Auth にユーザー作成
  let uid: string;
  try {
    const rec = await createFirebaseAuthUserWithPassword({
      email: pending.email,
      password: parsed.data.password,
      displayName: pending.displayName,
    });
    uid = rec.uid;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code =
      typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string"
        ? (e as { code: string }).code
        : "";
    const emailTaken =
      code === "auth/email-already-exists" ||
      code === "auth/email-already-in-use" ||
      msg.includes("email-already-exists") ||
      msg.includes("EMAIL_EXISTS") ||
      /already in use by another account/i.test(msg);
    if (emailTaken) {
      await deletePendingRegistrationByToken(parsed.data.token);
      return jsonError(
        "このメールアドレスは Firebase Authentication 上にまだアカウントとして残っています（Firestore のユーザー一覧からは消えていても起こり得ます）。Firebase Console の Authentication → Users で該当メールを検索し、不要ならユーザーを削除してから再度「新規登録」してください。または、既に登録済みならログイン画面からログインしてください。",
        409,
      );
    }
    return jsonError(`Firebase ユーザー作成に失敗しました: ${msg}`, 500);
  }

  // Firestore に User ドキュメント作成
  const db = getFirebaseFirestoreClient();
  if (!db) return jsonError("Firestore が未設定です。", 500);

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

  if (pending.role === "PARTNER" && pending.zoomUrl) {
    await upsertPartnerZoomProfile({
      partnerId: uid,
      zoomUrl: pending.zoomUrl,
      zoomMeetingId: pending.zoomMeetingId,
      zoomPass: pending.zoomPass,
    });
  }

  await deletePendingRegistrationByToken(parsed.data.token);
  return jsonOk({ ok: true });
}
