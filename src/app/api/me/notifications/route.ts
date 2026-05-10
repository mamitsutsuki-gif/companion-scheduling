import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import {
  countUnreadMemberNotifications,
  listMemberNotifications,
} from "@/lib/repositories/member-notification-repository";

export async function GET() {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);

  const [items, unreadCount] = await Promise.all([
    listMemberNotifications(session.sub, { limit: 100 }),
    countUnreadMemberNotifications(session.sub),
  ]);

  return jsonOk({ notifications: items, unreadCount });
}
