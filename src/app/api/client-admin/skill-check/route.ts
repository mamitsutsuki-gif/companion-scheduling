import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getUserById, isDeletedUser, listClientsInCompany } from "@/lib/repositories/user-repository";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";
import { resolveCompanyPlan } from "@/lib/company-plan";
import { getSkillCheckProfile } from "@/lib/repositories/skill-check-repository";

export const dynamic = "force-dynamic";

/**
 * クライアント管理者向け：自社メンバー（CLIENT）のスキルチェック対象一覧。
 */
export async function GET() {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);

  const me = await getUserById(session.sub);
  if (!me || isDeletedUser(me)) return jsonError("ユーザーが見つかりません。", 404);
  if (me.role !== "CLIENT_ADMIN" && me.role !== "CLIENT_HR") {
    return jsonError("権限がありません。", 403);
  }

  const companyId = ((me as { companyId?: string | null }).companyId ?? "").trim();
  if (!companyId) {
    return jsonOk({
      clients: [],
      companyId: null,
      message: "所属企業が設定されていないため、一覧を表示できません。",
    });
  }

  const settings = await getAppSettingsRow();
  const plan = resolveCompanyPlan(companyId, settings.companies);
  if (plan !== "individual_companion") {
    return jsonOk({
      clients: [],
      companyId,
      message: "お使いの企業は個別伴走プランではないため、スキルチェックは利用できません。",
    });
  }

  const members = await listClientsInCompany(companyId);
  const clients = members.filter((u) => u.role === "CLIENT");

  const rows = await Promise.all(
    clients.map(async (c) => {
      const profile = await getSkillCheckProfile(c.id);
      const baselineCount = profile
        ? Object.values(profile.baseline).filter((v) => v.managerScore !== null).length
        : 0;
      const currentCount = profile
        ? Object.values(profile.current).filter((v) => v.managerScore !== null).length
        : 0;
      return {
        id: c.id,
        displayName: c.displayName,
        managerBaselineFilled: baselineCount,
        managerCurrentFilled: currentCount,
        focusSkillCount: profile?.focusSkillIds.length ?? 0,
      };
    }),
  );

  return jsonOk({ clients: rows, companyId });
}
