import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { listAdminNotifications } from "@/lib/repositories/admin-notification-repository";

export async function GET() {
  const session = await readSession();
  if (!session || session.role !== "ADMIN") return jsonError("権限がありません。", 403);
  const notifications = await listAdminNotifications({ limit: 100 });
  const unreadCount = notifications.filter((n) => !n.readAt).length;
  return jsonOk({ notifications, unreadCount });
}
