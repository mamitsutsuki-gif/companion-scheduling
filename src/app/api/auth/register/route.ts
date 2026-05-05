import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { jsonError, jsonOk } from "@/lib/json";
import { isFirebaseDataBackend } from "@/lib/firebase-admin";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(80),
  role: z.enum(["PARTNER", "CLIENT"]),
});

export async function POST(request: Request) {
  if (isFirebaseDataBackend()) {
    return jsonError("Firebaseログインで初回サインインしてください（登録はFirebase側で行います）。", 400);
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  const email = parsed.data.email.trim().toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return jsonError("このメールアドレスは既に登録されています。", 409);

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName: parsed.data.displayName,
      role: parsed.data.role,
    },
    select: { id: true, displayName: true, role: true },
  });

  return jsonOk({ ok: true, user });
}
