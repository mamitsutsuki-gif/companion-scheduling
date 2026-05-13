import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { listStaleUsers } from "@/lib/repositories/user-repository";

/**
 * 管理者向け「最終アクセスが古い／まだ一度もログインしていないユーザー」一覧。
 *
 * - `requireUser()` で毎ページ `lastSeenAt` が（1 時間スロットルで）書き込まれる前提
 * - クエリ `?days=21` で閾値を可変（既定: 14 日）
 * - 管理者・管理者アシスタント のみ閲覧可
 */
export async function GET(request: Request) {
  const session = await readSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "ADMIN_ASSISTANT")) {
    return jsonError("権限がありません。", 403);
  }
  const url = new URL(request.url);
  const daysParam = Number(url.searchParams.get("days") ?? "14");
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(365, Math.floor(daysParam)) : 14;
  const rows = await listStaleUsers(days);
  return jsonOk({ thresholdDays: days, users: rows });
}
