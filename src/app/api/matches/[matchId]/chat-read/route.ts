import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getMatchIfAllowed } from "@/lib/match-access";
import { markChatNotificationsReadForMatch } from "@/lib/repositories/member-notification-repository";

/**
 * 「このマッチのチャットを今読んだ」という signal。
 *
 * 呼ぶと、ログイン中ユーザーの「この matchId & type=CHAT & 未読」な
 * メンバー通知をすべて既読に倒す。
 *
 * 用途:
 *   - match ページのチャットタブを開いたタイミングで呼ぶ
 *   - ダッシュボードの「次のアクション」リストから未読チャット項目が消える
 *   - 通知バッジ未読カウントから差し引かれる
 *
 * セキュリティ:
 *   - 自分が当事者でない match に対しては 403 を返す
 *   - 管理者・管理者アシスタントは閲覧者として既読化しない（自分宛の通知は無い想定）
 */
type RouteContext = { params: Promise<{ matchId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await context.params;
  const gate = await getMatchIfAllowed(matchId, { id: session.sub, role: session.role });
  if ("error" in gate) {
    const status = gate.error === "not_found" ? 404 : 403;
    return jsonError(status === 404 ? "見つかりません。" : "操作できません。", status);
  }
  // 管理者は member notifications を受け取らないので無視で問題ない。
  if (session.role !== "ADMIN" && session.role !== "ADMIN_ASSISTANT") {
    await markChatNotificationsReadForMatch(session.sub, matchId);
  }
  return jsonOk({ ok: true });
}
