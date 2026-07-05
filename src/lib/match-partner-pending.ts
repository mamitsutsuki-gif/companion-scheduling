import type { Role } from "@prisma/client";
import {
  assignPartnerToPendingMatch,
  createPendingCoachingMatchForClient,
  findMatchForClientAndProgram,
  findPendingMatchForClient,
} from "@/lib/repositories/match-repository";
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

/** クライアントの参加プログラムに対し、コーチング研修の未割当ルームを確保する。 */
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
  }
  const targets = dedupeProgramsByPlan(coachingPrograms);

  const out: Array<{ matchId: string; programId: string; created: boolean }> = [];
  for (const program of targets) {
    const existing = await findMatchForClientAndProgram(clientId, program.id);
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

export async function resolveProgramIdsForClient(clientId: string): Promise<string[]> {
  const user = await getUserById(clientId);
  const companyId = String((user as { companyId?: string | null }).companyId ?? "").trim();
  if (!companyId) return [];
  const enrolled = enrolledProgramIds(user as { enrolledProgramIds?: string[] });
  if (enrolled.length > 0) return enrolled;
  const programs = await listProgramsForCompany(companyId);
  if (programs.length > 0) return dedupeProgramsByPlan(programs).map((p) => p.id);
  const fallback = await ensureDefaultProgramForCompany(companyId);
  return fallback ? [fallback.id] : [];
}
