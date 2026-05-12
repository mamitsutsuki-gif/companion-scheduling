/**
 * ロールのエイリアス（同等扱い）判定ヘルパー。
 *
 * - CLIENT_ADMIN と CLIENT_HR は「クライアント企業内の管理者・人事担当」として
 *   現状まったく同じ権限を持つ（将来的に分岐させる前提で別ロール化されている）。
 *   このため、権限判定ではこの 2 つを「同じ括り」として扱うことが多い。
 * - ADMIN と ADMIN_ASSISTANT は閲覧範囲はほぼ同じだが、書き込み権限は ADMIN のみ。
 *   これは `lib/admin-access.ts` 側で別途扱う。
 *
 * このファイルではあくまで「クライアント側の管理者・人事系ロール」と
 * 「全クライアント系ロール（本人 + 管理者 + 人事）」のグルーピングを提供する。
 */

export type AppRole =
  | "ADMIN"
  | "ADMIN_ASSISTANT"
  | "PARTNER"
  | "CLIENT"
  | "CLIENT_ADMIN"
  | "CLIENT_HR";

/** クライアント企業の管理者系ロール（CLIENT_ADMIN または CLIENT_HR）か。 */
export function isClientAdminLike(role: string | null | undefined): boolean {
  return role === "CLIENT_ADMIN" || role === "CLIENT_HR";
}

/** クライアント側ロール全般（本人 / 管理者 / 人事）か。 */
export function isAnyClientRole(role: string | null | undefined): boolean {
  return role === "CLIENT" || role === "CLIENT_ADMIN" || role === "CLIENT_HR";
}

/** ADMIN または ADMIN_ASSISTANT か。 */
export function isAnyAdmin(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "ADMIN_ASSISTANT";
}
