import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";

function jobDocId(negotiationId: string, slotId: string) {
  return `${negotiationId}_${slotId}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 400);
}

export async function enqueueSessionFeedbackEmailJob(input: {
  negotiationId: string;
  slotId: string;
  matchId: string;
  clientId: string;
  slotEndAt: Date;
}) {
  const id = jobDocId(input.negotiationId, input.slotId);
  const endIso = input.slotEndAt.toISOString();

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return;
    const ref = db.collection("sessionFeedbackEmailJobs").doc(id);
    const existing = await ref.get();
    if (existing.exists && (existing.data() as { sent?: boolean })?.sent === true) return;
    await ref.set(
      {
        negotiationId: input.negotiationId,
        slotId: input.slotId,
        matchId: input.matchId,
        clientId: input.clientId,
        slotEndAt: endIso,
        sent: false,
        createdAt: new Date().toISOString(),
      },
      { merge: true },
    );
    return;
  }

  await prisma.sessionFeedbackEmailJob.upsert({
    where: { id },
    create: {
      id,
      negotiationId: input.negotiationId,
      matchId: input.matchId,
      clientId: input.clientId,
      slotEndAt: input.slotEndAt,
    },
    update: {
      slotEndAt: input.slotEndAt,
      sentAt: null,
    },
  });
}

export type PendingFeedbackJob = {
  id: string;
  negotiationId: string;
  matchId: string;
  clientId: string;
  slotEndAt: Date;
};

export async function listPendingSessionFeedbackJobs(now: Date): Promise<PendingFeedbackJob[]> {
  const out: PendingFeedbackJob[] = [];

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    const snap = await db.collection("sessionFeedbackEmailJobs").where("sent", "==", false).limit(500).get();
    for (const d of snap.docs) {
      const raw = d.data() as Record<string, unknown>;
      const endRaw = String(raw.slotEndAt ?? "");
      const end = new Date(endRaw);
      if (Number.isNaN(end.valueOf())) continue;
      if (end > now) continue;
      out.push({
        id: d.id,
        negotiationId: String(raw.negotiationId ?? ""),
        matchId: String(raw.matchId ?? ""),
        clientId: String(raw.clientId ?? ""),
        slotEndAt: end,
      });
    }
    return out;
  }

  const rows = await prisma.sessionFeedbackEmailJob.findMany({
    where: { sentAt: null, slotEndAt: { lte: now } },
    take: 500,
  });
  return rows.map((r) => ({
    id: r.id,
    negotiationId: r.negotiationId,
    matchId: r.matchId,
    clientId: r.clientId,
    slotEndAt: r.slotEndAt,
  }));
}

export async function markSessionFeedbackJobSent(jobId: string) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return;
    await db.collection("sessionFeedbackEmailJobs").doc(jobId).set(
      { sent: true, sentAt: new Date().toISOString() },
      { merge: true },
    );
    return;
  }

  await prisma.sessionFeedbackEmailJob.update({
    where: { id: jobId },
    data: { sentAt: new Date() },
  });
}
