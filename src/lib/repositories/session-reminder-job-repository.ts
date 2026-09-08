import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

const COL = "sessionReminderEmailJobs";

function jobDocId(negotiationId: string, slotId: string) {
  return `${negotiationId}_${slotId}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 400);
}

export type SessionReminderEmailJob = {
  id: string;
  negotiationId: string;
  slotId: string;
  matchId: string;
  clientId: string;
  partnerId: string;
  slotStartAt: Date;
  remindAt: Date;
  sent: boolean;
  cancelled: boolean;
};

export async function enqueueSessionReminderEmailJob(input: {
  negotiationId: string;
  slotId: string;
  matchId: string;
  clientId: string;
  partnerId: string;
  slotStartAt: Date;
  remindAt: Date;
}): Promise<void> {
  const id = jobDocId(input.negotiationId, input.slotId);
  const startIso = input.slotStartAt.toISOString();
  const remindIso = input.remindAt.toISOString();
  const nowIso = new Date().toISOString();

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return;
    const ref = db.collection(COL).doc(id);
    const existing = await ref.get();
    if (existing.exists) {
      const raw = (existing.data() ?? {}) as Record<string, unknown>;
      // 送信済み・キャンセル済みは復活させない（二重送信・解除後再送の防止）
      if (raw.sent === true || raw.cancelled === true) return;
    }
    await ref.set(
      {
        negotiationId: input.negotiationId,
        slotId: input.slotId,
        matchId: input.matchId,
        clientId: input.clientId,
        partnerId: input.partnerId,
        slotStartAt: startIso,
        remindAt: remindIso,
        sent: false,
        cancelled: false,
        createdAt: existing.exists
          ? ((existing.data() as { createdAt?: string })?.createdAt ?? nowIso)
          : nowIso,
        updatedAt: nowIso,
      },
      { merge: true },
    );
    return;
  }

  const delegate = (
    prisma as unknown as {
      sessionReminderEmailJob?: { findUnique?: Function; create?: Function; update?: Function };
    }
  ).sessionReminderEmailJob;
  if (!delegate?.findUnique || !delegate?.create || !delegate?.update) return;
  try {
    const prev = (await delegate.findUnique({ where: { id } })) as Record<string, unknown> | null;
    if (prev?.sentAt || prev?.cancelledAt) return;
    if (!prev) {
      await delegate.create({
        data: {
          id,
          negotiationId: input.negotiationId,
          slotId: input.slotId,
          matchId: input.matchId,
          clientId: input.clientId,
          partnerId: input.partnerId,
          slotStartAt: input.slotStartAt,
          remindAt: input.remindAt,
          sentAt: null,
          cancelledAt: null,
        },
      });
      return;
    }
    await delegate.update({
      where: { id },
      data: {
        slotStartAt: input.slotStartAt,
        remindAt: input.remindAt,
        partnerId: input.partnerId,
        clientId: input.clientId,
      },
    });
  } catch {
    /* local schema may not exist */
  }
}

export async function cancelSessionReminderEmailJobsForNegotiation(
  negotiationId: string,
): Promise<void> {
  const nowIso = new Date().toISOString();
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return;
    const snap = await db
      .collection(COL)
      .where("negotiationId", "==", negotiationId)
      .limit(50)
      .get();
    await Promise.all(
      snap.docs.map((d) =>
        d.ref.set({ cancelled: true, updatedAt: nowIso }, { merge: true }).catch(() => null),
      ),
    );
    return;
  }

  const delegate = (
    prisma as unknown as {
      sessionReminderEmailJob?: { updateMany?: Function };
    }
  ).sessionReminderEmailJob;
  if (!delegate?.updateMany) return;
  try {
    await delegate.updateMany({
      where: { negotiationId, sentAt: null },
      data: { cancelledAt: new Date() },
    });
  } catch {
    /* ignore */
  }
}

export type PendingReminderJob = {
  id: string;
  negotiationId: string;
  slotId: string;
  matchId: string;
  clientId: string;
  partnerId: string;
  slotStartAt: Date;
  remindAt: Date;
};

/** remindAt 経過済み・未送信・未キャンセル・セッション開始前 */
export async function listPendingSessionReminderJobs(now: Date): Promise<PendingReminderJob[]> {
  const out: PendingReminderJob[] = [];

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    const snap = await db.collection(COL).where("sent", "==", false).limit(500).get();
    for (const d of snap.docs) {
      const raw = d.data() as Record<string, unknown>;
      if (raw.cancelled === true) continue;
      const start = new Date(String(raw.slotStartAt ?? ""));
      const remind = new Date(String(raw.remindAt ?? ""));
      if (Number.isNaN(start.valueOf()) || Number.isNaN(remind.valueOf())) continue;
      if (remind > now) continue;
      if (start <= now) continue;
      out.push({
        id: d.id,
        negotiationId: String(raw.negotiationId ?? ""),
        slotId: String(raw.slotId ?? ""),
        matchId: String(raw.matchId ?? ""),
        clientId: String(raw.clientId ?? ""),
        partnerId: String(raw.partnerId ?? ""),
        slotStartAt: start,
        remindAt: remind,
      });
    }
    return out;
  }

  const delegate = (
    prisma as unknown as {
      sessionReminderEmailJob?: { findMany?: Function };
    }
  ).sessionReminderEmailJob;
  if (!delegate?.findMany) return [];
  try {
    const rows = (await delegate.findMany({
      where: {
        sentAt: null,
        cancelledAt: null,
        remindAt: { lte: now },
        slotStartAt: { gt: now },
      },
      take: 500,
    })) as Array<Record<string, unknown>>;
    for (const r of rows) {
      out.push({
        id: String(r.id ?? ""),
        negotiationId: String(r.negotiationId ?? ""),
        slotId: String(r.slotId ?? ""),
        matchId: String(r.matchId ?? ""),
        clientId: String(r.clientId ?? ""),
        partnerId: String(r.partnerId ?? ""),
        slotStartAt: r.slotStartAt instanceof Date ? r.slotStartAt : new Date(String(r.slotStartAt)),
        remindAt: r.remindAt instanceof Date ? r.remindAt : new Date(String(r.remindAt)),
      });
    }
  } catch {
    /* ignore */
  }
  return out;
}

/** 送信前にジョブを原子的に確保する。取れなければ他ワーカーが処理中／済。 */
export async function tryClaimSessionReminderJob(jobId: string): Promise<boolean> {
  const nowIso = new Date().toISOString();
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return false;
    const ref = db.collection(COL).doc(jobId);
    try {
      return await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return false;
        const raw = (snap.data() ?? {}) as Record<string, unknown>;
        if (raw.sent === true || raw.cancelled === true) return false;
        tx.set(
          ref,
          {
            sent: true,
            sentAt: nowIso,
            claimedAt: nowIso,
            updatedAt: nowIso,
          },
          { merge: true },
        );
        return true;
      });
    } catch {
      return false;
    }
  }

  const delegate = (
    prisma as unknown as {
      sessionReminderEmailJob?: { updateMany?: Function };
    }
  ).sessionReminderEmailJob;
  if (!delegate?.updateMany) return false;
  try {
    const result = (await delegate.updateMany({
      where: { id: jobId, sentAt: null, cancelledAt: null },
      data: { sentAt: new Date() },
    })) as { count?: number };
    return Number(result?.count ?? 0) === 1;
  } catch {
    return false;
  }
}

export async function markSessionReminderJobSent(jobId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return;
    await db.collection(COL).doc(jobId).set({ sent: true, sentAt: nowIso, updatedAt: nowIso }, { merge: true });
    return;
  }
  const delegate = (
    prisma as unknown as {
      sessionReminderEmailJob?: { update?: Function };
    }
  ).sessionReminderEmailJob;
  if (!delegate?.update) return;
  try {
    await delegate.update({
      where: { id: jobId },
      data: { sentAt: new Date() },
    });
  } catch {
    /* ignore */
  }
}

export async function markSessionReminderJobCancelled(jobId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return;
    await db
      .collection(COL)
      .doc(jobId)
      .set({ cancelled: true, updatedAt: nowIso }, { merge: true })
      .catch(() => null);
    return;
  }
  const delegate = (
    prisma as unknown as {
      sessionReminderEmailJob?: { update?: Function };
    }
  ).sessionReminderEmailJob;
  if (!delegate?.update) return;
  try {
    await delegate.update({
      where: { id: jobId },
      data: { cancelledAt: new Date() },
    });
  } catch {
    /* ignore */
  }
}
