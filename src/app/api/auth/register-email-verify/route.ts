import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/json";
import { getPendingRegistrationByToken } from "@/lib/repositories/pending-registration-repository";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return jsonError("トークンが指定されていません。", 400);
  const row = await getPendingRegistrationByToken(token);
  if (!row) return jsonError("リンクが無効か、有効期限切れです。もう一度新規登録からやり直してください。", 410);
  return jsonOk({
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    expiresAt: row.expiresAt,
  });
}
