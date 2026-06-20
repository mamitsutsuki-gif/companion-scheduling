import type { Role } from "@prisma/client";
import { getEffectiveAppSettingsForMatch } from "@/lib/effective-app-settings";
import { getMatchById } from "@/lib/repositories/match-repository";
import { getUserById } from "@/lib/repositories/user-repository";
import { isClientAdminLike } from "@/lib/role-aliases";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";
import { resolveCompanyPlan } from "@/lib/company-plan";

export type SkillCheckAccess = {
  targetUserId: string;
  companyId: string;
  canView: boolean;
  canEditSelf: boolean;
  canEditManager: boolean;
  canEditFocusSkills: boolean;
};

export async function resolveSkillCheckAccessForMatch(
  matchId: string,
  actor: { id: string; role: Role },
): Promise<{ error: "not_found" | "forbidden" | "plan_disabled" } | SkillCheckAccess> {
  const match = await getMatchById(matchId);
  if (!match) return { error: "not_found" };

  const effective = await getEffectiveAppSettingsForMatch(matchId);
  if (effective.companyPlan !== "individual_companion") {
    return { error: "plan_disabled" };
  }

  const client = await getUserById(match.clientId);
  if (!client) return { error: "not_found" };
  const companyId = ((client as { companyId?: string | null }).companyId ?? "").trim();
  if (!companyId) return { error: "forbidden" };

  const targetUserId = match.clientId;

  if (actor.role === "ADMIN") {
    return {
      targetUserId,
      companyId,
      canView: true,
      canEditSelf: true,
      canEditManager: true,
      canEditFocusSkills: true,
    };
  }
  if (actor.role === "ADMIN_ASSISTANT") {
    return {
      targetUserId,
      companyId,
      canView: true,
      canEditSelf: false,
      canEditManager: false,
      canEditFocusSkills: false,
    };
  }
  if (actor.role === "PARTNER" && match.partnerId === actor.id) {
    return {
      targetUserId,
      companyId,
      canView: true,
      canEditSelf: false,
      canEditManager: false,
      canEditFocusSkills: false,
    };
  }
  if (actor.id === match.clientId) {
    return {
      targetUserId,
      companyId,
      canView: true,
      canEditSelf: true,
      canEditManager: false,
      canEditFocusSkills: true,
    };
  }

  if (isClientAdminLike(actor.role)) {
    const actorUser = await getUserById(actor.id);
    const actorCompanyId = ((actorUser as { companyId?: string | null } | null)?.companyId ?? "").trim();
    if (actorCompanyId && actorCompanyId === companyId) {
      return {
        targetUserId,
        companyId,
        canView: true,
        canEditSelf: false,
        canEditManager: true,
        canEditFocusSkills: true,
      };
    }
  }

  return { error: "forbidden" };
}

export async function resolveSkillCheckAccessForUser(
  targetUserId: string,
  actor: { id: string; role: Role },
): Promise<{ error: "not_found" | "forbidden" | "plan_disabled" } | SkillCheckAccess> {
  const target = await getUserById(targetUserId);
  if (!target || (target as { deletedAt?: Date | null }).deletedAt) {
    return { error: "not_found" };
  }
  const companyId = ((target as { companyId?: string | null }).companyId ?? "").trim();
  if (!companyId) return { error: "forbidden" };

  const settings = await getAppSettingsRow();
  const plan = resolveCompanyPlan(companyId, settings.companies);
  if (plan !== "individual_companion") return { error: "plan_disabled" };

  if (actor.role === "ADMIN") {
    return {
      targetUserId,
      companyId,
      canView: true,
      canEditSelf: true,
      canEditManager: true,
      canEditFocusSkills: true,
    };
  }
  if (actor.role === "ADMIN_ASSISTANT") {
    return {
      targetUserId,
      companyId,
      canView: true,
      canEditSelf: false,
      canEditManager: false,
      canEditFocusSkills: false,
    };
  }
  if (actor.id === targetUserId && target.role === "CLIENT") {
    return {
      targetUserId,
      companyId,
      canView: true,
      canEditSelf: true,
      canEditManager: false,
      canEditFocusSkills: true,
    };
  }
  if (isClientAdminLike(actor.role)) {
    const actorUser = await getUserById(actor.id);
    const actorCompanyId = ((actorUser as { companyId?: string | null } | null)?.companyId ?? "").trim();
    if (actorCompanyId && actorCompanyId === companyId && target.role === "CLIENT") {
      return {
        targetUserId,
        companyId,
        canView: true,
        canEditSelf: false,
        canEditManager: true,
        canEditFocusSkills: true,
      };
    }
  }

  return { error: "forbidden" };
}
