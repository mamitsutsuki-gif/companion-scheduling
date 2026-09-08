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
    if (existing.exists && (existing.data() as { sent?: boolean })?.sent === true) {
      // 同一スロットで再確定はない想定。別スロットは別 id。
      return;
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
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      { merge: true },
    );
    return;
  }

  const delegate = (
    prisma as unknown as {
      sessionReminderEmailJob?: { upsert?: Function };
    }
  ).sessionReminderEmailJob;
  if (!delegate?.upsert) return;
  try {
    await delegate.upsert({
      where: { id },
      create: {
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
      update: {
        slotStartAt: input.slotStartAt,
        remindAt: input.remindAt,
        partnerId: input.partnerId,
        clientId: input.clientId,
        sentAt: null,
        cancelledAt: null,
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
