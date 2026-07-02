import type { Role } from "@prisma/client";
import { resolveCoachingPlanSettings } from "@/lib/company-plan";
import { getEffectiveAppSettingsForMatch } from "@/lib/effective-app-settings";
import { getMatchById } from "@/lib/repositories/match-repository";
import { getUserById } from "@/lib/repositories/user-repository";
import { isClientAdminLike, isAnyAdmin } from "@/lib/role-aliases";

export type CoachingContentKind = "icebreaker" | "questions" | "oneOnOneFormat";

export type CoachingAccess = {
  targetUserId: string;
  companyId: string;
  matchId: string;
  canView: boolean;
  canEditClient: boolean;
  canEditPartner: boolean;
};

async function coachingSettingsForMatch(matchId: string) {
  const effective = await getEffectiveAppSettingsForMatch(matchId);
  return {
    plan: effective.companyPlan,
    settings: effective.coachingPlanSettings ?? resolveCoachingPlanSettings(null),
  };
}

function canViewContent(
  content: CoachingContentKind,
  actor: { id: string; role: Role },
  opts: {
    isClient: boolean;
    isPartnerOnMatch: boolean;
    settings: ReturnType<typeof resolveCoachingPlanSettings>;
  },
): boolean {
  if (isAnyAdmin(actor.role) || actor.role === "ADMIN_ASSISTANT") return true;

  if (opts.isClient && actor.role === "CLIENT") {
    if (content === "icebreaker") return true;
    if (content === "questions") return opts.settings.publishQuestions;
    if (content === "oneOnOneFormat") return opts.settings.publishOneOnOneFormat;
    return false;
  }

  if (opts.isPartnerOnMatch && actor.role === "PARTNER") {
    if (content === "icebreaker") return opts.settings.shareIcebreakerWithPartner;
    if (content === "questions") {
      return opts.settings.shareQuestionsWithPartner && opts.settings.publishQuestions;
    }
    if (content === "oneOnOneFormat") {
      return opts.settings.shareOneOnOneFormatWithPartner && opts.settings.publishOneOnOneFormat;
    }
    return false;
  }

  if (opts.isClient && isClientAdminLike(actor.role)) {
    if (content === "icebreaker") return true;
    if (content === "questions") return opts.settings.publishQuestions;
    if (content === "oneOnOneFormat") return opts.settings.publishOneOnOneFormat;
    return false;
  }

  return false;
}

function accessForActor(
  targetUserId: string,
  companyId: string,
  matchId: string,
  actor: { id: string; role: Role },
  content: CoachingContentKind,
  opts: { isClient: boolean; isPartnerOnMatch?: boolean; settings: ReturnType<typeof resolveCoachingPlanSettings> },
): CoachingAccess | null {
  const canView = canViewContent(content, actor, {
    isClient: opts.isClient,
    isPartnerOnMatch: opts.isPartnerOnMatch === true,
    settings: opts.settings,
  });
  if (!canView) return null;

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
      canEditPartner: content === "oneOnOneFormat",
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
  content: CoachingContentKind,
): Promise<{ error: "not_found" | "forbidden" | "plan_disabled" } | CoachingAccess> {
  const match = await getMatchById(matchId);
  if (!match) return { error: "not_found" };

  const { plan, settings } = await coachingSettingsForMatch(matchId);
  if (plan !== "coaching_management_training") return { error: "plan_disabled" };

  const client = await getUserById(match.clientId);
  if (!client) return { error: "not_found" };
  const companyId = ((client as { companyId?: string | null }).companyId ?? "").trim();
  if (!companyId) return { error: "forbidden" };

  const base = accessForActor(match.clientId, companyId, matchId, actor, content, {
    isClient: true,
    isPartnerOnMatch: actor.role === "PARTNER" && match.partnerId === actor.id,
    settings,
  });
  if (base) return base;

  if (isClientAdminLike(actor.role)) {
    const actorUser = await getUserById(actor.id);
    const actorCompanyId = ((actorUser as { companyId?: string | null } | null)?.companyId ?? "").trim();
    if (actorCompanyId && actorCompanyId === companyId) {
      if (
        !canViewContent(content, actor, {
          isClient: true,
          isPartnerOnMatch: false,
          settings,
        })
      ) {
        return { error: "forbidden" };
      }
      return {
        targetUserId: match.clientId,
        companyId,
        matchId,
        canView: true,
        canEditClient: false,
        canEditPartner: false,
      };
    }
  }

  return { error: "forbidden" };
}

/** ロールプレイ等、コンテンツ種別に依存しないマッチ参加者向けアクセス */
export async function resolveCoachingMatchParticipantAccess(
  matchId: string,
  actor: { id: string; role: Role },
): Promise<{ error: "not_found" | "forbidden" | "plan_disabled" } | CoachingAccess> {
  const match = await getMatchById(matchId);
  if (!match) return { error: "not_found" };

  const { plan } = await coachingSettingsForMatch(matchId);
  if (plan !== "coaching_management_training") return { error: "plan_disabled" };

  const client = await getUserById(match.clientId);
  if (!client) return { error: "not_found" };
  const companyId = ((client as { companyId?: string | null }).companyId ?? "").trim();
  if (!companyId) return { error: "forbidden" };

  if (isAnyAdmin(actor.role)) {
    return {
      targetUserId: match.clientId,
      companyId,
      matchId,
      canView: true,
      canEditClient: actor.role === "ADMIN",
      canEditPartner: actor.role === "ADMIN",
    };
  }
  if (actor.role === "ADMIN_ASSISTANT") {
    return {
      targetUserId: match.clientId,
      companyId,
      matchId,
      canView: true,
      canEditClient: false,
      canEditPartner: false,
    };
  }
  if (actor.role === "PARTNER" && match.partnerId === actor.id) {
    return {
      targetUserId: match.clientId,
      companyId,
      matchId,
      canView: true,
      canEditClient: false,
      canEditPartner: true,
    };
  }
  if (actor.id === match.clientId) {
    return {
      targetUserId: match.clientId,
      companyId,
      matchId,
      canView: true,
      canEditClient: true,
      canEditPartner: false,
    };
  }
  if (isClientAdminLike(actor.role)) {
    const actorUser = await getUserById(actor.id);
    const actorCompanyId = ((actorUser as { companyId?: string | null } | null)?.companyId ?? "").trim();
    if (actorCompanyId && actorCompanyId === companyId) {
      return {
        targetUserId: match.clientId,
        companyId,
        matchId,
        canView: true,
        canEditClient: false,
        canEditPartner: false,
      };
    }
  }

  return { error: "forbidden" };
}
