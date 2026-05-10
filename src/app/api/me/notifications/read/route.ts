import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import {
  markAllMemberNotificationsRead,
  markMemberNotificationRead,
} from "@/lib/repositories/member-notification-repository";

const bodySchema = z.union([
  z.object({ id: z.string().min(1) }),
  z.object({ all: z.literal(true) }),
]);

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  if ("all" in parsed.data && parsed.data.all === true) {
    await markAllMemberNotificationsRead(session.sub);
  } else if ("id" in parsed.data) {
    await markMemberNotificationRead(parsed.data.id, session.sub);
  }
  return jsonOk({ ok: true });
}
