import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { resolvePlanFeatures } from "@/lib/company-plan";
import { getEffectiveAppSettingsForMatch } from "@/lib/effective-app-settings";
import { getMatchClientBriefingForViewer } from "@/lib/repositories/client-partner-briefing-repository";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ matchId: string }> };

/**
 * 当該マッチのパートナー本人、または運用 ADMIN のみ参照可。
 * プランで clientInfo が無効な場合も拒否する。
 * クライアント系ロール（CLIENT / CLIENT_ADMIN / CLIENT_HR）は常に 404（中身を返さない）。
 */
export async function GET(_request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);

  if (session.role !== "PARTNER" && session.role !== "ADMIN") {
    return jsonError("見つかりません。", 404);
  }

  const { matchId } = await context.params;

  const effective = await getEffectiveAppSettingsForMatch(matchId);
  const features = resolvePlanFeatures(
    effective.companyPlan,
    effective.planFeatureOverrides,
    effective.coachingPlanSettings,
  );
  if (!features.clientInfo) {
    return jsonError("見つかりません。", 404);
  }

  const res = await getMatchClientBriefingForViewer({
    matchId,
    viewerUserId: session.sub,
    viewerRole: session.role === "ADMIN" ? "ADMIN" : "PARTNER",
  });

  if (!res.ok) {
    return jsonError("見つかりません。", 404);
  }

  return jsonOk({
    companyName: res.companyName,
    clientDisplayName: res.clientDisplayName,
    age: res.age,
    jobTitle: res.jobTitle,
    isManagement: res.isManagement,
  });
}
