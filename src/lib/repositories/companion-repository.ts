import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { normalizePdcaStore, type PdcaEntry, type PdcaStore } from "@/lib/companion-pdca";
import { normalizeReflectionSheet, type ReflectionSheet } from "@/lib/companion-reflection";
import { normalizeLifelineChart, type LifelineChart } from "@/lib/companion-lifeline";
import { normalizeSummaryReportDoc, type SummaryReportDoc } from "@/lib/companion-summary";
import { nanoid } from "nanoid";

const PDCA_COL = "companionPdca";
const REFLECTION_COL = "companionReflection";
const LIFELINE_COL = "companionLifeline";
const SUMMARY_COL = "companionSummaryReports";

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
  const table = collection === PDCA_COL
    ? "userCompanionPdca"
    : collection === REFLECTION_COL
      ? "userCompanionReflection"
      : collection === LIFELINE_COL
        ? "userCompanionLifeline"
        : "userCompanionSummaryReport";
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
  const table = collection === PDCA_COL
    ? "userCompanionPdca"
    : collection === REFLECTION_COL
      ? "userCompanionReflection"
      : collection === LIFELINE_COL
        ? "userCompanionLifeline"
        : "userCompanionSummaryReport";
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
  events: LifelineChart["events"],
): Promise<LifelineChart> {
  const next = normalizeLifelineChart(userId, companyId, {
    events,
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
