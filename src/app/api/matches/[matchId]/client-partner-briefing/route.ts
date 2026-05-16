import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getPartnerVisibleClientBriefingForMatch } from "@/lib/repositories/client-partner-briefing-repository";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ matchId: string }> };

/**
 * 当該マッチのパートナー本人のみ参照可。拒否時は常に同じ 404 で中身を返さない。
 */
export async function GET(_request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);

  if (session.role !== "PARTNER") {
    return jsonError("見つかりません。", 404);
  }

  const { matchId } = await context.params;
  const res = await getPartnerVisibleClientBriefingForMatch({
    matchId,
    partnerUserId: session.sub,
  });

  if (!res.ok) {
    return jsonError("見つかりません。", 404);
  }

  return jsonOk({
    companyName: res.companyName,
    clientDisplayName: res.clientDisplayName,
    age: res.age,
    jobTitle: res.jobTitle,
  });
}
