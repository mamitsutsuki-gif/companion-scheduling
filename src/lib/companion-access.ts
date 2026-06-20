import type { Role } from "@prisma/client";
import { resolveCompanyPlan } from "@/lib/company-plan";
import { getEffectiveAppSettingsForMatch } from "@/lib/effective-app-settings";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";
import { getMatchById } from "@/lib/repositories/match-repository";
import { getUserById } from "@/lib/repositories/user-repository";
import { isClientAdminLike, isAnyAdmin } from "@/lib/role-aliases";

export type LifelineViewMode = "full" | "manager" | "self" | "none";

export type CompanionSheetAccess = {
  targetUserId: string;
  companyId: string;
  canView: boolean;
  canEditClient: boolean;
  canEditCoach: boolean;
  canEditAdminSummary: boolean;
  lifelineViewMode: LifelineViewMode;
};

async function planForCompany(companyId: string) {
  const settings = await getAppSettingsRow();
  return resolveCompanyPlan(companyId, settings.companies);
}

async function planForMatch(matchId: string) {
  const effective = await getEffectiveAppSettingsForMatch(matchId);
  return effective.companyPlan;
}

function accessForActor(
  targetUserId: string,
  companyId: string,
  actor: { id: string; role: Role },
  opts: { isClient: boolean; isPartnerOnMatch?: boolean },
): CompanionSheetAccess | null {
  if (actor.role === "ADMIN") {
    return {
      targetUserId,
      companyId,
      canView: true,
      canEditClient: true,
      canEditCoach: true,
      canEditAdminSummary: true,
      lifelineViewMode: "full",
    };
  }
  if (actor.role === "ADMIN_ASSISTANT") {
    return {
      targetUserId,
      companyId,
      canView: true,
      canEditClient: false,
      canEditCoach: false,
      canEditAdminSummary: false,
      lifelineViewMode: "full",
    };
  }
  if (opts.isPartnerOnMatch && actor.role === "PARTNER") {
    return {
      targetUserId,
      companyId,
      canView: true,
      canEditClient: false,
      canEditCoach: true,
      canEditAdminSummary: false,
      lifelineViewMode: "manager",
    };
  }
  if (opts.isClient && actor.id === targetUserId) {
    return {
      targetUserId,
      companyId,
      canView: true,
      canEditClient: true,
      canEditCoach: false,
      canEditAdminSummary: false,
      lifelineViewMode: "self",
    };
  }
  return null;
}

export async function resolveCompanionAccessForMatch(
  matchId: string,
  actor: { id: string; role: Role },
): Promise<{ error: "not_found" | "forbidden" | "plan_disabled" } | CompanionSheetAccess> {
  const match = await getMatchById(matchId);
  if (!match) return { error: "not_found" };
  if ((await planForMatch(matchId)) !== "individual_companion") return { error: "plan_disabled" };

  const client = await getUserById(match.clientId);
  if (!client) return { error: "not_found" };
  const companyId = ((client as { companyId?: string | null }).companyId ?? "").trim();
  if (!companyId) return { error: "forbidden" };

  const base = accessForActor(match.clientId, companyId, actor, {
    isClient: true,
    isPartnerOnMatch: actor.role === "PARTNER" && match.partnerId === actor.id,
  });
  if (base) return base;

  if (isClientAdminLike(actor.role)) {
    const actorUser = await getUserById(actor.id);
    const actorCompanyId = ((actorUser as { companyId?: string | null } | null)?.companyId ?? "").trim();
    if (actorCompanyId && actorCompanyId === companyId) {
      return {
        targetUserId: match.clientId,
        companyId,
        canView: true,
        canEditClient: false,
        canEditCoach: false,
        canEditAdminSummary: false,
        lifelineViewMode: "manager",
      };
    }
  }

  return { error: "forbidden" };
}

export async function resolveCompanionAccessForUser(
  targetUserId: string,
  actor: { id: string; role: Role },
): Promise<{ error: "not_found" | "forbidden" | "plan_disabled" } | CompanionSheetAccess> {
  const target = await getUserById(targetUserId);
  if (!target || (target as { deletedAt?: Date | null }).deletedAt) return { error: "not_found" };
  const companyId = ((target as { companyId?: string | null }).companyId ?? "").trim();
  if (!companyId) return { error: "forbidden" };
  if ((await planForCompany(companyId)) !== "individual_companion") return { error: "plan_disabled" };

  const base = accessForActor(targetUserId, companyId, actor, {
    isClient: target.role === "CLIENT",
  });
  if (base) return base;

  if (isClientAdminLike(actor.role) && target.role === "CLIENT") {
    const actorUser = await getUserById(actor.id);
    const actorCompanyId = ((actorUser as { companyId?: string | null } | null)?.companyId ?? "").trim();
    if (actorCompanyId && actorCompanyId === companyId) {
      return {
        targetUserId,
        companyId,
        canView: true,
        canEditClient: false,
        canEditCoach: false,
        canEditAdminSummary: false,
        lifelineViewMode: "manager",
      };
    }
  }

  return { error: "forbidden" };
}

export function canUseSummaryReport(access: CompanionSheetAccess, role: Role) {
  return access.canView && (isAnyAdmin(role) || role === "PARTNER" || access.canEditAdminSummary);
}
