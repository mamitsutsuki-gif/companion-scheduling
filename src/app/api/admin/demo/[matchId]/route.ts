import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { buildAdminDemoMatchPreview } from "@/lib/admin-demo";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ matchId: string }> };

/** デモ UI 用：指定マッチのロール別プレビューデータ（管理者のみ）。 */
export async function GET(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "ADMIN_ASSISTANT")) {
    return jsonError("権限がありません。", 403);
  }
  const { matchId } = await ctx.params;
  const preview = await buildAdminDemoMatchPreview(matchId);
  if (!preview) return jsonError("マッチが見つかりません。", 404);
  return jsonOk({ preview });
}
