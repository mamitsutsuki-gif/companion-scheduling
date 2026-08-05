import type { Role } from "@prisma/client";
import {
  resolvePlanFeatures,
  type IndividualCompanionFeatureKey,
} from "@/lib/company-plan";
import { getEffectiveAppSettingsForMatch } from "@/lib/effective-app-settings";
import { getEffectiveAppSettings } from "@/lib/repositories/app-settings-repository";
import { getMatchById } from "@/lib/repositories/match-repository";
import { findAnyIndividualCompanionProgram } from "@/lib/repositories/program-repository";
import { isIndividualCompanionPlan } from "@/lib/company-plan";
import { getUserById } from "@/lib/repositories/user-repository";
import { isClientAdminLike, isAnyAdmin } from "@/lib/role-aliases";
import { isPairedIndividualCompanionSupervisor } from "@/lib/skill-check-access";

export type LifelineViewMode = "full" | "manager" | "self" | "none";

export type CompanionSheetAccess = {
  targetUserId: string;
  companyId: string;
  canView: boolean;
  canEditClient: boolean;
  canEditCoach: boolean;
  /** 機会創出など、上司（CLIENT_ADMIN/HR）専用の編集。PARTNER は false */
  canEditSupervisor: boolean;
  canEditAdminSummary: boolean;
  lifelineViewMode: LifelineViewMode;
};

function accessForActor(
  targetUserId: string,
  companyId: string,
  actor: { id: string; role: Role },
  opts: { isClient: boolean; isPartnerOnMatch?: boolean; isSupervisorOnMatch?: boolean },
): CompanionSheetAccess | null {
  if (actor.role === "ADMIN") {
    return {
      targetUserId,
      companyId,
      canView: true,
      canEditClient: true,
      canEditCoach: true,
      canEditSupervisor: true,
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
      canEditSupervisor: false,
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
      canEditSupervisor: false,
      canEditAdminSummary: false,
      lifelineViewMode: "manager",
    };
  }
  // 個別伴走の上司（CLIENT_ADMIN / CLIENT_HR：partnerId または紐づけ）
  if (opts.isSupervisorOnMatch && isClientAdminLike(actor.role)) {
    return {
      targetUserId,
      companyId,
      canView: true,
      canEditClient: false,
      canEditCoach: true,
      canEditSupervisor: true,
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
      canEditSupervisor: false,
      canEditAdminSummary: false,
      lifelineViewMode: "self",
    };
  }
  return null;
}

export async function resolveCompanionAccessForMatch(
  matchId: string,
  actor: { id: string; role: Role },
  opts?: { feature?: IndividualCompanionFeatureKey },
): Promise<{ error: "not_found" | "forbidden" | "plan_disabled" } | CompanionSheetAccess> {
  const match = await getMatchById(matchId);
  if (!match) return { error: "not_found" };

  const effective = await getEffectiveAppSettingsForMatch(matchId);
  if (!isIndividualCompanionPlan(effective.companyPlan)) return { error: "plan_disabled" };

  const features = resolvePlanFeatures(
    effective.companyPlan,
    effective.planFeatureOverrides,
    effective.coachingPlanSettings,
  );
  if (opts?.feature && !features[opts.feature]) return { error: "plan_disabled" };

  const client = await getUserById(match.clientId);
  if (!client) return { error: "not_found" };
  const companyId = ((client as { companyId?: string | null }).companyId ?? "").trim();
  if (!companyId) return { error: "forbidden" };

  const pairedSupervisor =
    isClientAdminLike(actor.role) &&
    (match.partnerId === actor.id ||
      (await isPairedIndividualCompanionSupervisor(actor.id, match.clientId)));
  const base = accessForActor(match.clientId, companyId, actor, {
    isClient: true,
    isPartnerOnMatch: actor.role === "PARTNER" && match.partnerId === actor.id,
    isSupervisorOnMatch: pairedSupervisor,
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
        canEditSupervisor: false,
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
  opts?: { feature?: IndividualCompanionFeatureKey },
): Promise<{ error: "not_found" | "forbidden" | "plan_disabled" } | CompanionSheetAccess> {
  const target = await getUserById(targetUserId);
  if (!target || (target as { deletedAt?: Date | null }).deletedAt) return { error: "not_found" };
  const companyId = ((target as { companyId?: string | null }).companyId ?? "").trim();
  if (!companyId) return { error: "forbidden" };

  // 企業レジストリの代表プランではなく、個別伴走プログラムの有無で判定する
  const icProgram = await findAnyIndividualCompanionProgram(companyId);
  if (!icProgram) return { error: "plan_disabled" };

  const effective = await getEffectiveAppSettings({
    companyId,
    programId: icProgram.id,
  });
  const features = resolvePlanFeatures(
    effective.companyPlan,
    effective.planFeatureOverrides,
    effective.coachingPlanSettings,
  );
  if (!isIndividualCompanionPlan(effective.companyPlan)) return { error: "plan_disabled" };
  if (opts?.feature && !features[opts.feature]) return { error: "plan_disabled" };

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
        canEditSupervisor: false,
        canEditAdminSummary: false,
        lifelineViewMode: "manager",
      };
    }
  }

  return { error: "forbidden" };
}

export function canUseSummaryReport(access: CompanionSheetAccess, role: Role) {
  return (
    access.canView &&
    (isAnyAdmin(role) || role === "PARTNER" || access.canEditAdminSummary || access.canEditCoach)
  );
}
