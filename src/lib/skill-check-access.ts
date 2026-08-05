import type { Role } from "@prisma/client";
import { resolveActorRole } from "@/lib/actor-role";
import { resolvePlanFeatures, isIndividualCompanionPlan, type CompanyPlan } from "@/lib/company-plan";
import { getEffectiveAppSettingsForMatch } from "@/lib/effective-app-settings";
import { getEffectiveAppSettings } from "@/lib/repositories/app-settings-repository";
import { getMatchById } from "@/lib/repositories/match-repository";
import {
  findAnyIndividualCompanionProgram,
  getProgramById,
} from "@/lib/repositories/program-repository";
import { getUserById } from "@/lib/repositories/user-repository";
import { isClientAdminLike } from "@/lib/role-aliases";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { hasSupervisorLink } from "@/lib/repositories/supervisor-links-repository";

export type SkillCheckAccess = {
  targetUserId: string;
  companyId: string;
  canView: boolean;
  canEditSelf: boolean;
  canEditManager: boolean;
  canEditFocusSkills: boolean;
  /** スキル項目名の手入力編集（本人 / 同社上司 / 管理者） */
  canEditSkillDefinitions: boolean;
};

/**
 * 個別伴走で、actor が client の上司としてペアになっているか。
 * 1) supervisorLinks 紐づけ（推奨）
 * 2) レガシー: match.partnerId に CLIENT_ADMIN が入っている場合
 */
export async function isPairedIndividualCompanionSupervisor(
  supervisorId: string,
  clientId: string,
): Promise<boolean> {
  if (await hasSupervisorLink(supervisorId, clientId)) return true;

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
      // programId 欠落のレガシー: CLIENT_ADMIN が partner のマッチは個別伴走として扱う
      if (!programId) return true;
      const program = await getProgramById(programId);
      if (!program || isIndividualCompanionPlan(program.plan)) return true;
    }
    return false;
  }
  const rows = await prisma.match.findMany({
    where: { partnerId: supervisorId, clientId },
    select: { programId: true },
    take: 10,
  });
  for (const row of rows) {
    if (!row.programId) return true;
    const program = await getProgramById(row.programId);
    if (!program || isIndividualCompanionPlan(program.plan)) return true;
  }
  return false;
}

function skillCheckEnabledFromEffective(effective: {
  companyPlan: string;
  planFeatureOverrides: Parameters<typeof resolvePlanFeatures>[1];
  coachingPlanSettings: Parameters<typeof resolvePlanFeatures>[2];
}): boolean {
  if (!isIndividualCompanionPlan(effective.companyPlan)) return false;
  const features = resolvePlanFeatures(
    effective.companyPlan as CompanyPlan,
    effective.planFeatureOverrides,
    effective.coachingPlanSettings,
  );
  return features.skillCheck;
}

export async function resolveSkillCheckAccessForMatch(
  matchId: string,
  rawActor: { id: string; role: Role },
): Promise<{ error: "not_found" | "forbidden" | "plan_disabled" } | SkillCheckAccess> {
  const match = await getMatchById(matchId);
  if (!match) return { error: "not_found" };

  const actor = { id: rawActor.id, role: await resolveActorRole(rawActor) };

  const effective = await getEffectiveAppSettingsForMatch(matchId);
  if (!skillCheckEnabledFromEffective(effective)) {
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
      // 評価・重点スキルはマッチした上司のみ。スキル項目名は同社上司も編集可。
      return {
        targetUserId,
        companyId,
        canView: true,
        canEditSelf: false,
        canEditManager: paired,
        canEditFocusSkills: paired,
        canEditSkillDefinitions: true,
      };
    }
  }

  return { error: "forbidden" };
}

export async function resolveSkillCheckAccessForUser(
  targetUserId: string,
  rawActor: { id: string; role: Role },
): Promise<{ error: "not_found" | "forbidden" | "plan_disabled" } | SkillCheckAccess> {
  const actor = { id: rawActor.id, role: await resolveActorRole(rawActor) };
  const target = await getUserById(targetUserId);
  if (!target || (target as { deletedAt?: Date | null }).deletedAt) {
    return { error: "not_found" };
  }
  const companyId = ((target as { companyId?: string | null }).companyId ?? "").trim();
  if (!companyId) return { error: "forbidden" };

  // 企業レジストリの代表プランではなく、個別伴走プログラムの有無 + 機能フラグで判定
  const icProgram = await findAnyIndividualCompanionProgram(companyId);
  if (!icProgram) return { error: "plan_disabled" };
  const effective = await getEffectiveAppSettings({
    companyId,
    programId: icProgram.id,
  });
  if (!skillCheckEnabledFromEffective(effective)) return { error: "plan_disabled" };

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
      // 評価はマッチ上司のみ。スキル項目名は同社上司（CLIENT_ADMIN/HR）も編集可。
      if (!paired) {
        return {
          targetUserId,
          companyId,
          canView: true,
          canEditSelf: false,
          canEditManager: false,
          canEditFocusSkills: false,
          canEditSkillDefinitions: true,
        };
      }
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
  }

  return { error: "forbidden" };
}
