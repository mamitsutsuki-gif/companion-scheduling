import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { deleteUserAsAdmin, listAdminVisibleUsers, updateUserRole } from "@/lib/repositories/user-repository";

const querySchema = z.object({
  role: z.enum(["ADMIN", "PARTNER", "CLIENT"]).optional(),
});

export async function GET(request: Request) {
  const session = await readSession();
  if (!session || session.role !== "ADMIN") return jsonError("権限がありません。", 403);

  const params = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!params.success) return jsonError("クエリが不正です。");

  const users = await listAdminVisibleUsers(params.data.role);

  return jsonOk({ users });
}

const patchSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["ADMIN", "PARTNER", "CLIENT"]),
});

export async function PATCH(request: Request) {
  const session = await readSession();
  if (!session || session.role !== "ADMIN") return jsonError("権限がありません。", 403);

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");
  if (parsed.data.userId === session.sub && parsed.data.role !== "ADMIN") {
    return jsonError("自分の管理者権限は外せません。", 400);
  }

  const updated = await updateUserRole(parsed.data.userId, parsed.data.role).catch(() => null);
  if (!updated) return jsonError("ユーザー更新に失敗しました。", 400);

  return jsonOk({ ok: true, user: updated });
}

const deleteSchema = z.object({
  userId: z.string().min(1),
});

export async function DELETE(request: Request) {
  const session = await readSession();
  if (!session || session.role !== "ADMIN") return jsonError("権限がありません。", 403);

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");
  if (parsed.data.userId === session.sub) return jsonError("自分自身は削除できません。", 400);

  const result = await deleteUserAsAdmin(parsed.data.userId);
  if (!result.ok) return jsonError(result.error, result.status ?? 400);
  return jsonOk({ ok: true });
}
