import { z } from "zod";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { hashOpaqueToken } from "@/lib/token-hash";
import { sendMail } from "@/lib/mail";
import { jsonError, jsonOk } from "@/lib/json";
import { addHours } from "date-fns";
import {
  getFirebaseFirestoreClient,
  isFirebaseAdminConfigured,
  isFirebaseDataBackend,
} from "@/lib/firebase-admin";
import { getAuth } from "firebase-admin/auth";

const bodySchema = z.object({
  email: z.string().email(),
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
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");
  const emailNorm = parsed.data.email.trim().toLowerCase();

  // Firebase バックエンドではパスワードは Firebase Auth が保持しているので、
  // Admin SDK で OOB リンクを発行し、それを Resend 経由で送信する。
  // 失敗時もメール列挙を避けるため、常に { ok: true } を返す（ログだけ残す）。
  if (isFirebaseDataBackend()) {
    if (!isFirebaseAdminConfigured()) {
      console.warn("[forgot-password] Firebase Admin is not configured");
      return jsonOk({ ok: true });
    }

    let displayName = "";
    try {
      const db = getFirebaseFirestoreClient();
      if (db) {
        const snap = await db
          .collection("users")
          .where("email", "==", emailNorm)
          .limit(1)
          .get();
        if (!snap.empty) {
          const raw = snap.docs[0]!.data() as Record<string, unknown>;
          if (typeof raw.displayName === "string") displayName = raw.displayName;
        }
      }
    } catch (e) {
      console.warn("[forgot-password] failed to resolve display name", e);
    }

    const origin = resolvedOrigin(request);
    let resetLink: string | null = null;
    try {
      resetLink = await getAuth().generatePasswordResetLink(emailNorm, {
        url: `${origin}/login`,
        handleCodeInApp: false,
      });
    } catch (e) {
      const code =
        typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string"
          ? (e as { code: string }).code
          : "";
      // user-not-found は意図的に握りつぶしてメール列挙を防ぐ
      if (code !== "auth/user-not-found" && code !== "auth/email-not-found") {
        console.warn("[forgot-password] generatePasswordResetLink failed", e);
      }
    }

    if (resetLink) {
      const greeting = displayName ? `${displayName} さん` : "こんにちは";
      const subject = "パスワード再設定リンク — モチベイジクラウド";
      const text =
        `${greeting}\n\n` +
        `次のリンクからパスワードを再設定できます（有効: 約1時間）。\n` +
        `${resetLink}\n\n` +
        `心当たりがない場合は、このメールを破棄してください。`;
      const html =
        `<p>${greeting}</p>` +
        `<p>次のリンクからパスワードを再設定できます（有効: 約1時間）。</p>` +
        `<p><a href="${resetLink}">${resetLink}</a></p>` +
        `<p><small>心当たりがない場合は、このメールを破棄してください。</small></p>`;
      await sendMail({ to: emailNorm, subject, text, html });
    }
    return jsonOk({ ok: true });
  }

  const user = await prisma.user.findUnique({
    where: { email: emailNorm },
  });

  /** Always OK to avoid email enumeration */
  if (!user) {
    return jsonOk({ ok: true });
  }

  /** Google のみ（パスワード未設定）は再設定メール不要 */
  if (!user.passwordHash) {
    return jsonOk({ ok: true });
  }

  const rawToken = nanoid(48);
  const tokenHash = hashOpaqueToken(rawToken);
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
  await prisma.passwordResetToken.create({
    data: {
      tokenHash,
      userId: user.id,
      expiresAt: addHours(new Date(), 2),
    },
  });

  const origin = resolvedOrigin(request);
  const url = `${origin}/reset-password?token=${encodeURIComponent(rawToken)}`;
  await sendMail({
    to: user.email,
    subject: "パスワード再設定リンク",
    text: `こんにちは、${user.displayName}さん\n\n次のリンクからパスワードを再設定できます（有効およそ2時間）：\n${url}\n\n心当たりがない場合はこのメールを破棄してください。`,
  });

  return jsonOk({ ok: true });
}
