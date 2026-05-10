import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getUserById, isDeletedUser } from "@/lib/repositories/user-repository";
import { listConfirmedSessionsForCompany } from "@/lib/repositories/confirmed-sessions-admin-repository";

export const dynamic = "force-dynamic";

/**
 * クライアント管理者専用：自社（同じ companyId）のクライアントの 1on1 確定スケジュール一覧。
 * パートナーの名前は意図的に返さない（クライアント企業のスポンサー向け）。
 */
export async function GET() {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "CLIENT_ADMIN" && session.role !== "ADMIN") {
    return jsonError("権限がありません。", 403);
  }
  const me = await getUserById(session.sub);
  if (!me || isDeletedUser(me)) return jsonError("ユーザーが見つかりません。", 404);
  const companyId = (me as { companyId?: string | null }).companyId ?? null;
  if (!companyId) {
    return jsonOk({ sessions: [], companyId: null, message: "所属企業ID が未設定です。管理者にお問い合わせください。" });
  }
  const sessions = await listConfirmedSessionsForCompany(companyId);
  return jsonOk({ sessions, companyId });
}
