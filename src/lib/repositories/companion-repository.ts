import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { normalizePdcaStore, type PdcaEntry, type PdcaStore } from "@/lib/companion-pdca";
import { normalizeReflectionSheet, type ReflectionSheet } from "@/lib/companion-reflection";
import { normalizeLifelineChart, type LifelineChart } from "@/lib/companion-lifeline";
import { normalizeSummaryReportDoc, type SummaryReportDoc } from "@/lib/companion-summary";
import {
  normalizeDevelopmentOpportunitySheet,
  type DevelopmentOpportunitySheet,
} from "@/lib/companion-development-opportunity";
import {
  normalizeBusinessProblemSheet,
  type BusinessProblemSheet,
} from "@/lib/companion-business-problem";
import {
  normalizeActionBrakeStore,
  type ActionBrakeEntry,
  type ActionBrakeStore,
} from "@/lib/companion-action-brake";
import { nanoid } from "nanoid";

const PDCA_COL = "companionPdca";
const REFLECTION_COL = "companionReflection";
const LIFELINE_COL = "companionLifeline";
const SUMMARY_COL = "companionSummaryReports";
const DEVELOPMENT_OPPORTUNITY_COL = "companionDevelopmentOpportunity";
const BUSINESS_PROBLEM_COL = "companionBusinessProblem";
const ACTION_BRAKE_COL = "companionActionBrake";

const PRISMA_TABLE_BY_COL: Record<string, string> = {
  [PDCA_COL]: "userCompanionPdca",
  [REFLECTION_COL]: "userCompanionReflection",
  [LIFELINE_COL]: "userCompanionLifeline",
  [SUMMARY_COL]: "userCompanionSummaryReport",
  [DEVELOPMENT_OPPORTUNITY_COL]: "userCompanionDevelopmentOpportunity",
  [BUSINESS_PROBLEM_COL]: "userCompanionBusinessProblem",
  [ACTION_BRAKE_COL]: "userCompanionActionBrake",
};

async function readJsonDoc<T>(
  collection: string,
  userId: string,
  fallback: () => T,
  normalize: (data: unknown) => T,
): Promise<T> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return fallback();
    const snap = await db.collection(collection).doc(userId).get();
    if (!snap.exists) return fallback();
    return normalize(snap.data() ?? {});
  }
  const table = PRISMA_TABLE_BY_COL[collection];
  if (!table) return fallback();
  const row = await (prisma as any)[table]?.findUnique?.({ where: { userId } }).catch(() => null);
  if (!row) return fallback();
  return normalize(row.data);
}

async function writeJsonDoc(collection: string, userId: string, companyId: string, data: unknown) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return;
    await db.collection(collection).doc(userId).set({ ...((data as object) ?? {}), userId, companyId }, { merge: true });
    return;
  }
  const table = PRISMA_TABLE_BY_COL[collection];
  if (!table) return;
  const delegate = (prisma as any)[table];
  if (!delegate?.upsert) return;
  await delegate.upsert({
    where: { userId },
    create: { userId, companyId, data },
    update: { companyId, data },
  });
}

export async function getPdcaStore(userId: string, companyId: string): Promise<PdcaStore> {
  return readJsonDoc(
    PDCA_COL,
    userId,
    () => normalizePdcaStore(userId, companyId, {}),
    (d) => normalizePdcaStore(userId, companyId, d),
  );
}

export async function upsertPdcaEntry(
  userId: string,
  companyId: string,
  entry: PdcaEntry,
): Promise<PdcaStore> {
  const store = await getPdcaStore(userId, companyId);
  const idx = store.entries.findIndex((e) => e.id === entry.id);
  const nextEntries = store.entries.slice();
  const row = { ...entry, updatedAt: new Date().toISOString() };
  if (idx >= 0) nextEntries[idx] = row;
  else nextEntries.unshift(row);
  const next = normalizePdcaStore(userId, companyId, {
    ...store,
    entries: nextEntries,
    updatedAt: new Date().toISOString(),
  });
  await writeJsonDoc(PDCA_COL, userId, companyId, next);
  return next;
}

export async function deletePdcaEntry(userId: string, companyId: string, entryId: string): Promise<PdcaStore> {
  const store = await getPdcaStore(userId, companyId);
  const next = normalizePdcaStore(userId, companyId, {
    ...store,
    entries: store.entries.filter((e) => e.id !== entryId),
    updatedAt: new Date().toISOString(),
  });
  await writeJsonDoc(PDCA_COL, userId, companyId, next);
  return next;
}

export function newPdcaEntryId() {
  return `pdca-${nanoid(10)}`;
}

export async function getReflectionSheet(userId: string, companyId: string): Promise<ReflectionSheet> {
  return readJsonDoc(
    REFLECTION_COL,
    userId,
    () => normalizeReflectionSheet(userId, companyId, {}),
    (d) => normalizeReflectionSheet(userId, companyId, d),
  );
}

export async function upsertReflectionSheet(
  userId: string,
  companyId: string,
  patch: Partial<ReflectionSheet>,
): Promise<ReflectionSheet> {
  const current = await getReflectionSheet(userId, companyId);
  const next = normalizeReflectionSheet(userId, companyId, {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
  await writeJsonDoc(REFLECTION_COL, userId, companyId, next);
  return next;
}

export async function getLifelineChart(userId: string, companyId: string): Promise<LifelineChart> {
  return readJsonDoc(
    LIFELINE_COL,
    userId,
    () => normalizeLifelineChart(userId, companyId, {}),
    (d) => normalizeLifelineChart(userId, companyId, d),
  );
}

export async function upsertLifelineChart(
  userId: string,
  companyId: string,
  input: {
    events: LifelineChart["events"];
    energySourcesText?: string;
    coreValuesText?: string;
  },
): Promise<LifelineChart> {
  const existing = await getLifelineChart(userId, companyId);
  const next = normalizeLifelineChart(userId, companyId, {
    events: input.events,
    energySourcesText:
      input.energySourcesText !== undefined ? input.energySourcesText : existing.energySourcesText,
    coreValuesText:
      input.coreValuesText !== undefined ? input.coreValuesText : existing.coreValuesText,
    updatedAt: new Date().toISOString(),
  });
  await writeJsonDoc(LIFELINE_COL, userId, companyId, next);
  return next;
}

export async function getSummaryReportDoc(
  userId: string,
  companyId: string,
): Promise<SummaryReportDoc> {
  return readJsonDoc(
    SUMMARY_COL,
    userId,
    () => normalizeSummaryReportDoc(userId, companyId, {}),
    (d) => normalizeSummaryReportDoc(userId, companyId, d),
  );
}

export async function upsertSummaryReportDoc(
  userId: string,
  companyId: string,
  patch: Partial<SummaryReportDoc>,
  updatedBy: string,
): Promise<SummaryReportDoc> {
  const current = await getSummaryReportDoc(userId, companyId);
  const next = normalizeSummaryReportDoc(
    userId,
    companyId,
    { ...current, ...patch, updatedBy, updatedAt: new Date().toISOString() },
    updatedBy,
  );
  await writeJsonDoc(SUMMARY_COL, userId, companyId, next);
  return next;
}

export async function getDevelopmentOpportunitySheet(
  userId: string,
  companyId: string,
): Promise<DevelopmentOpportunitySheet> {
  return readJsonDoc(
    DEVELOPMENT_OPPORTUNITY_COL,
    userId,
    () => normalizeDevelopmentOpportunitySheet(userId, companyId, {}),
    (d) => normalizeDevelopmentOpportunitySheet(userId, companyId, d),
  );
}

export async function upsertDevelopmentOpportunitySheet(
  userId: string,
  companyId: string,
  patch: Partial<DevelopmentOpportunitySheet>,
): Promise<DevelopmentOpportunitySheet> {
  const current = await getDevelopmentOpportunitySheet(userId, companyId);
  const next = normalizeDevelopmentOpportunitySheet(userId, companyId, {
    ...current,
    ...patch,
    requiredChecks: patch.requiredChecks
      ? { ...current.requiredChecks, ...patch.requiredChecks }
      : current.requiredChecks,
    recommendedChecks: patch.recommendedChecks
      ? { ...current.recommendedChecks, ...patch.recommendedChecks }
      : current.recommendedChecks,
    updatedAt: new Date().toISOString(),
  });
  await writeJsonDoc(DEVELOPMENT_OPPORTUNITY_COL, userId, companyId, next);
  return next;
}

export async function getBusinessProblemSheet(
  userId: string,
  companyId: string,
): Promise<BusinessProblemSheet> {
  return readJsonDoc(
    BUSINESS_PROBLEM_COL,
    userId,
    () => normalizeBusinessProblemSheet(userId, companyId, {}),
    (d) => normalizeBusinessProblemSheet(userId, companyId, d),
  );
}

export async function upsertBusinessProblemSheet(
  userId: string,
  companyId: string,
  patch: Partial<BusinessProblemSheet>,
): Promise<BusinessProblemSheet> {
  const current = await getBusinessProblemSheet(userId, companyId);
  const mergedSteps = { ...current.stepValues };
  if (patch.stepValues) {
    for (const [sid, fields] of Object.entries(patch.stepValues)) {
      mergedSteps[sid] = { ...(mergedSteps[sid] ?? {}), ...fields };
    }
  }
  const next = normalizeBusinessProblemSheet(userId, companyId, {
    ...current,
    ...patch,
    stepValues: mergedSteps,
    updatedAt: new Date().toISOString(),
  });
  await writeJsonDoc(BUSINESS_PROBLEM_COL, userId, companyId, next);
  return next;
}

export async function getActionBrakeStore(
  userId: string,
  companyId: string,
): Promise<ActionBrakeStore> {
  return readJsonDoc(
    ACTION_BRAKE_COL,
    userId,
    () => normalizeActionBrakeStore(userId, companyId, {}),
    (d) => normalizeActionBrakeStore(userId, companyId, d),
  );
}

export function newActionBrakeEntryId(): string {
  return `brake-${nanoid(10)}`;
}

export async function upsertActionBrakeEntry(
  userId: string,
  companyId: string,
  entry: ActionBrakeEntry,
): Promise<ActionBrakeStore> {
  const store = await getActionBrakeStore(userId, companyId);
  const now = new Date().toISOString();
  const nextEntry: ActionBrakeEntry = {
    ...entry,
    updatedAt: now,
    createdAt: entry.createdAt || now,
  };
  const idx = store.entries.findIndex((e) => e.id === nextEntry.id);
  const entries =
    idx >= 0
      ? store.entries.map((e, i) => (i === idx ? nextEntry : e))
      : [nextEntry, ...store.entries];
  const next = normalizeActionBrakeStore(userId, companyId, {
    entries,
    updatedAt: now,
  });
  await writeJsonDoc(ACTION_BRAKE_COL, userId, companyId, next);
  return next;
}

export async function deleteActionBrakeEntry(
  userId: string,
  companyId: string,
  entryId: string,
): Promise<ActionBrakeStore> {
  const store = await getActionBrakeStore(userId, companyId);
  const next = normalizeActionBrakeStore(userId, companyId, {
    entries: store.entries.filter((e) => e.id !== entryId),
    updatedAt: new Date().toISOString(),
  });
  await writeJsonDoc(ACTION_BRAKE_COL, userId, companyId, next);
  return next;
}
