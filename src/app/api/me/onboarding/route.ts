import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { markUserOnboarded } from "@/lib/repositories/user-repository";

/**
 * 初回オンボーディングモーダルを閉じた時に呼ばれる。
 * `users.<self>.onboardedAt = <now>` をセットする。
 *
 * - 認証必須
 * - 2 回目以降に呼ばれてもエラーにせず冪等に上書きする
 *   （複数タブで開いていた場合などにも問題が起きないように）
 */
export async function POST() {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  await markUserOnboarded(session.sub);
  return jsonOk({ ok: true });
}
