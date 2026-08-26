/**
 * ロールのエイリアス（同等扱い）判定ヘルパー。
 *
 * - CLIENT_ADMIN（直属上司）と CLIENT_HR（人事）は、企業内の管理者系ロールとして
 *   まとめて扱うことが多いが、伴走シートの閲覧範囲は異なる:
 *   - CLIENT_ADMIN: 紐づけ（またはレガシー上司マッチ）した部下のみ
 *   - CLIENT_HR: 同企業の CLIENT 全員を閲覧可（編集は紐づけ上司相当のときのみ）
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
