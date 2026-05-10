import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";

export type AdminNotificationType =
  | "CHAT"
  | "SLOT_PROPOSED"
  | "SLOT_VOTED"
  | "SLOT_CONFIRMED"
  | "RESCHEDULE"
  | "FEEDBACK_SUBMITTED"
  | "REPORT_SUBMITTED";

export type AdminNotificationRow = {
  id: string;
  type: AdminNotificationType;
  matchId: string | null;
  sessionNumber: number | null;
  actorUserId: string | null;
  actorRole: string | null;
  summary: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

function isType(value: unknown): value is AdminNotificationType {
  return (
    value === "CHAT" ||
    value === "SLOT_PROPOSED" ||
    value === "SLOT_VOTED" ||
    value === "SLOT_CONFIRMED" ||
    value === "RESCHEDULE" ||
    value === "FEEDBACK_SUBMITTED" ||
    value === "REPORT_SUBMITTED"
  );
}

export async function appendAdminNotification(input: {
  type: AdminNotificationType;
  matchId?: string | null;
  sessionNumber?: number | null;
  actorUserId?: string | null;
  actorRole?: string | null;
  summary: string;
  link?: string | null;
}): Promise<{ id: string } | null> {
  const summary = input.summary.slice(0, 500);
  const link = input.link?.slice(0, 500) ?? null;
  const createdAt = new Date().toISOString();

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const ref = db.collection("adminNotifications").doc();
    await ref.set({
      type: input.type,
      matchId: input.matchId ?? null,
      sessionNumber: input.sessionNumber ?? null,
      actorUserId: input.actorUserId ?? null,
      actorRole: input.actorRole ?? null,
      summary,
      link,
      readAt: null,
      createdAt,
    });
    return { id: ref.id };
  }

  const delegate = (
    prisma as unknown as { adminNotification?: { create?: Function } }
  ).adminNotification;
  if (!delegate?.create) return null;
  try {
    const row = (await delegate.create({
      data: {
        type: input.type,
        matchId: input.matchId ?? null,
        sessionNumber: input.sessionNumber ?? null,
        actorUserId: input.actorUserId ?? null,
        actorRole: input.actorRole ?? null,
        summary,
        link,
      },
    })) as { id: string };
    return { id: row.id };
  } catch {
    return null;
  }
}

export async function listAdminNotifications(input?: { limit?: number }): Promise<AdminNotificationRow[]> {
  const limit = Math.max(1, Math.min(200, input?.limit ?? 100));
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    const snap = await db
      .collection("adminNotifications")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();
    return snap.docs.map((d) => {
      const raw = d.data() as Record<string, unknown>;
      const type = isType(raw.type) ? raw.type : "CHAT";
      return {
        id: d.id,
        type,
        matchId: raw.matchId ? String(raw.matchId) : null,
        sessionNumber: typeof raw.sessionNumber === "number" ? raw.sessionNumber : null,
        actorUserId: raw.actorUserId ? String(raw.actorUserId) : null,
        actorRole: raw.actorRole ? String(raw.actorRole) : null,
        summary: String(raw.summary ?? ""),
        link: raw.link ? String(raw.link) : null,
        readAt: raw.readAt ? String(raw.readAt) : null,
        createdAt: String(raw.createdAt ?? new Date().toISOString()),
      } as AdminNotificationRow;
    });
  }
  const delegate = (
    prisma as unknown as { adminNotification?: { findMany?: Function } }
  ).adminNotification;
  if (!delegate?.findMany) return [];
  const rows = (await delegate.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  })) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    type: isType(row.type) ? row.type : "CHAT",
    matchId: row.matchId ? String(row.matchId) : null,
    sessionNumber: typeof row.sessionNumber === "number" ? row.sessionNumber : null,
    actorUserId: row.actorUserId ? String(row.actorUserId) : null,
    actorRole: row.actorRole ? String(row.actorRole) : null,
    summary: String(row.summary ?? ""),
    link: row.link ? String(row.link) : null,
    readAt:
      row.readAt instanceof Date
        ? row.readAt.toISOString()
        : row.readAt
          ? String(row.readAt)
          : null,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt ?? new Date().toISOString()),
  }));
}

export async function markAdminNotificationRead(id: string): Promise<void> {
  const now = new Date().toISOString();
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return;
    await db.collection("adminNotifications").doc(id).set({ readAt: now }, { merge: true });
    return;
  }
  const delegate = (
    prisma as unknown as { adminNotification?: { update?: Function } }
  ).adminNotification;
  if (!delegate?.update) return;
  try {
    await delegate.update({ where: { id }, data: { readAt: new Date(now) } });
  } catch {
    // ignore
  }
}

export async function markAllAdminNotificationsRead(): Promise<void> {
  const now = new Date().toISOString();
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return;
    const snap = await db.collection("adminNotifications").where("readAt", "==", null).get();
    const batch = db.batch();
    for (const d of snap.docs) batch.set(d.ref, { readAt: now }, { merge: true });
    if (!snap.empty) await batch.commit();
    return;
  }
  const delegate = (
    prisma as unknown as { adminNotification?: { updateMany?: Function } }
  ).adminNotification;
  if (!delegate?.updateMany) return;
  try {
    await delegate.updateMany({ where: { readAt: null }, data: { readAt: new Date(now) } });
  } catch {
    // ignore
  }
}
