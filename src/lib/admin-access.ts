/**
 * 管理者系エンドポイントの権限判定。
 *
 * - ADMIN: 全権（読み・書き・設定変更）
 * - ADMIN_ASSISTANT: 「閲覧」「チャットへのコメント」だけ ADMIN と同等。
 *   マッチ管理 / アプリ設定 / 企業設定 / 請求書確定・差戻し /
 *   ユーザーのロール・所属企業・対応可能時間の書き換えなどの「設定変更」「書込み」は不可。
 *
 * すべての書込み系 API は `requireAdminWriter` を、閲覧系 API は
 * `requireAdminish` を通すこと。
 */

import type { SessionPayload } from "@/lib/session";

export type AdminRole = "ADMIN" | "ADMIN_ASSISTANT";

export function isAdminish(role: string | null | undefined): role is AdminRole {
  return role === "ADMIN" || role === "ADMIN_ASSISTANT";
}

export function isAdminWriter(role: string | null | undefined): role is "ADMIN" {
  return role === "ADMIN";
}

/** API 用：未ログイン / 権限不足を 401/403 として返すヘルパー（呼び出し側で if (err) return err) */
export type Forbidden = { status: 401 | 403; error: string };

export function requireAdminish(session: SessionPayload | null): Forbidden | null {
  if (!session) return { status: 401, error: "未ログインです。" };
  if (!isAdminish(session.role)) return { status: 403, error: "権限がありません。" };
  return null;
}

export function requireAdminWriter(session: SessionPayload | null): Forbidden | null {
  if (!session) return { status: 401, error: "未ログインです。" };
  if (!isAdminWriter(session.role)) {
    return {
      status: 403,
      error:
        session.role === "ADMIN_ASSISTANT"
          ? "管理者アシスタントは設定変更・書込み操作を行えません。管理者に依頼してください。"
          : "権限がありません。",
    };
  }
  return null;
}
