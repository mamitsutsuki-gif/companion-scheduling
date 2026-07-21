import type { Role } from "@prisma/client";
import { resolveCompanyPlan } from "@/lib/company-plan";
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
 * コーチングマネジメント研修の未割当ルームを確保する。
 *
 * 隔離ルール（他プランへ漏らさない）:
 * - 企業に研修プログラムが無い → 何もしない
 * - 参加プログラムが明示されている → その中の研修のみ
 * - 参加未設定 → 企業レジストリのプランが `coaching_management_training` のときだけ作成
 *   （個別伴走・職場活性企業が誤って研修プログラムを持っていてもルームを作らない）
 */
export async function ensureCoachingRoomForClient(
  clientId: string,
): Promise<Array<{ matchId: string; programId: string; created: boolean }>> {
  const user = await getUserById(clientId);
  if (!user || !isClientRole(user.role)) return [];

  const companyId = String((user as { companyId?: string | null }).companyId ?? "").trim();
  if (!companyId) return [];

  const programs = await listProgramsForCompany(companyId);
  let coachingPrograms = programs.filter((p) => p.plan === "coaching_management_training");
  if (coachingPrograms.length === 0) return [];

  const enrolled = enrolledProgramIds(user as { enrolledProgramIds?: string[] });
  if (enrolled.length > 0) {
    coachingPrograms = coachingPrograms.filter((p) => enrolled.includes(p.id));
  } else {
    const settings = await getAppSettingsRow();
    const registryPlan = resolveCompanyPlan(companyId, settings.companies);
    if (registryPlan !== "coaching_management_training") {
      // 他プラン企業に残った未割当研修ルームを掃除（割当済みは触らない）
      await deleteOrphanPendingCoachingMatchesForClient(clientId, new Set()).catch(() => 0);
      return [];
    }
  }
  if (coachingPrograms.length === 0) {
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
