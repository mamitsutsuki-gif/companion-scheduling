import type { Role } from "@prisma/client";
import { getEffectiveAppSettingsForMatch } from "@/lib/effective-app-settings";
import { getMatchById } from "@/lib/repositories/match-repository";
import { getUserById } from "@/lib/repositories/user-repository";
import { isAnyAdmin } from "@/lib/role-aliases";

export type CoachingAccess = {
  targetUserId: string;
  companyId: string;
  matchId: string;
  canView: boolean;
  canEditClient: boolean;
  canEditPartner: boolean;
};

async function planForMatch(matchId: string) {
  const effective = await getEffectiveAppSettingsForMatch(matchId);
  return effective.companyPlan;
}

function accessForActor(
  targetUserId: string,
  companyId: string,
  matchId: string,
  actor: { id: string; role: Role },
  opts: { isClient: boolean; isPartnerOnMatch?: boolean },
): CoachingAccess | null {
  if (isAnyAdmin(actor.role)) {
    return {
      targetUserId,
      companyId,
      matchId,
      canView: true,
      canEditClient: actor.role === "ADMIN",
      canEditPartner: actor.role === "ADMIN",
    };
  }
  if (actor.role === "ADMIN_ASSISTANT") {
    return {
      targetUserId,
      companyId,
      matchId,
      canView: true,
      canEditClient: false,
      canEditPartner: false,
    };
  }
  if (opts.isPartnerOnMatch && actor.role === "PARTNER") {
    return {
      targetUserId,
      companyId,
      matchId,
      canView: true,
      canEditClient: false,
      canEditPartner: true,
    };
  }
  if (opts.isClient && actor.id === targetUserId) {
    return {
      targetUserId,
      companyId,
      matchId,
      canView: true,
      canEditClient: true,
      canEditPartner: false,
    };
  }
  return null;
}

export async function resolveCoachingAccessForMatch(
  matchId: string,
  actor: { id: string; role: Role },
): Promise<{ error: "not_found" | "forbidden" | "plan_disabled" } | CoachingAccess> {
  const match = await getMatchById(matchId);
  if (!match) return { error: "not_found" };
  if ((await planForMatch(matchId)) !== "coaching_management_training") return { error: "plan_disabled" };

  const client = await getUserById(match.clientId);
  if (!client) return { error: "not_found" };
  const companyId = ((client as { companyId?: string | null }).companyId ?? "").trim();
  if (!companyId) return { error: "forbidden" };

  const base = accessForActor(match.clientId, companyId, matchId, actor, {
    isClient: true,
    isPartnerOnMatch: actor.role === "PARTNER" && match.partnerId === actor.id,
  });
  if (base) return base;

  return { error: "forbidden" };
}
