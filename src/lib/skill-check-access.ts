import type { Role } from "@prisma/client";
import { getEffectiveAppSettingsForMatch } from "@/lib/effective-app-settings";
import { getMatchById } from "@/lib/repositories/match-repository";
import { getUserById } from "@/lib/repositories/user-repository";
import { isClientAdminLike } from "@/lib/role-aliases";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";
import { resolveCompanyPlan } from "@/lib/company-plan";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { getProgramById } from "@/lib/repositories/program-repository";
import { prisma } from "@/lib/prisma";

export type SkillCheckAccess = {
  targetUserId: string;
  companyId: string;
  canView: boolean;
  canEditSelf: boolean;
  canEditManager: boolean;
  canEditFocusSkills: boolean;
  /** スキル項目名の手入力編集（本人 / ペア上司 / 管理者） */
  canEditSkillDefinitions: boolean;
};

/** 個別伴走で、actor が client の上司（partnerId）としてペアになっているか */
export async function isPairedIndividualCompanionSupervisor(
  supervisorId: string,
  clientId: string,
): Promise<boolean> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return false;
    const snap = await db
      .collection("matches")
      .where("partnerId", "==", supervisorId)
      .where("clientId", "==", clientId)
      .limit(10)
      .get();
    for (const doc of snap.docs) {
      const raw = doc.data() as Record<string, unknown>;
      const programId = typeof raw.programId === "string" ? raw.programId : "";
      if (!programId) continue;
      const program = await getProgramById(programId);
      if (program?.plan === "individual_companion") return true;
    }
    return false;
  }
  const rows = await prisma.match.findMany({
    where: { partnerId: supervisorId, clientId },
    select: { programId: true },
    take: 10,
  });
  for (const row of rows) {
    if (!row.programId) continue;
    const program = await getProgramById(row.programId);
    if (program?.plan === "individual_companion") return true;
  }
  return false;
}

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
      canEditSkillDefinitions: true,
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
      canEditSkillDefinitions: false,
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
      canEditSkillDefinitions: false,
    };
  }
  // 個別伴走の上司マッチ（CLIENT_ADMIN が partnerId）
  if (actor.role === "CLIENT_ADMIN" && match.partnerId === actor.id) {
    return {
      targetUserId,
      companyId,
      canView: true,
      canEditSelf: false,
      canEditManager: true,
      canEditFocusSkills: true,
      canEditSkillDefinitions: true,
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
      canEditSkillDefinitions: true,
    };
  }

  if (isClientAdminLike(actor.role)) {
    const actorUser = await getUserById(actor.id);
    const actorCompanyId = ((actorUser as { companyId?: string | null } | null)?.companyId ?? "").trim();
    if (actorCompanyId && actorCompanyId === companyId) {
      const paired = await isPairedIndividualCompanionSupervisor(actor.id, targetUserId);
      return {
        targetUserId,
        companyId,
        canView: true,
        canEditSelf: false,
        canEditManager: true,
        canEditFocusSkills: true,
        canEditSkillDefinitions: paired,
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
      canEditSkillDefinitions: true,
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
      canEditSkillDefinitions: false,
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
      canEditSkillDefinitions: true,
    };
  }
  if (isClientAdminLike(actor.role)) {
    const actorUser = await getUserById(actor.id);
    const actorCompanyId = ((actorUser as { companyId?: string | null } | null)?.companyId ?? "").trim();
    if (actorCompanyId && actorCompanyId === companyId && target.role === "CLIENT") {
      const paired = await isPairedIndividualCompanionSupervisor(actor.id, targetUserId);
      return {
        targetUserId,
        companyId,
        canView: true,
        canEditSelf: false,
        canEditManager: true,
        canEditFocusSkills: true,
        canEditSkillDefinitions: paired,
      };
    }
  }

  return { error: "forbidden" };
}
