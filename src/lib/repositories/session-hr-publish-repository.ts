import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export type SessionHrPublishRow = {
  matchId: string;
  sessionNumber: number;
  publishedAt: string;
  publishedBy: string;
};

const COL = "sessionHrPublishes";

function docId(matchId: string, sessionNumber: number) {
  return `${matchId}_${sessionNumber}`;
}

function normalizeRow(
  matchId: string,
  sessionNumber: number,
  raw: Record<string, unknown>,
): SessionHrPublishRow | null {
  const publishedAt =
    typeof raw.publishedAt === "string" && raw.publishedAt.trim()
      ? raw.publishedAt
      : null;
  const publishedBy =
    typeof raw.publishedBy === "string" && raw.publishedBy.trim()
      ? raw.publishedBy
      : null;
  if (!publishedAt || !publishedBy) return null;
  return {
    matchId,
    sessionNumber: Math.max(1, sessionNumber),
    publishedAt,
    publishedBy,
  };
}

export async function getSessionHrPublish(
  matchId: string,
  sessionNumber: number,
): Promise<SessionHrPublishRow | null> {
  const sn = Math.max(1, sessionNumber);
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const snap = await db.collection(COL).doc(docId(matchId, sn)).get();
    if (!snap.exists) return null;
    return normalizeRow(matchId, sn, (snap.data() ?? {}) as Record<string, unknown>);
  }
  const delegate = (
    prisma as unknown as { sessionHrPublish?: { findUnique?: Function } }
  ).sessionHrPublish;
  if (!delegate?.findUnique) return null;
  try {
    const row = (await delegate.findUnique({
      where: { matchId_sessionNumber: { matchId, sessionNumber: sn } },
    })) as Record<string, unknown> | null;
    if (!row) return null;
    return normalizeRow(matchId, sn, {
      publishedAt:
        row.publishedAt instanceof Date
          ? row.publishedAt.toISOString()
          : row.publishedAt,
      publishedBy: row.publishedBy,
    });
  } catch {
    return null;
  }
}

export async function upsertSessionHrPublish(input: {
  matchId: string;
  sessionNumber: number;
  publishedBy: string;
}): Promise<SessionHrPublishRow> {
  const sn = Math.max(1, input.sessionNumber);
  const now = new Date().toISOString();
  const data: SessionHrPublishRow = {
    matchId: input.matchId,
    sessionNumber: sn,
    publishedAt: now,
    publishedBy: input.publishedBy,
  };
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) throw new Error("Firestore is not configured");
    await db.collection(COL).doc(docId(input.matchId, sn)).set(data, { merge: true });
    return data;
  }
  const delegate = (
    prisma as unknown as { sessionHrPublish?: { upsert?: Function } }
  ).sessionHrPublish;
  if (!delegate?.upsert) return data;
  try {
    await delegate.upsert({
      where: { matchId_sessionNumber: { matchId: input.matchId, sessionNumber: sn } },
      create: {
        matchId: input.matchId,
        sessionNumber: sn,
        publishedBy: input.publishedBy,
        publishedAt: new Date(now),
      },
      update: {
        publishedBy: input.publishedBy,
        publishedAt: new Date(now),
      },
    });
  } catch {
    /* local schema may not exist */
  }
  return data;
}

export async function deleteSessionHrPublish(
  matchId: string,
  sessionNumber: number,
): Promise<void> {
  const sn = Math.max(1, sessionNumber);
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return;
    await db
      .collection(COL)
      .doc(docId(matchId, sn))
      .delete()
      .catch(() => null);
    return;
  }
  const delegate = (
    prisma as unknown as { sessionHrPublish?: { delete?: Function } }
  ).sessionHrPublish;
  if (!delegate?.delete) return;
  try {
    await delegate.delete({
      where: { matchId_sessionNumber: { matchId, sessionNumber: sn } },
    });
  } catch {
    /* ignore missing */
  }
}

/** 公開済みキー一覧（`${matchId}#${sessionNumber}`） */
export async function listSessionHrPublishKeys(): Promise<Set<string>> {
  const out = new Set<string>();
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return out;
    const snap = await db.collection(COL).get();
    for (const d of snap.docs) {
      const raw = d.data() as Record<string, unknown>;
      const matchId = String(raw.matchId ?? "");
      const sn = Math.max(1, Number(raw.sessionNumber ?? 0));
      if (!matchId || sn <= 0) continue;
      if (!normalizeRow(matchId, sn, raw)) continue;
      out.add(`${matchId}#${sn}`);
    }
    return out;
  }
  const delegate = (
    prisma as unknown as { sessionHrPublish?: { findMany?: Function } }
  ).sessionHrPublish;
  if (!delegate?.findMany) return out;
  try {
    const rows = (await delegate.findMany({})) as Array<Record<string, unknown>>;
    for (const row of rows) {
      const matchId = String(row.matchId ?? "");
      const sn = Math.max(1, Number(row.sessionNumber ?? 0));
      if (!matchId || sn <= 0) continue;
      out.add(`${matchId}#${sn}`);
    }
  } catch {
    /* ignore */
  }
  return out;
}
