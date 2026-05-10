import { z } from "zod";
import { createSessionCookie } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { isFirebaseAdminConfigured, verifyFirebaseIdToken } from "@/lib/firebase-admin";
import {
  attachFirebaseUid,
  createFirebaseUser,
  findUserForFirebaseLogin,
  isDeletedUser,
  updateUserAvailability,
} from "@/lib/repositories/user-repository";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";
import { normalizeAvailabilitySelections } from "@/lib/availability";
import { upsertPartnerZoomProfile } from "@/lib/repositories/zoom-repository";

const bodySchema = z.object({
  idToken: z.string().min(1),
  role: z.enum(["PARTNER", "CLIENT"]).optional(),
  displayName: z.string().min(1).max(80).optional(),
  availabilitySlotIds: z.array(z.string().min(1).max(80)).max(64).optional(),
  /** パートナー新規登録時は必須（会議リンク設定と同期） */
  zoomUrl: z.string().url().max(500).optional(),
  zoomPass: z.string().min(1).max(120).optional(),
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
  // 注意: メール/パスワード登録直後は email_verified=false。
  // 認証メール送信フローを未実装のため、ここではメール確認を必須にしない。

  const firebaseUid = decoded.uid;
  const email = decoded.email.trim().toLowerCase();
  let user = await findUserForFirebaseLogin({ email, firebaseUid });

  if (isDeletedUser(user)) {
    return jsonError(
      "このアカウントは管理者により削除されているため、ログインできません。",
      403,
    );
  }

  // セキュリティ: 既存ユーザー（別方式で登録済み）のメールに firebaseUid を勝手に紐付けない。
  // 例: 被害者が Google SSO で example@x.com を登録 → 攻撃者が同じメールで Firebase
  // パスワード登録 → ここでメール一致だけで auto-link すると乗っ取りが成立してしまう。
  // そのため firebaseUid 不一致 + 何らかの認証情報を既に持つアカウントとの結合は拒否する。
  if (user && !user.firebaseUid) {
    if (user.googleSub) {
      return jsonError(
        "このメールアドレスは別のログイン方法（Google）で既に登録されています。元の方法でログインしてください。",
        409,
      );
    }
    // password レガシー or 移行用にメール一致のみで紐付ける場合はメール認証必須。
    if (!decoded.email_verified) {
      return jsonError(
        "アカウント連携にはメール認証が必要です。受信メールの確認リンクから認証してください。",
        409,
      );
    }
  }

  // 対応可能時間（任意）。新規作成時に保存。クライアント登録のみ意味があるが、
  // 余分なIDが渡っても normalize で無効値は落とすので安全。
  const settings = parsed.data.availabilitySlotIds ? await getAppSettingsRow() : null;
  const availabilitySlotIds = settings && parsed.data.availabilitySlotIds
    ? normalizeAvailabilitySelections(parsed.data.availabilitySlotIds, settings.availabilitySlotOptions)
    : [];

  if (!user) {
    const displayName =
      (parsed.data.displayName || decoded.name || email.split("@")[0] || "ユーザー").slice(0, 80);
    const targetRole = parsed.data.role ?? "CLIENT";
    if (targetRole === "PARTNER") {
      if (!parsed.data.zoomUrl || !parsed.data.zoomPass) {
        return jsonError("パートナー登録では Zoom の会議URLとパス（不要の場合は「なし」）の入力が必要です。", 400);
      }
    }
    user = await createFirebaseUser({ email, displayName, firebaseUid, availabilitySlotIds });
    if (parsed.data.role && user.role !== parsed.data.role) {
      const { updateUserRole } = await import("@/lib/repositories/user-repository");
      const updated = await updateUserRole(user.id, parsed.data.role);
      if (updated) user = updated;
    }
    if (user.role === "PARTNER" && parsed.data.zoomUrl) {
      await upsertPartnerZoomProfile({
        partnerId: user.id,
        zoomUrl: parsed.data.zoomUrl,
        zoomPass: parsed.data.zoomPass?.trim() === "なし" ? null : (parsed.data.zoomPass ?? null),
      });
    }
  } else if (!user.firebaseUid) {
    user = await attachFirebaseUid(user.id, firebaseUid);
  }
  if (!user) return jsonError("ユーザー連携に失敗しました。", 500);

  // 既存ユーザーで対応可能時間が指定されていれば上書き保存（再登録/再ログイン時の更新を許容）。
  if (parsed.data.availabilitySlotIds && availabilitySlotIds.length > 0) {
    const updated = await updateUserAvailability(user.id, availabilitySlotIds).catch(() => null);
    if (updated) user = updated;
  }

  await createSessionCookie({ sub: user.id, role: user.role });
  return jsonOk({
    ok: true,
    user: { id: user.id, displayName: user.displayName, role: user.role, email: user.email },
  });
}
