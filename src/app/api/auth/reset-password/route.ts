import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashOpaqueToken } from "@/lib/token-hash";
import { hashPassword } from "@/lib/password";
import { jsonError, jsonOk } from "@/lib/json";
import { isFirebaseDataBackend } from "@/lib/firebase-admin";

const bodySchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  if (isFirebaseDataBackend()) {
    return jsonError("パスワード再設定はFirebase Auth側で実施してください。", 400);
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  const tokenHash = hashOpaqueToken(parsed.data.token);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });

  if (!record || record.expiresAt.getTime() < Date.now()) {
    return jsonError("リンクが無効か期限切れです。", 400);
  }

  const passwordHash = await hashPassword(parsed.data.password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.delete({ where: { id: record.id } }),
    prisma.passwordResetToken.deleteMany({
      where: { userId: record.userId, id: { not: record.id } },
    }),
  ]);

  return jsonOk({ ok: true });
}
