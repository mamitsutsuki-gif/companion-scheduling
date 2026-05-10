import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { createSessionCookie } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { isFirebaseDataBackend } from "@/lib/firebase-admin";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function POST(request: Request) {
  if (isFirebaseDataBackend()) {
    return jsonError("Firebaseログインをご利用ください（メール/パスワードは無効化されています）。", 400);
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  const email = parsed.data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
  });
  if (!user) return jsonError("メールまたはパスワードが一致しません。", 401);
  if (user.deletedAt) {
    return jsonError(
      "このアカウントは管理者により削除されているため、ログインできません。",
      403,
    );
  }

  if (!user.passwordHash) {
    return jsonError("このメールは Google でのログインのみ対応です。画面上のボタンをご利用ください。", 401);
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) return jsonError("メールまたはパスワードが一致しません。", 401);

  await createSessionCookie({ sub: user.id, role: user.role });

  return jsonOk({
    ok: true,
    user: { id: user.id, displayName: user.displayName, role: user.role },
  });
}
