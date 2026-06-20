import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import {
  mergeSkillDefinitions,
  normalizeCompanySkillDefinitions,
  normalizeSkillCheckProfile,
  type SkillCheckPhase,
  type SkillCheckProfile,
  type SkillDefinition,
  type SkillScore,
} from "@/lib/skill-check";
import {
  getCompanyAppSettingsOverride,
  type CompanyAppSettingsOverride,
} from "@/lib/repositories/app-settings-repository";

const COLLECTION = "skillCheckProfiles";

export async function getCompanySkillDefinitions(companyId: string): Promise<SkillDefinition[]> {
  const override = await getCompanyAppSettingsOverride(companyId);
  const companySkills = normalizeCompanySkillDefinitions(override?.skillCheckCompanySkills);
  return mergeSkillDefinitions(companySkills);
}

export async function getSkillCheckProfile(userId: string): Promise<SkillCheckProfile | null> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const snap = await db.collection(COLLECTION).doc(userId).get();
    if (!snap.exists) return null;
    const data = snap.data() ?? {};
    const companyId = typeof data.companyId === "string" ? data.companyId : "";
    return normalizeSkillCheckProfile(userId, companyId, data);
  }
  const row = await prisma.userSkillCheckProfile.findUnique({ where: { userId } }).catch(() => null);
  if (!row) return null;
  const payload = row.data as unknown;
  return normalizeSkillCheckProfile(userId, row.companyId, payload);
}

export async function upsertSkillCheckProfile(input: {
  userId: string;
  companyId: string;
  phase: SkillCheckPhase;
  assessments: Record<string, { selfScore?: SkillScore | null; managerScore?: SkillScore | null }>;
  focusSkillIds?: string[];
}): Promise<SkillCheckProfile> {
  const existing =
    (await getSkillCheckProfile(input.userId)) ??
    normalizeSkillCheckProfile(input.userId, input.companyId, {});

  const phaseKey = input.phase === "baseline" ? "baseline" : "current";
  const nextPhase = { ...existing[phaseKey] };
  for (const [skillId, row] of Object.entries(input.assessments)) {
    const prev = nextPhase[skillId] ?? { selfScore: null, managerScore: null };
    nextPhase[skillId] = {
      selfScore: row.selfScore !== undefined ? row.selfScore : prev.selfScore,
      managerScore: row.managerScore !== undefined ? row.managerScore : prev.managerScore,
    };
  }

  const profile = normalizeSkillCheckProfile(input.userId, input.companyId, {
    ...existing,
    companyId: input.companyId,
    [phaseKey]: nextPhase,
    focusSkillIds: input.focusSkillIds ?? existing.focusSkillIds,
    updatedAt: new Date().toISOString(),
  });

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return profile;
    await db.collection(COLLECTION).doc(input.userId).set(profile, { merge: true });
    return profile;
  }

  await prisma.userSkillCheckProfile.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      companyId: input.companyId,
      data: profile,
    },
    update: {
      companyId: input.companyId,
      data: profile,
    },
  });
  return profile;
}

export type CompanySkillCheckSettings = Pick<CompanyAppSettingsOverride, "skillCheckCompanySkills">;
