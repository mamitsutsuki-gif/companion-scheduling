import { z } from "zod";
import { isFirebaseDataBackend } from "@/lib/firebase-admin";
import { jsonError, jsonOk } from "@/lib/json";
import { normalizeAvailabilitySelections } from "@/lib/availability";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";
import { findUserByEmail } from "@/lib/repositories/user-repository";
import { createPendingRegistration } from "@/lib/repositories/pending-registration-repository";
import { sendMail } from "@/lib/mail";
import { AUTH_MSG_EMAIL_ALREADY_REGISTERED } from "@/lib/auth-user-messages";

const bodySchema = z.object({
  email: z.string().email().max(200),
  displayName: z.string().min(1).max(80),
  role: z.enum(["PARTNER", "CLIENT"]),
  /** クライアント新規登録時の対応可能時間（登録画面で選択） */
  availabilitySlotIds: z.array(z.string().min(1).max(80)).max(64).optional(),
  /** 利用規約・プライバシーポリシーへの同意（必須） */
  acceptedLegal: z.literal(true),
});

function resolvedOrigin(request: Request) {
  const fromEnv = process.env.APP_ORIGIN?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  try {
    return new URL(request.url).origin.replace(/\/$/, "");
  } catch {
    return "http://localhost:3000";
  }
}

export async function POST(request: Request) {
  if (!isFirebaseDataBackend()) {
    return jsonError("このフローは Firebase バックエンドでのみ利用できます。", 400);
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  const email = parsed.data.email.trim().toLowerCase();
  const settings = await getAppSettingsRow();

  if (parsed.data.role === "CLIENT") {
    const rawIds = parsed.data.availabilitySlotIds ?? [];
    if (rawIds.length === 0) {
      return jsonError("対応可能時間を1つ以上選択してください。", 400);
    }
    const normalized = normalizeAvailabilitySelections(rawIds, settings.availabilitySlotOptions);
    if (normalized.length === 0) {
      return jsonError("有効な対応可能時間を選択してください。", 400);
    }
  }

  // 既に Firestore にユーザーが存在する場合は登録不可（Google 登録済み / メールパス登録済みの両方をブロック）
  const existing = await findUserByEmail(email);
  if (existing) {
    if (existing.googleSub) {
      return jsonError(
        "このメールアドレスは Google アカウントで既に登録されています。ログイン画面から Google でログインしてください。",
        409,
      );
    }
    return jsonError(AUTH_MSG_EMAIL_ALREADY_REGISTERED, 409);
  }

  const clientAvailabilitySlotIds =
    parsed.data.role === "CLIENT"
      ? normalizeAvailabilitySelections(parsed.data.availabilitySlotIds ?? [], settings.availabilitySlotOptions)
      : [];

  const { token, expiresAt } = await createPendingRegistration({
    email,
    displayName: parsed.data.displayName.trim(),
    role: parsed.data.role,
    availabilitySlotIds: clientAvailabilitySlotIds,
  });

  const origin = resolvedOrigin(request);
  const link = `${origin}/register/set-password?token=${token}`;
  const subject = "パスワード設定のご案内 — モチベイジクラウド";
  const text =
    `${parsed.data.displayName.trim()} さん\n\n` +
    `モチベイジクラウドへのご登録ありがとうございます。\n` +
    `下記のリンクからパスワードを設定すると、登録が完了します（有効期限: 24時間）。\n\n` +
    `${link}\n\n` +
    `※ 心当たりのない場合は、このメールを破棄してください。\n` +
    `※ パスワード設定後、ログイン画面からログインできます。`;
  const html =
    `<p>${escapeHtml(parsed.data.displayName.trim())} さん</p>` +
    `<p>モチベイジクラウドへのご登録ありがとうございます。<br>` +
    `下記のリンクからパスワードを設定すると、登録が完了します（有効期限: 24時間）。</p>` +
    `<p><a href="${link}">${link}</a></p>` +
    `<p><small>心当たりのない場合は、このメールを破棄してください。</small></p>`;
  const ok = await sendMail({ to: email, subject, text, html });

  return jsonOk({ ok, sentTo: email, expiresAt });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
