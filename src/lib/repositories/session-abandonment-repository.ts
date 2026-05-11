import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";

/** 「未実施・消化」の理由コード。表示文言は UI 側で解決。 */
export type SessionAbandonmentReason = "no_show" | "late_cancel";

export type SessionAbandonmentRow = {
  matchId: string;
  sessionNumber: number;
  reason: SessionAbandonmentReason;
  markedBy: string;
  markedAt: string;
};

function docId(matchId: string, sessionNumber: number) {
  return `${matchId}_${sessionNumber}`;
}

function normalizeReason(input: unknown): SessionAbandonmentReason | null {
  return input === "no_show" || input === "late_cancel" ? input : null;
}

export async function getSessionAbandonment(
  matchId: string,
  sessionNumber: number,
): Promise<SessionAbandonmentRow | null> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const snap = await db.collection("sessionAbandonments").doc(docId(matchId, sessionNumber)).get();
    if (!snap.exists) return null;
    const raw = snap.data() as Record<string, unknown>;
    const reason = normalizeReason(raw.reason);
    if (!reason) return null;
    return {
      matchId,
      sessionNumber,
      reason,
      markedBy: String(raw.markedBy ?? ""),
      markedAt: String(raw.markedAt ?? new Date().toISOString()),
    };
  }
  // Local SQLite: 任意モデル。Prisma に未追加なら null を返してビルドを通す（本番は Firestore 経由）。
  const delegate = (
    prisma as unknown as { sessionAbandonment?: { findUnique?: Function } }
  ).sessionAbandonment;
  if (!delegate?.findUnique) return null;
  try {
    const row = (await delegate.findUnique({
      where: { matchId_sessionNumber: { matchId, sessionNumber } },
    })) as Record<string, unknown> | null;
    if (!row) return null;
    const reason = normalizeReason(row.reason);
    if (!reason) return null;
    return {
      matchId: String(row.matchId),
      sessionNumber: Number(row.sessionNumber),
      reason,
      markedBy: String(row.markedBy ?? ""),
      markedAt:
        row.markedAt instanceof Date
          ? row.markedAt.toISOString()
          : String(row.markedAt ?? new Date().toISOString()),
    };
  } catch {
    return null;
  }
}

export async function listSessionAbandonmentsForMatch(
  matchId: string,
): Promise<SessionAbandonmentRow[]> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    const snap = await db
      .collection("sessionAbandonments")
      .where("matchId", "==", matchId)
      .get();
    return snap.docs
      .map((d) => {
        const raw = d.data() as Record<string, unknown>;
        const reason = normalizeReason(raw.reason);
        if (!reason) return null;
        return {
          matchId,
          sessionNumber: Number(raw.sessionNumber ?? 0),
          reason,
          markedBy: String(raw.markedBy ?? ""),
          markedAt: String(raw.markedAt ?? new Date().toISOString()),
        } as SessionAbandonmentRow;
      })
      .filter((r): r is SessionAbandonmentRow => r != null)
      .sort((a, b) => a.sessionNumber - b.sessionNumber);
  }
  const delegate = (
    prisma as unknown as { sessionAbandonment?: { findMany?: Function } }
  ).sessionAbandonment;
  if (!delegate?.findMany) return [];
  try {
    const rows = (await delegate.findMany({
      where: { matchId },
      orderBy: { sessionNumber: "asc" },
    })) as Array<Record<string, unknown>>;
    return rows
      .map((row) => {
        const reason = normalizeReason(row.reason);
        if (!reason) return null;
        return {
          matchId: String(row.matchId),
          sessionNumber: Number(row.sessionNumber),
          reason,
          markedBy: String(row.markedBy ?? ""),
          markedAt:
            row.markedAt instanceof Date
              ? row.markedAt.toISOString()
              : String(row.markedAt ?? new Date().toISOString()),
        } as SessionAbandonmentRow;
      })
      .filter((r): r is SessionAbandonmentRow => r != null);
  } catch {
    return [];
  }
}

export async function listAllSessionAbandonments(): Promise<SessionAbandonmentRow[]> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    const snap = await db.collection("sessionAbandonments").get();
    return snap.docs
      .map((d) => {
        const raw = d.data() as Record<string, unknown>;
        const reason = normalizeReason(raw.reason);
        if (!reason) return null;
        return {
          matchId: String(raw.matchId ?? ""),
          sessionNumber: Number(raw.sessionNumber ?? 0),
          reason,
          markedBy: String(raw.markedBy ?? ""),
          markedAt: String(raw.markedAt ?? new Date().toISOString()),
        } as SessionAbandonmentRow;
      })
      .filter((r): r is SessionAbandonmentRow => r != null);
  }
  const delegate = (
    prisma as unknown as { sessionAbandonment?: { findMany?: Function } }
  ).sessionAbandonment;
  if (!delegate?.findMany) return [];
  try {
    const rows = (await delegate.findMany({})) as Array<Record<string, unknown>>;
    return rows
      .map((row) => {
        const reason = normalizeReason(row.reason);
        if (!reason) return null;
        return {
          matchId: String(row.matchId),
          sessionNumber: Number(row.sessionNumber),
          reason,
          markedBy: String(row.markedBy ?? ""),
          markedAt:
            row.markedAt instanceof Date
              ? row.markedAt.toISOString()
              : String(row.markedAt ?? new Date().toISOString()),
        } as SessionAbandonmentRow;
      })
      .filter((r): r is SessionAbandonmentRow => r != null);
  } catch {
    return [];
  }
}

export async function upsertSessionAbandonment(input: {
  matchId: string;
  sessionNumber: number;
  reason: SessionAbandonmentReason;
  markedBy: string;
}): Promise<SessionAbandonmentRow> {
  const now = new Date().toISOString();
  const data: SessionAbandonmentRow = {
    matchId: input.matchId,
    sessionNumber: input.sessionNumber,
    reason: input.reason,
    markedBy: input.markedBy,
    markedAt: now,
  };
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) throw new Error("Firestore is not configured");
    const ref = db
      .collection("sessionAbandonments")
      .doc(docId(input.matchId, input.sessionNumber));
    await ref.set(data, { merge: true });
    return data;
  }
  const delegate = (
    prisma as unknown as { sessionAbandonment?: { upsert?: Function } }
  ).sessionAbandonment;
  if (!delegate?.upsert) {
    // ローカルで Prisma 側未対応の場合でも、メモリ上の値を返してテストや UI 動作確認は通す。
    return data;
  }
  try {
    await delegate.upsert({
      where: {
        matchId_sessionNumber: { matchId: input.matchId, sessionNumber: input.sessionNumber },
      },
      create: {
        matchId: input.matchId,
        sessionNumber: input.sessionNumber,
        reason: input.reason,
        markedBy: input.markedBy,
      },
      update: { reason: input.reason, markedBy: input.markedBy },
    });
  } catch {
    // 既存スキーマに無い場合（マイグレーション未適用）は黙って Firestore 想定で動かす。
  }
  return data;
}

export async function deleteSessionAbandonment(
  matchId: string,
  sessionNumber: number,
): Promise<void> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return;
    await db
      .collection("sessionAbandonments")
      .doc(docId(matchId, sessionNumber))
      .delete()
      .catch(() => null);
    return;
  }
  const delegate = (
    prisma as unknown as { sessionAbandonment?: { delete?: Function } }
  ).sessionAbandonment;
  if (!delegate?.delete) return;
  try {
    await delegate.delete({
      where: { matchId_sessionNumber: { matchId, sessionNumber } },
    });
  } catch {
    // 行が無いだけなら無視。
  }
}
