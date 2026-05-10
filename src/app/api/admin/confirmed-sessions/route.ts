import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { listEffectiveConfirmedSessionsForAdmin } from "@/lib/repositories/confirmed-sessions-admin-repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await readSession();
  if (!session || session.role !== "ADMIN") return jsonError("権限がありません。", 403);
  const sessions = await listEffectiveConfirmedSessionsForAdmin();
  return jsonOk({ sessions });
}
