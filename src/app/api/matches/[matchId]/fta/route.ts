import { getMatchIfAllowed } from "@/lib/match-access";
import { jsonError, jsonOk } from "@/lib/json";
import { maskedFtaChartForViewer } from "@/lib/fta";
import { getFtaByUserId } from "@/lib/repositories/fta-repository";
import { getMatchById } from "@/lib/repositories/match-repository";
import { readSession } from "@/lib/session";

type RouteContext = { params: Promise<{ matchId: string }> };
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await context.params;
  const gate = await getMatchIfAllowed(matchId, { id: session.sub, role: session.role });
  if ("error" in gate) return jsonError("閲覧できません。", gate.error === "not_found" ? 404 : 403);

  const match = await getMatchById(matchId);
  if (!match) return jsonError("見つかりません。", 404);

  if (session.role === "PARTNER") {
    const chart = maskedFtaChartForViewer(await getFtaByUserId(match.clientId));
    return jsonOk({ targetRole: "CLIENT", targetName: match.client.displayName, chart });
  }
  if (session.role === "CLIENT") {
    const chart = await getFtaByUserId(match.clientId);
    return jsonOk({ targetRole: "CLIENT", targetName: match.client.displayName, chart });
  }
  return jsonOk({ targetRole: "NONE", targetName: "", chart: null });
}
