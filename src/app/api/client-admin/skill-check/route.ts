import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getUserById, isDeletedUser, listClientsInCompany } from "@/lib/repositories/user-repository";
import { companyPlanLabel } from "@/lib/company-plan";
import { getSkillCheckProfile } from "@/lib/repositories/skill-check-repository";
import {
  ensureDefaultProgramForCompany,
  listProgramsForCompany,
} from "@/lib/repositories/program-repository";
import { isPairedIndividualCompanionSupervisor } from "@/lib/skill-check-access";

export const dynamic = "force-dynamic";

/**
 * クライアント管理者向け：自社メンバー（CLIENT）のスキルチェック対象一覧。
 * 個別伴走では「マッチした上司」に紐づく受講者のみ返す。
 */
export async function GET(request: Request) {
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
      programs: [],
      message: "所属企業が設定されていないため、一覧を表示できません。",
    });
  }

  const programId = new URL(request.url).searchParams.get("programId")?.trim() || null;
  await ensureDefaultProgramForCompany(companyId);
  const allPrograms = await listProgramsForCompany(companyId);
  const companionPrograms = allPrograms.filter((p) => p.plan === "individual_companion");

  if (companionPrograms.length === 0) {
    return jsonOk({
      clients: [],
      companyId,
      programs: [],
      message: "お使いの企業に個別伴走プログラムがないため、スキルチェックは利用できません。",
    });
  }

  if (programId && !companionPrograms.some((p) => p.id === programId)) {
    return jsonOk({
      clients: [],
      companyId,
      programs: companionPrograms.map((p) => ({
        id: p.id,
        name: p.name,
        plan: p.plan,
        planLabel: companyPlanLabel(p.plan),
      })),
      message: "指定されたプログラムは個別伴走ではありません。",
    });
  }

  const members = await listClientsInCompany(companyId);
  let clients = members.filter((u) => u.role === "CLIENT");
  if (programId) {
    clients = clients.filter((c) => {
      const enrolled = (c as { enrolledProgramIds?: string[] }).enrolledProgramIds;
      if (!enrolled || enrolled.length === 0) return true;
      return enrolled.includes(programId);
    });
  } else {
    const companionIds = new Set(companionPrograms.map((p) => p.id));
    clients = clients.filter((c) => {
      const enrolled = (c as { enrolledProgramIds?: string[] }).enrolledProgramIds;
      if (!enrolled || enrolled.length === 0) return true;
      return enrolled.some((id) => companionIds.has(id));
    });
  }

  // マッチした上司（partnerId）に紐づく受講者のみ
  const pairedFlags = await Promise.all(
    clients.map((c) => isPairedIndividualCompanionSupervisor(session.sub, c.id)),
  );
  clients = clients.filter((_, i) => pairedFlags[i]);

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

  return jsonOk({
    clients: rows,
    companyId,
    programs: companionPrograms.map((p) => ({
      id: p.id,
      name: p.name,
      plan: p.plan,
      planLabel: companyPlanLabel(p.plan),
    })),
  });
}
