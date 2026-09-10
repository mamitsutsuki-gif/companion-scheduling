import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";

const COL = "sessionFeedbackEmailJobs";

export type SessionFeedbackEmailJobKind = "initial" | "client_followup" | "partner_followup";

function baseJobDocId(negotiationId: string, slotId: string) {
  return `${negotiationId}_${slotId}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 360);
}

function jobDocId(
  negotiationId: string,
  slotId: string,
  kind: SessionFeedbackEmailJobKind,
  followupIndex?: 1 | 2,
) {
  const base = baseJobDocId(negotiationId, slotId);
  if (kind === "initial") return base;
  const n = followupIndex === 2 ? 2 : 1;
  if (kind === "partner_followup") return `${base}_pfu${n}`.slice(0, 400);
  return `${base}_cfu${n}`.slice(0, 400);
}

/** 追っかけ送信前に、初回ジョブが処理済みか確認する（同一 cron での同時送付を防ぐ） */
export async function isInitialFeedbackJobSettled(
  negotiationId: string,
  slotId: string,
): Promise<boolean> {
  if (!slotId) return true;
  const id = jobDocId(negotiationId, slotId, "initial");
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return true;
    const snap = await db.collection(COL).doc(id).get();
    if (!snap.exists) return true; // 旧データのみ追っかけ、など
    const raw = (snap.data() ?? {}) as Record<string, unknown>;
    return raw.sent === true || raw.cancelled === true;
  }
  try {
    const row = await prisma.sessionFeedbackEmailJob.findUnique({ where: { id } });
    if (!row) return true;
    return Boolean(row.sentAt);
  } catch {
    return true;
  }
}

function parseKind(raw: unknown): SessionFeedbackEmailJobKind {
  if (raw === "client_followup") return "client_followup";
  if (raw === "partner_followup") return "partner_followup";
  return "initial";
}

function parseFollowupIndex(raw: unknown): 1 | 2 | null {
  if (raw === 1 || raw === "1") return 1;
  if (raw === 2 || raw === "2") return 2;
  return null;
}

export async function enqueueSessionFeedbackEmailJob(input: {
  negotiationId: string;
  slotId: string;
  matchId: string;
  clientId: string;
  partnerId: string;
  slotEndAt: Date;
  /** initial 用。省略時は slotEndAt */
  initialRemindAt?: Date;
  /** クライアント／パートナー追加リマインド（翌日・3日後） */
  followupRemindAts: { day1: Date; day3: Date };
}) {
  const specs: Array<{
    kind: SessionFeedbackEmailJobKind;
    followupIndex?: 1 | 2;
    remindAt: Date;
  }> = [
    { kind: "initial", remindAt: input.initialRemindAt ?? input.slotEndAt },
    { kind: "client_followup", followupIndex: 1, remindAt: input.followupRemindAts.day1 },
    { kind: "client_followup", followupIndex: 2, remindAt: input.followupRemindAts.day3 },
    { kind: "partner_followup", followupIndex: 1, remindAt: input.followupRemindAts.day1 },
    { kind: "partner_followup", followupIndex: 2, remindAt: input.followupRemindAts.day3 },
  ];

  for (const spec of specs) {
    await upsertOneFeedbackEmailJob({
      id: jobDocId(input.negotiationId, input.slotId, spec.kind, spec.followupIndex),
      negotiationId: input.negotiationId,
      slotId: input.slotId,
      matchId: input.matchId,
      clientId: input.clientId,
      partnerId: input.partnerId,
      slotEndAt: input.slotEndAt,
      remindAt: spec.remindAt,
      kind: spec.kind,
      followupIndex: spec.followupIndex ?? null,
    });
  }
}

async function upsertOneFeedbackEmailJob(input: {
  id: string;
  negotiationId: string;
  slotId: string;
  matchId: string;
  clientId: string;
  partnerId: string;
  slotEndAt: Date;
  remindAt: Date;
  kind: SessionFeedbackEmailJobKind;
  followupIndex: 1 | 2 | null;
}) {
  const endIso = input.slotEndAt.toISOString();
  const remindIso = input.remindAt.toISOString();

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return;
    const ref = db.collection(COL).doc(input.id);
    const existing = await ref.get();
    if (existing.exists) {
      const raw = (existing.data() ?? {}) as Record<string, unknown>;
      // 送信済み・キャンセル済みは再スケジュール／復活させない
      if (raw.sent === true || raw.cancelled === true) return;
    }
    await ref.set(
      {
        negotiationId: input.negotiationId,
        slotId: input.slotId,
        matchId: input.matchId,
        clientId: input.clientId,
        partnerId: input.partnerId,
        slotEndAt: endIso,
        remindAt: remindIso,
        kind: input.kind,
        followupIndex: input.followupIndex,
        sent: false,
        cancelled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    return;
  }

  const delegate = (
    prisma as unknown as {
      sessionFeedbackEmailJob?: { findUnique?: Function; upsert?: Function; update?: Function };
    }
  ).sessionFeedbackEmailJob;
  if (!delegate?.upsert) return;
  try {
    if (delegate.findUnique) {
      const existing = (await delegate.findUnique({ where: { id: input.id } })) as
        | { sentAt?: Date | null; cancelledAt?: Date | null }
        | null;
      if (existing?.sentAt || existing?.cancelledAt) return;
    }
    await delegate.upsert({
      where: { id: input.id },
      create: {
        id: input.id,
        negotiationId: input.negotiationId,
        matchId: input.matchId,
        clientId: input.clientId,
        partnerId: input.partnerId,
        slotId: input.slotId,
        slotEndAt: input.slotEndAt,
        remindAt: input.remindAt,
        kind: input.kind,
        followupIndex: input.followupIndex,
      },
      update: {
        slotEndAt: input.slotEndAt,
        remindAt: input.remindAt,
        clientId: input.clientId,
        partnerId: input.partnerId,
        matchId: input.matchId,
        slotId: input.slotId,
        kind: input.kind,
        followupIndex: input.followupIndex,
      },
    });
  } catch {
    // 旧スキーマ向けフォールバック（kind 等カラム無し）
    try {
      const existing = await prisma.sessionFeedbackEmailJob.findUnique({ where: { id: input.id } });
      if (existing?.sentAt) return;
      await prisma.sessionFeedbackEmailJob.upsert({
        where: { id: input.id },
        create: {
          id: input.id,
          negotiationId: input.negotiationId,
          matchId: input.matchId,
          clientId: input.clientId,
          slotEndAt: input.slotEndAt,
        },
        update: {
          slotEndAt: input.slotEndAt,
        },
      });
    } catch {
      /* ignore */
    }
  }
}

export type PendingFeedbackJob = {
  id: string;
  negotiationId: string;
  slotId: string;
  matchId: string;
  clientId: string;
  partnerId: string;
  slotEndAt: Date;
  remindAt: Date;
  kind: SessionFeedbackEmailJobKind;
  followupIndex: 1 | 2 | null;
};

export async function listPendingSessionFeedbackJobs(now: Date): Promise<PendingFeedbackJob[]> {
  const out: PendingFeedbackJob[] = [];

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    const snap = await db.collection(COL).where("sent", "==", false).limit(500).get();
    for (const d of snap.docs) {
      const raw = d.data() as Record<string, unknown>;
      if (raw.cancelled === true) continue;
      const end = new Date(String(raw.slotEndAt ?? ""));
      if (Number.isNaN(end.valueOf())) continue;
      const remindRaw = raw.remindAt != null ? String(raw.remindAt) : String(raw.slotEndAt ?? "");
      const remind = new Date(remindRaw);
      if (Number.isNaN(remind.valueOf())) continue;
      if (remind > now) continue;
      out.push({
        id: d.id,
        negotiationId: String(raw.negotiationId ?? ""),
        slotId: String(raw.slotId ?? ""),
        matchId: String(raw.matchId ?? ""),
        clientId: String(raw.clientId ?? ""),
        partnerId: String(raw.partnerId ?? ""),
        slotEndAt: end,
        remindAt: remind,
        kind: parseKind(raw.kind),
        followupIndex: parseFollowupIndex(raw.followupIndex),
      });
    }
    return out;
  }

  try {
    const delegate = (
      prisma as unknown as {
        sessionFeedbackEmailJob?: { findMany?: Function };
      }
    ).sessionFeedbackEmailJob;
    if (!delegate?.findMany) return [];
    const rows = (await delegate.findMany({
      where: {
        sentAt: null,
        cancelledAt: null,
        OR: [{ remindAt: { lte: now } }, { remindAt: null, slotEndAt: { lte: now } }],
      },
      take: 500,
    })) as Array<Record<string, unknown>>;
    for (const r of rows) {
      const end = r.slotEndAt instanceof Date ? r.slotEndAt : new Date(String(r.slotEndAt));
      const remind =
        r.remindAt instanceof Date
          ? r.remindAt
          : r.remindAt
            ? new Date(String(r.remindAt))
            : end;
      if (Number.isNaN(end.valueOf()) || Number.isNaN(remind.valueOf())) continue;
      if (remind > now) continue;
      out.push({
        id: String(r.id ?? ""),
        negotiationId: String(r.negotiationId ?? ""),
        slotId: String(r.slotId ?? ""),
        matchId: String(r.matchId ?? ""),
        clientId: String(r.clientId ?? ""),
        partnerId: String(r.partnerId ?? ""),
        slotEndAt: end,
        remindAt: remind,
        kind: parseKind(r.kind),
        followupIndex: parseFollowupIndex(r.followupIndex),
      });
    }
  } catch {
    // 旧スキーマ: remindAt / cancelledAt 無し
    try {
      const rows = await prisma.sessionFeedbackEmailJob.findMany({
        where: { sentAt: null, slotEndAt: { lte: now } },
        take: 500,
      });
      for (const r of rows) {
        out.push({
          id: r.id,
          negotiationId: r.negotiationId,
          slotId: "",
          matchId: r.matchId,
          clientId: r.clientId,
          partnerId: "",
          slotEndAt: r.slotEndAt,
          remindAt: r.slotEndAt,
          kind: "initial",
          followupIndex: null,
        });
      }
    } catch {
      /* ignore */
    }
  }
  return out;
}

/** 送信前に原子的 claim。取れなければ他ワーカー処理中／済／キャンセル。 */
export async function tryClaimSessionFeedbackJob(jobId: string): Promise<boolean> {
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
      sessionFeedbackEmailJob?: { updateMany?: Function };
    }
  ).sessionFeedbackEmailJob;
  if (!delegate?.updateMany) {
    // 旧スキーマ: sentAt のみ
    try {
      const result = await prisma.sessionFeedbackEmailJob.updateMany({
        where: { id: jobId, sentAt: null },
        data: { sentAt: new Date() },
      });
      return result.count === 1;
    } catch {
      return false;
    }
  }
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

export async function markSessionFeedbackJobSent(jobId: string) {
  const nowIso = new Date().toISOString();
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return;
    await db.collection(COL).doc(jobId).set(
      { sent: true, sentAt: nowIso, updatedAt: nowIso },
      { merge: true },
    );
    return;
  }

  try {
    await prisma.sessionFeedbackEmailJob.update({
      where: { id: jobId },
      data: { sentAt: new Date() },
    });
  } catch {
    /* ignore */
  }
}

export async function markSessionFeedbackJobCancelled(jobId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return;
    await db
      .collection(COL)
      .doc(jobId)
      .set({ cancelled: true, sent: true, sentAt: nowIso, updatedAt: nowIso }, { merge: true })
      .catch(() => null);
    return;
  }
  const delegate = (
    prisma as unknown as {
      sessionFeedbackEmailJob?: { update?: Function };
    }
  ).sessionFeedbackEmailJob;
  if (!delegate?.update) {
    await markSessionFeedbackJobSent(jobId);
    return;
  }
  try {
    await delegate.update({
      where: { id: jobId },
      data: { cancelledAt: new Date(), sentAt: new Date() },
    });
  } catch {
    await markSessionFeedbackJobSent(jobId);
  }
}

export async function cancelSessionFeedbackEmailJobsForNegotiation(
  negotiationId: string,
): Promise<void> {
  const nowIso = new Date().toISOString();
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return;
    const snap = await db.collection(COL).where("negotiationId", "==", negotiationId).limit(50).get();
    await Promise.all(
      snap.docs.map((d) =>
        d.ref
          .set(
            { cancelled: true, sent: true, sentAt: nowIso, updatedAt: nowIso },
            { merge: true },
          )
          .catch(() => null),
      ),
    );
    return;
  }

  const delegate = (
    prisma as unknown as {
      sessionFeedbackEmailJob?: { updateMany?: Function };
    }
  ).sessionFeedbackEmailJob;
  if (!delegate?.updateMany) {
    try {
      await prisma.sessionFeedbackEmailJob.updateMany({
        where: { negotiationId, sentAt: null },
        data: { sentAt: new Date() },
      });
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    await delegate.updateMany({
      where: { negotiationId, sentAt: null },
      data: { cancelledAt: new Date(), sentAt: new Date() },
    });
  } catch {
    /* ignore */
  }
}
