import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { listAdminDemoMatchesForAdmin } from "@/lib/admin-demo";

export const dynamic = "force-dynamic";

/** デモ UI 用：企業一覧とマッチ候補を返す（管理者のみ）。 */
export async function GET() {
  const session = await readSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "ADMIN_ASSISTANT")) {
    return jsonError("権限がありません。", 403);
  }
  const data = await listAdminDemoMatchesForAdmin(session.sub);
  return jsonOk(data);
}
