import { jsonError, jsonOk } from "@/lib/json";
import { maskedFtaChartForViewer } from "@/lib/fta";
import { getFtaByUserId } from "@/lib/repositories/fta-repository";
import { hasMatchBetween } from "@/lib/repositories/match-repository";
import { getUserById } from "@/lib/repositories/user-repository";
import { readSession } from "@/lib/session";
import { getEffectiveAppSettings } from "@/lib/repositories/app-settings-repository";

type RouteContext = { params: Promise<{ userId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { userId } = await context.params;

  const target = await getUserById(userId);
  if (!target) return jsonError("ユーザーが見つかりません。", 404);

  const chart = await getFtaByUserId(userId);
  if (session.sub === userId || session.role === "ADMIN" || session.role === "ADMIN_ASSISTANT") {
    return jsonOk({ chart, owner: target.displayName });
  }

  if (
    session.role === "PARTNER" &&
    (target.role === "CLIENT" ||
      target.role === "CLIENT_ADMIN" ||
      target.role === "CLIENT_HR")
  ) {
    const ok = await hasMatchBetween(session.sub, userId);
    if (!ok) return jsonError("閲覧権限がありません。", 403);
    return jsonOk({ chart: maskedFtaChartForViewer(chart), owner: target.displayName });
  }

  if (
    (session.role === "CLIENT" ||
      session.role === "CLIENT_ADMIN" ||
      session.role === "CLIENT_HR") &&
    (target.role === "CLIENT" ||
      target.role === "CLIENT_ADMIN" ||
      target.role === "CLIENT_HR")
  ) {
    // 所属企業ID の一致を必須にする（未設定同士・別企業間は不可）。
    const viewer = await getUserById(session.sub);
    const viewerCompany =
      (viewer as { companyId?: string | null } | null)?.companyId?.trim() ?? "";
    const targetCompany =
      (target as { companyId?: string | null }).companyId?.trim() ?? "";
    if (!viewerCompany || !targetCompany || viewerCompany !== targetCompany) {
      return jsonError(
        "閲覧権限がありません（所属企業ID が一致しないか未設定です）。",
        403,
      );
    }
    // 企業設定で FTA 共有が OFF の場合は、他人の FTA は見せない。
    const effective = await getEffectiveAppSettings({ companyId: viewerCompany });
    if (effective.shareFtaWithinCompany === false) {
      return jsonError(
        "この企業では「同じ企業ID内で自分FTAを共有する」設定が OFF のため、閲覧できません。",
        403,
      );
    }
    return jsonOk({ chart: maskedFtaChartForViewer(chart), owner: target.displayName });
  }

  return jsonError("閲覧権限がありません。", 403);
}
