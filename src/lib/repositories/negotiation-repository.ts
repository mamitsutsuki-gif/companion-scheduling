import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";

type SlotRow = {
  id: string;
  startAt: string;
  endAt: string;
  clientVote: "YES" | "NO" | null;
  isConfirmed: boolean;
};

type NegotiationRow = {
  id: string;
  matchId: string;
  sessionNumber: number;
  round: number;
  status:
    | "AWAITING_CLIENT_RESPONSE"
    | "NEEDS_NEW_PROPOSAL"
    | "AWAITING_PARTNER_CONFIRM"
    | "CONFIRMED"
    | "SUPERSEDED";
  slots: SlotRow[];
  createdAt: string;
  confirmedZoomUrl?: string | null;
  confirmedZoomMeetingId?: string | null;
  confirmedZoomPass?: string | null;
  rescheduleRequestedAt?: string | null;
  responseDeadline?: string | null;
  clientRespondedAt?: string | null;
};

function toIso(dt: Date | string) {
  return dt instanceof Date ? dt.toISOString() : dt;
}

export async function listNegotiationsForMatch(matchId: string) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    const snap = await db.collection("negotiations").where("matchId", "==", matchId).get();
    const rows = snap.docs.map((d) => {
      const raw = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        matchId: String(raw.matchId ?? ""),
        sessionNumber: Number(raw.sessionNumber ?? 1),
        round: Number(raw.round ?? 1),
        status: String(raw.status ?? "AWAITING_CLIENT_RESPONSE") as NegotiationRow["status"],
        createdAt: String(raw.createdAt ?? new Date().toISOString()),
        slots: Array.isArray(raw.slots)
          ? (raw.slots as Record<string, unknown>[]).map((s) => ({
              id: String(s.id ?? ""),
              startAt: String(s.startAt ?? ""),
              endAt: String(s.endAt ?? ""),
              clientVote: (s.clientVote as "YES" | "NO" | null) ?? null,
              isConfirmed: Boolean(s.isConfirmed),
            }))
          : [],
      };
    });
    return rows
      .map((r) => {
        const raw = snap.docs.find((d) => d.id === r.id)?.data() as Record<string, unknown> | undefined;
        return {
          ...r,
          confirmedZoomUrl: typeof raw?.confirmedZoomUrl === "string" ? raw.confirmedZoomUrl : null,
          confirmedZoomMeetingId:
            typeof raw?.confirmedZoomMeetingId === "string" ? raw.confirmedZoomMeetingId : null,
          confirmedZoomPass: typeof raw?.confirmedZoomPass === "string" ? raw.confirmedZoomPass : null,
          rescheduleRequestedAt:
            typeof raw?.rescheduleRequestedAt === "string" ? raw.rescheduleRequestedAt : null,
          responseDeadline:
            typeof raw?.responseDeadline === "string" ? raw.responseDeadline : null,
          clientRespondedAt:
            typeof raw?.clientRespondedAt === "string" ? raw.clientRespondedAt : null,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const negotiations = await prisma.negotiation.findMany({
    where: { matchId },
    orderBy: [{ createdAt: "desc" }],
    include: { slots: true },
  });
  return negotiations.map((n) => {
    const ext = n as unknown as {
      confirmedZoomUrl?: string | null;
      confirmedZoomMeetingId?: string | null;
      confirmedZoomPass?: string | null;
      rescheduleRequestedAt?: Date | null;
    };
    return {
      id: n.id,
      matchId: n.matchId,
      sessionNumber: Number((n as { sessionNumber?: number }).sessionNumber ?? 1),
      round: n.round,
      status: n.status,
      createdAt: n.createdAt.toISOString(),
      slots: n.slots.map((s) => ({
        id: s.id,
        startAt: s.startAt.toISOString(),
        endAt: s.endAt.toISOString(),
        clientVote: s.clientVote,
        isConfirmed: s.isConfirmed,
      })),
      confirmedZoomUrl: ext.confirmedZoomUrl ?? null,
      confirmedZoomMeetingId: ext.confirmedZoomMeetingId ?? null,
      confirmedZoomPass: ext.confirmedZoomPass ?? null,
      rescheduleRequestedAt: ext.rescheduleRequestedAt?.toISOString() ?? null,
      responseDeadline: (ext as { responseDeadline?: Date | null }).responseDeadline?.toISOString() ?? null,
      clientRespondedAt: (ext as { clientRespondedAt?: Date | null }).clientRespondedAt?.toISOString() ?? null,
    };
  });
}

export async function findLatestNegotiation(matchId: string) {
  const rows = await listNegotiationsForMatch(matchId);
  return rows[0] ?? null;
}

export async function createNegotiationRound(input: {
  matchId: string;
  sessionNumber: number;
  round: number;
  slotData: { startAt: Date; endAt: Date }[];
  responseDeadline?: Date;
}) {
  const now = new Date();
  const responseDeadlineIso = (input.responseDeadline ?? now).toISOString();
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) throw new Error("Firestore is not configured");
    const ref = db.collection("negotiations").doc();
    const slots = input.slotData.map((s, i) => ({
      id: `${ref.id}-slot-${i + 1}`,
      startAt: s.startAt.toISOString(),
      endAt: s.endAt.toISOString(),
      clientVote: null,
      isConfirmed: false,
    }));
    await ref.set({
      matchId: input.matchId,
      sessionNumber: input.sessionNumber,
      round: input.round,
      status: "AWAITING_CLIENT_RESPONSE",
      slots,
      responseDeadline: responseDeadlineIso,
      clientRespondedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    return {
      id: ref.id,
      matchId: input.matchId,
      sessionNumber: input.sessionNumber,
      round: input.round,
      status: "AWAITING_CLIENT_RESPONSE" as const,
      slots,
      responseDeadline: responseDeadlineIso,
      clientRespondedAt: null,
      createdAt: now.toISOString(),
    };
  }

  let negotiation: {
    id: string;
    matchId: string;
    sessionNumber?: number;
    round: number;
    status: NegotiationRow["status"];
    createdAt: Date;
    slots: Array<{ id: string; startAt: Date; endAt: Date; clientVote: "YES" | "NO" | null; isConfirmed: boolean }>;
  };
  try {
    negotiation = await prisma.negotiation.create({
      data: {
        matchId: input.matchId,
        sessionNumber: input.sessionNumber,
        round: input.round,
        status: "AWAITING_CLIENT_RESPONSE",
        responseDeadline: input.responseDeadline ?? now,
        slots: {
          createMany: {
            data: input.slotData.map((s) => ({ startAt: s.startAt, endAt: s.endAt })),
          },
        },
      },
      include: { slots: true },
    });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Unknown argument `sessionNumber`")) throw error;
    negotiation = await prisma.negotiation.create({
      data: {
        matchId: input.matchId,
        round: input.round,
        status: "AWAITING_CLIENT_RESPONSE",
        responseDeadline: input.responseDeadline ?? now,
        slots: {
          createMany: {
            data: input.slotData.map((s) => ({ startAt: s.startAt, endAt: s.endAt })),
          },
        },
      },
      include: { slots: true },
    });
  }
  return {
    id: negotiation.id,
    matchId: negotiation.matchId,
    sessionNumber: Number((negotiation as { sessionNumber?: number }).sessionNumber ?? 1),
    round: negotiation.round,
    status: negotiation.status,
    createdAt: negotiation.createdAt.toISOString(),
    slots: negotiation.slots.map((s) => ({
      id: s.id,
      startAt: s.startAt.toISOString(),
      endAt: s.endAt.toISOString(),
      clientVote: s.clientVote,
      isConfirmed: s.isConfirmed,
    })),
  };
}

export async function markNegotiationSuperseded(negotiationId: string) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return;
    await db.collection("negotiations").doc(negotiationId).set(
      { status: "SUPERSEDED", updatedAt: new Date().toISOString() },
      { merge: true },
    );
    return;
  }
  await prisma.negotiation.update({ where: { id: negotiationId }, data: { status: "SUPERSEDED" } });
}

export async function getNegotiationById(negotiationId: string) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const d = await db.collection("negotiations").doc(negotiationId).get();
    if (!d.exists) return null;
    const raw = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      matchId: String(raw.matchId ?? ""),
      sessionNumber: Number(raw.sessionNumber ?? 1),
      round: Number(raw.round ?? 1),
      status: String(raw.status ?? "AWAITING_CLIENT_RESPONSE") as NegotiationRow["status"],
      slots: (Array.isArray(raw.slots) ? raw.slots : []).map((s) => {
        const row = s as Record<string, unknown>;
        return {
          id: String(row.id ?? ""),
          startAt: String(row.startAt ?? ""),
          endAt: String(row.endAt ?? ""),
          clientVote: (row.clientVote as "YES" | "NO" | null) ?? null,
          isConfirmed: Boolean(row.isConfirmed),
        };
      }),
      confirmedZoomUrl: typeof raw.confirmedZoomUrl === "string" ? raw.confirmedZoomUrl : null,
      confirmedZoomMeetingId:
        typeof raw.confirmedZoomMeetingId === "string" ? raw.confirmedZoomMeetingId : null,
      confirmedZoomPass: typeof raw.confirmedZoomPass === "string" ? raw.confirmedZoomPass : null,
      rescheduleRequestedAt:
        typeof raw.rescheduleRequestedAt === "string" ? raw.rescheduleRequestedAt : null,
      responseDeadline:
        typeof raw.responseDeadline === "string" ? raw.responseDeadline : null,
      clientRespondedAt:
        typeof raw.clientRespondedAt === "string" ? raw.clientRespondedAt : null,
    };
  }

  const n = await prisma.negotiation.findUnique({ where: { id: negotiationId }, include: { slots: true } });
  if (!n) return null;
  const ext = n as unknown as {
    confirmedZoomUrl?: string | null;
    confirmedZoomMeetingId?: string | null;
    confirmedZoomPass?: string | null;
    rescheduleRequestedAt?: Date | null;
  };
  return {
    id: n.id,
    matchId: n.matchId,
    sessionNumber: Number((n as { sessionNumber?: number }).sessionNumber ?? 1),
    round: n.round,
    status: n.status,
    slots: n.slots.map((s) => ({
      id: s.id,
      startAt: toIso(s.startAt),
      endAt: toIso(s.endAt),
      clientVote: s.clientVote,
      isConfirmed: s.isConfirmed,
    })),
    confirmedZoomUrl: ext.confirmedZoomUrl ?? null,
    confirmedZoomMeetingId: ext.confirmedZoomMeetingId ?? null,
    confirmedZoomPass: ext.confirmedZoomPass ?? null,
    rescheduleRequestedAt: ext.rescheduleRequestedAt?.toISOString() ?? null,
    responseDeadline: (ext as { responseDeadline?: Date | null }).responseDeadline?.toISOString() ?? null,
    clientRespondedAt: (ext as { clientRespondedAt?: Date | null }).clientRespondedAt?.toISOString() ?? null,
  };
}

export async function submitVotes(negotiationId: string, votes: Record<string, "YES" | "NO">) {
  const negotiation = await getNegotiationById(negotiationId);
  if (!negotiation) return null;
  const allNo = negotiation.slots.every((s) => votes[s.id] === "NO");
  const nextStatus = allNo ? "NEEDS_NEW_PROPOSAL" : "AWAITING_PARTNER_CONFIRM";

  const clientRespondedAt = new Date().toISOString();
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const slots = negotiation.slots.map((s) => ({ ...s, clientVote: votes[s.id] ?? null }));
    await db.collection("negotiations").doc(negotiationId).set(
      {
        slots,
        status: nextStatus,
        clientRespondedAt,
        updatedAt: clientRespondedAt,
      },
      { merge: true },
    );
  } else {
    await prisma.$transaction([
      ...negotiation.slots.map((slot) =>
        prisma.slot.update({ where: { id: slot.id }, data: { clientVote: votes[slot.id] } }),
      ),
      prisma.negotiation.update({
        where: { id: negotiationId },
        data: { status: nextStatus, clientRespondedAt: new Date(clientRespondedAt) },
      }),
    ]);
  }
  return { nextStatus };
}

export async function confirmNegotiationSlot(
  negotiationId: string,
  slotId: string,
  options?: {
    zoomUrl?: string | null;
    zoomMeetingId?: string | null;
    zoomPass?: string | null;
    meetingProvider?: "zoom" | "google_meet" | null;
    finalStartAt?: Date;
    finalEndAt?: Date;
  },
) {
  const negotiation = await getNegotiationById(negotiationId);
  if (!negotiation) return null;
  const chosen = negotiation.slots.find((s) => s.id === slotId);
  if (!chosen) return null;
  const startIso = (options?.finalStartAt ?? new Date(chosen.startAt)).toISOString();
  const endIso = (options?.finalEndAt ?? new Date(chosen.endAt)).toISOString();
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const slots = negotiation.slots.map((s) => ({
      ...s,
      isConfirmed: s.id === slotId,
      ...(s.id === slotId ? { startAt: startIso, endAt: endIso } : {}),
    }));
    await db.collection("negotiations").doc(negotiationId).set(
      {
        slots,
        status: "CONFIRMED",
        confirmedZoomUrl: options?.zoomUrl ?? null,
        confirmedZoomMeetingId: options?.zoomMeetingId ?? null,
        confirmedZoomPass: options?.zoomPass ?? null,
        confirmedMeetingProvider: options?.meetingProvider ?? null,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  } else {
    await prisma.$transaction([
      ...negotiation.slots.map((s) =>
        prisma.slot.update({
          where: { id: s.id },
          data:
            s.id === slotId
              ? { isConfirmed: true, startAt: new Date(startIso), endAt: new Date(endIso) }
              : { isConfirmed: false },
        }),
      ),
      prisma.negotiation.update({
        where: { id: negotiationId },
        data: {
          status: "CONFIRMED",
          confirmedZoomUrl: options?.zoomUrl ?? null,
          confirmedZoomPass: options?.zoomPass ?? null,
          ...({
            confirmedZoomMeetingId: options?.zoomMeetingId ?? null,
            confirmedMeetingProvider: options?.meetingProvider ?? null,
          } as Record<string, unknown>),
        },
      }),
    ]);
  }
  return {
    chosen: {
      ...chosen,
      startAt: startIso,
      endAt: endIso,
      isConfirmed: true,
    },
  };
}

/**
 * 同じ matchId かつ同じ sessionNumber の他の Negotiation について、rescheduleRequestedAt をクリア。
 * 「再調整中」状態を解除する用途。
 */
export async function clearRescheduleFlagsForSession(matchId: string, sessionNumber: number) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return;
    const snap = await db
      .collection("negotiations")
      .where("matchId", "==", matchId)
      .where("sessionNumber", "==", sessionNumber)
      .get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach((d) => {
      const raw = d.data() as Record<string, unknown>;
      if (raw.rescheduleRequestedAt) {
        batch.set(d.ref, { rescheduleRequestedAt: null }, { merge: true });
      }
    });
    await batch.commit();
    return;
  }
  try {
    await prisma.negotiation.updateMany({
      where: { matchId, sessionNumber, NOT: { rescheduleRequestedAt: null } },
      data: { rescheduleRequestedAt: null },
    });
  } catch {
    /* ignore (column may not exist on legacy DB) */
  }
}

/**
 * 確定済みの最新 Negotiation について、rescheduleRequestedAt を立てる。
 * UI 上「再調整中」表示にする。
 */
export async function setRescheduleRequestedFlag(negotiationId: string) {
  const now = new Date();
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return;
    await db
      .collection("negotiations")
      .doc(negotiationId)
      .set({ rescheduleRequestedAt: now.toISOString() }, { merge: true });
    return;
  }
  try {
    await prisma.negotiation.update({
      where: { id: negotiationId },
      data: { rescheduleRequestedAt: now },
    });
  } catch {
    /* ignore */
  }
}
