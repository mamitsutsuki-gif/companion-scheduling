import { z } from "zod";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { hashOpaqueToken } from "@/lib/token-hash";
import { sendMail } from "@/lib/mail";
import { jsonError, jsonOk } from "@/lib/json";
import { addHours } from "date-fns";
import { isFirebaseDataBackend } from "@/lib/firebase-admin";

const bodySchema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  if (isFirebaseDataBackend()) {
    return jsonOk({ ok: true });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  const emailNorm = parsed.data.email.trim().toLowerCase();
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

  const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
  const url = `${origin}/reset-password?token=${encodeURIComponent(rawToken)}`;
  await sendMail({
    to: user.email,
    subject: "パスワード再設定リンク",
    text: `こんにちは、${user.displayName}さん\n\n次のリンクからパスワードを再設定できます（有効およそ2時間）：\n${url}\n\n心当たりがない場合はこのメールを破棄してください。`,
  });

  return jsonOk({ ok: true });
}
