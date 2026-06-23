import type { Role } from "@prisma/client";
import { resolveCompanyPlan } from "@/lib/company-plan";
import { getEffectiveAppSettings } from "@/lib/repositories/app-settings-repository";
import { getUserById } from "@/lib/repositories/user-repository";
import {
  assignPartnerToPendingMatch,
  createPendingCoachingMatchForClient,
  findAnyMatchForClient,
  findPendingMatchForClient,
} from "@/lib/repositories/match-repository";

export const PENDING_PARTNER_DISPLAY_NAME = "未決定";

export type MatchPartnerPendingFields = {
  partnerPending?: boolean;
  partnerId?: string | null;
};

export function isPartnerPendingMatch(match: MatchPartnerPendingFields): boolean {
  if (match.partnerPending === true) return true;
  return !String(match.partnerId ?? "").trim();
}

function isClientRole(role: string): boolean {
  return role === "CLIENT" || role === "CLIENT_ADMIN" || role === "CLIENT_HR";
}

/** コーチング研修クライアントに、パートナー未割当の研修ルームが無ければ作成する。 */
export async function ensureCoachingRoomForClient(
  clientId: string,
): Promise<{ matchId: string; created: boolean } | null> {
  const user = await getUserById(clientId);
  if (!user || !isClientRole(user.role)) return null;

  const companyId = String((user as { companyId?: string | null }).companyId ?? "").trim();
  if (!companyId) return null;

  const settings = await getAppSettingsRowForEnsure();
  const plan = resolveCompanyPlan(companyId, settings.companies);
  if (plan !== "coaching_management_training") return null;

  const existing = await findAnyMatchForClient(clientId);
  if (existing) return { matchId: existing.id, created: false };

  const created = await createPendingCoachingMatchForClient(clientId);
  if (!created.ok) return null;
  return { matchId: created.matchId, created: true };
}

async function getAppSettingsRowForEnsure() {
  const { getAppSettingsRow } = await import("@/lib/repositories/app-settings-repository");
  return getAppSettingsRow();
}

/** 管理者がパートナーを割り当てる際、未割当ルームがあればそこに紐づける。 */
export async function ensurePartnerAssignedForClient(
  clientId: string,
  partnerId: string,
): Promise<{ matchId: string; wasPending: boolean } | null> {
  const pending = await findPendingMatchForClient(clientId);
  if (!pending) return null;
  const result = await assignPartnerToPendingMatch(pending.id, partnerId);
  if (!result.ok) return null;
  return { matchId: pending.id, wasPending: true };
}
