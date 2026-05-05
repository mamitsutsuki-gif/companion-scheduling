import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { listMatchesForRole } from "@/lib/repositories/match-repository";

export async function GET() {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);

  const rows = await listMatchesForRole({ role: session.role, userId: session.sub });

  return jsonOk({ matches: rows });
}
