import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getUserById, isDeletedUser } from "@/lib/repositories/user-repository";
import { listConfirmedSessionsForCompany } from "@/lib/repositories/confirmed-sessions-admin-repository";

export const dynamic = "force-dynamic";

/**
 * クライアント管理者専用：自社（同じ companyId）のクライアントの 1on1 確定スケジュール一覧。
 * パートナーの名前は意図的に返さない（クライアント企業のスポンサー向け）。
 *
 * 権限判定は「DB 上の role」を正として行う。JWT (session) の role はサーバー再起動を跨いで
 * 古い値が残ることがあるため。管理者によりロールが書き換わった直後でも、再ログインを要求せず
 * このページを開けるようにする。
 *
 * 「自社（同じ companyId）のクライアント」のみ閲覧可。companyId が一致しないユーザーの予定は
 * `listConfirmedSessionsForCompany` 側で必ず除外される。
 */
export async function GET() {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);

  const me = await getUserById(session.sub);
  if (!me || isDeletedUser(me)) return jsonError("ユーザーが見つかりません。", 404);

  // 「DB 上の role」を権威ある情報源として使う。
  // CLIENT_ADMIN / ADMIN / ADMIN_ASSISTANT のいずれでもないなら拒否。
  if (me.role !== "CLIENT_ADMIN" && me.role !== "ADMIN" && me.role !== "ADMIN_ASSISTANT") {
    return jsonError("権限がありません。", 403);
  }

  const companyId = (me as { companyId?: string | null }).companyId ?? null;
  // CLIENT_ADMIN は所属企業必須。ADMIN / ADMIN_ASSISTANT は所属企業の概念がないため、
  // 全企業のセッションを admin 用 API 経由で見られる想定 → ここでは空配列を返す。
  if (me.role === "CLIENT_ADMIN") {
    if (!companyId) {
      return jsonOk({
        sessions: [],
        companyId: null,
        message:
          "あなたのアカウントには所属企業 ID が設定されていません。管理者に「クライアント管理者として、所属企業」を割り当ててもらってください。",
      });
    }
    const sessions = await listConfirmedSessionsForCompany(companyId);
    return jsonOk({ sessions, companyId });
  }

  // ADMIN / ADMIN_ASSISTANT がこのページを開いた場合は、companyId の有無で挙動を変える：
  // - 自分の companyId が設定されていれば、その企業の一覧（=表示テスト用）
  // - 未設定なら案内のみ
  if (!companyId) {
    return jsonOk({
      sessions: [],
      companyId: null,
      message:
        "あなたのアカウントには所属企業 ID が設定されていません。管理者向けの 1on1 日程一覧は『1on1日程一覧（管理者）』からご利用ください。",
    });
  }
  const sessions = await listConfirmedSessionsForCompany(companyId);
  return jsonOk({ sessions, companyId });
}
