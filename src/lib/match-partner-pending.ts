import type { Role } from "@prisma/client";
import { resolveCompanyPlan, type CompanyPlan } from "@/lib/company-plan";
import {
  assignPartnerToPendingMatch,
  createPendingCoachingMatchForClient,
  deleteOrphanPendingCoachingMatchesForClient,
  findMatchForClientAndProgram,
  findPendingMatchForClient,
} from "@/lib/repositories/match-repository";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";
import {
  dedupeProgramsByPlan,
  ensureDefaultProgramForCompany,
  listProgramsForCompany,
} from "@/lib/repositories/program-repository";
import { getUserById } from "@/lib/repositories/user-repository";

export const PENDING_PARTNER_DISPLAY_NAME = "未決定";

export type MatchPartnerPendingFields = {
  partnerPending?: boolean;
  partnerId?: string | null;
  programId?: string | null;
};

export function isPartnerPendingMatch(match: MatchPartnerPendingFields): boolean {
  if (match.partnerPending === true) return true;
  return !String(match.partnerId ?? "").trim();
}

function isClientRole(role: Role | string): boolean {
  return role === "CLIENT" || role === "CLIENT_ADMIN" || role === "CLIENT_HR";
}

function enrolledProgramIds(user: { enrolledProgramIds?: string[] } | null): string[] {
  return Array.isArray(user?.enrolledProgramIds)
    ? user!.enrolledProgramIds.filter((id) => typeof id === "string" && id.trim())
    : [];
}

/**
 * 未割当ルームを作る研修プログラムを決める（純関数）。
 *
 * 隔離ルール（他プランへ漏らさない）:
 * - 参加プログラムが明示されている → その中の研修のみ
 * - 参加未設定 かつ 研修以外のプログラムも持つ企業 → 作らない
 *   （複数プラン企業では「メンバーの参加プログラム」で明示チェックが必要。UI の既定表示と一致させる）
 * - 参加未設定 かつ 研修だけの企業 → 企業レジストリのプランが `coaching_management_training` のときだけ作成
 */
export function selectCoachingProgramsForClient<T extends { id: string; plan: CompanyPlan }>(input: {
  programs: T[];
  enrolledProgramIds: string[];
  registryPlan: CompanyPlan;
}): T[] {
  const coaching = input.programs.filter((p) => p.plan === "coaching_management_training");
  if (coaching.length === 0) return [];

  const enrolled = input.enrolledProgramIds.filter((id) => typeof id === "string" && id.trim());
  if (enrolled.length > 0) {
    return coaching.filter((p) => enrolled.includes(p.id));
  }

  const hasOtherPlanProgram = input.programs.some(
    (p) => p.plan !== "coaching_management_training",
  );
  if (hasOtherPlanProgram) return [];
  return input.registryPlan === "coaching_management_training" ? coaching : [];
}

/** コーチングマネジメント研修の未割当ルームを確保し、対象外の未割当ルームは掃除する。 */
export async function ensureCoachingRoomForClient(
  clientId: string,
): Promise<Array<{ matchId: string; programId: string; created: boolean }>> {
  const user = await getUserById(clientId);
  if (!user || !isClientRole(user.role)) return [];

  const companyId = String((user as { companyId?: string | null }).companyId ?? "").trim();
  if (!companyId) return [];

  const programs = await listProgramsForCompany(companyId);
  if (programs.every((p) => p.plan !== "coaching_management_training")) return [];

  const settings = await getAppSettingsRow();
  const coachingPrograms = selectCoachingProgramsForClient({
    programs,
    enrolledProgramIds: enrolledProgramIds(user as { enrolledProgramIds?: string[] }),
    registryPlan: resolveCompanyPlan(companyId, settings.companies),
  });
  if (coachingPrograms.length === 0) {
    // 対象外になった未割当研修ルームを掃除（割当済みは触らない）
    await deleteOrphanPendingCoachingMatchesForClient(clientId, new Set()).catch(() => 0);
    return [];
  }

  const targets = dedupeProgramsByPlan(coachingPrograms);
  const allowed = new Set(targets.map((p) => p.id));
  await deleteOrphanPendingCoachingMatchesForClient(clientId, allowed).catch(() => 0);

  const out: Array<{ matchId: string; programId: string; created: boolean }> = [];
  for (const program of targets) {
    const existing = await findMatchForClientAndProgram(clientId, program.id, {
      allowLegacyBackfill: false,
    });
    if (existing) {
      out.push({ matchId: existing.id, programId: program.id, created: false });
      continue;
    }
    const created = await createPendingCoachingMatchForClient(clientId, program.id);
    if (created.ok) {
      out.push({ matchId: created.matchId, programId: program.id, created: true });
    }
  }
  return out;
}

/** 管理者がパートナーを割り当てる際、未割当ルームがあればそこに紐づける。 */
export async function ensurePartnerAssignedForClient(
  clientId: string,
  partnerId: string,
  programId?: string | null,
): Promise<{ matchId: string; wasPending: boolean } | null> {
  const pending = await findPendingMatchForClient(clientId, programId);
  if (!pending) return null;
  const result = await assignPartnerToPendingMatch(pending.id, partnerId);
  if (!result.ok) return null;
  return { matchId: pending.id, wasPending: true };
}

/**
 * クライアントが参加対象のプログラム ID。
 * 未設定時は企業レジストリプランのプログラムのみ（コーチングを他プラン企業に勝手に含めない）。
 */
export async function resolveProgramIdsForClient(clientId: string): Promise<string[]> {
  const user = await getUserById(clientId);
  const companyId = String((user as { companyId?: string | null }).companyId ?? "").trim();
  if (!companyId) return [];
  const enrolled = enrolledProgramIds(user as { enrolledProgramIds?: string[] });
  if (enrolled.length > 0) return enrolled;

  const programs = await listProgramsForCompany(companyId);
  if (programs.length === 0) {
    const fallback = await ensureDefaultProgramForCompany(companyId);
    return fallback ? [fallback.id] : [];
  }
  const settings = await getAppSettingsRow();
  const registryPlan = resolveCompanyPlan(companyId, settings.companies);
  const forRegistry = programs.filter((p) => p.plan === registryPlan);
  const chosen = forRegistry.length > 0 ? forRegistry : programs.filter((p) => p.plan !== "coaching_management_training");
  const list = chosen.length > 0 ? chosen : programs;
  return dedupeProgramsByPlan(list).map((p) => p.id);
}
