import { jsonError, jsonOk } from "@/lib/json";
import { maskedFtaChartForViewer } from "@/lib/fta";
import { getFtaByUserId } from "@/lib/repositories/fta-repository";
import { listAdminVisibleUsers } from "@/lib/repositories/user-repository";
import { readSession } from "@/lib/session";

export async function GET() {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "CLIENT") return jsonError("クライアントのみ閲覧できます。", 403);

  const clients = await listAdminVisibleUsers("CLIENT");
  const others = clients.filter((u) => u.id !== session.sub);
  const out = [];
  for (const c of others) {
    const chart = await getFtaByUserId(c.id);
    out.push({
      userId: c.id,
      displayName: c.displayName,
      chart: maskedFtaChartForViewer(chart),
    });
  }
  return jsonOk({ charts: out });
}
