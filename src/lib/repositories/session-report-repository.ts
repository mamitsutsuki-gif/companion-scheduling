import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";

export type SessionReportExtraAnswers = Record<string, string>;

export type SessionReportRow = {
  id: string;
  matchId: string;
  sessionNumber: number;
  partnerId: string;
  reflection: string;
  extraAnswers: SessionReportExtraAnswers;
  createdAt: string;
  updatedAt: string;
};

function docId(matchId: string, sessionNumber: number) {
  return `${matchId}_${sessionNumber}`;
}

function normalizeExtraAnswers(input: unknown): SessionReportExtraAnswers {
  if (!input || typeof input !== "object") return {};
  const out: SessionReportExtraAnswers = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v === "string") out[String(k)] = v.slice(0, 4000);
  }
  return out;
}

export async function getSessionReport(
  matchId: string,
  sessionNumber: number,
): Promise<SessionReportRow | null> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const snap = await db.collection("sessionReports").doc(docId(matchId, sessionNumber)).get();
    if (!snap.exists) return null;
    const raw = snap.data() as Record<string, unknown>;
    return {
      id: snap.id,
      matchId,
      sessionNumber,
      partnerId: String(raw.partnerId ?? ""),
      reflection: String(raw.reflection ?? ""),
      extraAnswers: normalizeExtraAnswers(raw.extraAnswers),
      createdAt: String(raw.createdAt ?? new Date().toISOString()),
      updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
    };
  }
  const delegate = (
    prisma as unknown as { sessionReport?: { findUnique?: Function } }
  ).sessionReport;
  if (!delegate?.findUnique) return null;
  const row = (await delegate.findUnique({
    where: { matchId_sessionNumber: { matchId, sessionNumber } },
  })) as Record<string, unknown> | null;
  if (!row) return null;
  return {
    id: String(row.id),
    matchId: String(row.matchId),
    sessionNumber: Number(row.sessionNumber),
    partnerId: String(row.partnerId ?? ""),
    reflection: String(row.reflection ?? ""),
    extraAnswers: normalizeExtraAnswers(row.extraAnswers),
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt ?? new Date().toISOString()),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt ?? new Date().toISOString()),
  };
}

export async function listSessionReportsForMatch(
  matchId: string,
): Promise<SessionReportRow[]> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    const snap = await db
      .collection("sessionReports")
      .where("matchId", "==", matchId)
      .get();
    return snap.docs
      .map((d) => {
        const raw = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          matchId,
          sessionNumber: Number(raw.sessionNumber ?? 0),
          partnerId: String(raw.partnerId ?? ""),
          reflection: String(raw.reflection ?? ""),
          extraAnswers: normalizeExtraAnswers(raw.extraAnswers),
          createdAt: String(raw.createdAt ?? new Date().toISOString()),
          updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
        } as SessionReportRow;
      })
      .sort((a, b) => a.sessionNumber - b.sessionNumber);
  }
  const delegate = (
    prisma as unknown as { sessionReport?: { findMany?: Function } }
  ).sessionReport;
  if (!delegate?.findMany) return [];
  const rows = (await delegate.findMany({
    where: { matchId },
    orderBy: { sessionNumber: "asc" },
  })) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    matchId: String(row.matchId),
    sessionNumber: Number(row.sessionNumber),
    partnerId: String(row.partnerId ?? ""),
    reflection: String(row.reflection ?? ""),
    extraAnswers: normalizeExtraAnswers(row.extraAnswers),
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt ?? new Date().toISOString()),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt ?? new Date().toISOString()),
  }));
}

export async function upsertSessionReport(input: {
  matchId: string;
  sessionNumber: number;
  partnerId: string;
  reflection: string;
  extraAnswers: SessionReportExtraAnswers;
}): Promise<SessionReportRow> {
  const reflection = (input.reflection ?? "").slice(0, 4000);
  const extraAnswers = normalizeExtraAnswers(input.extraAnswers);
  const now = new Date().toISOString();

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) throw new Error("Firestore is not configured");
    const ref = db.collection("sessionReports").doc(docId(input.matchId, input.sessionNumber));
    const existing = await ref.get();
    const createdAt = existing.exists
      ? String((existing.data() as Record<string, unknown>).createdAt ?? now)
      : now;
    const data = {
      matchId: input.matchId,
      sessionNumber: input.sessionNumber,
      partnerId: input.partnerId,
      reflection,
      extraAnswers,
      createdAt,
      updatedAt: now,
    };
    await ref.set(data, { merge: true });
    return { id: ref.id, ...data };
  }

  const delegate = (
    prisma as unknown as { sessionReport?: { upsert?: Function } }
  ).sessionReport;
  if (!delegate?.upsert) {
    throw new Error("SessionReport model is not available in Prisma client");
  }
  const row = (await delegate.upsert({
    where: { matchId_sessionNumber: { matchId: input.matchId, sessionNumber: input.sessionNumber } },
    create: {
      matchId: input.matchId,
      sessionNumber: input.sessionNumber,
      partnerId: input.partnerId,
      reflection,
      extraAnswers,
    },
    update: { reflection, extraAnswers },
  })) as Record<string, unknown>;
  return {
    id: String(row.id),
    matchId: String(row.matchId),
    sessionNumber: Number(row.sessionNumber),
    partnerId: String(row.partnerId),
    reflection,
    extraAnswers,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt ?? now),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt ?? now),
  };
}
