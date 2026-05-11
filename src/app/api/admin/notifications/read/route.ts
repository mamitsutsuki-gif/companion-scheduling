import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import {
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
} from "@/lib/repositories/admin-notification-repository";

const bodySchema = z.object({
  id: z.string().min(1).optional(),
  all: z.boolean().optional(),
});

export async function POST(request: Request) {
  const session = await readSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "ADMIN_ASSISTANT"))
    return jsonError("権限がありません。", 403);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  if (parsed.data.all) {
    await markAllAdminNotificationsRead();
  } else if (parsed.data.id) {
    await markAdminNotificationRead(parsed.data.id);
  } else {
    return jsonError("id か all を指定してください。");
  }
  return jsonOk({ ok: true });
}
