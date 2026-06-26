import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";

/**
 * パートナー / クライアントなど受信者ごとの通知フィード。
 * 管理者通知（adminNotifications）とは別物で、recipientUserId に対して書かれる。
 */
export type MemberNotificationType =
  | "CHAT"
  | "SLOT_PROPOSED"
  | "SLOT_VOTED"
  | "SLOT_CONFIRMED"
  | "RESCHEDULE"
  | "INVOICE_CONFIRMED"
  | "INVOICE_RETURNED"
  | "MATCH_ASSIGNED"
  | "ROLEPLAY_REVEALED"
  | "INQUIRY_REPLIED";

export type MemberNotificationRow = {
  id: string;
  recipientUserId: string;
  type: MemberNotificationType;
  matchId: string | null;
  sessionNumber: number | null;
  actorUserId: string | null;
  actorRole: string | null;
  summary: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

function isType(value: unknown): value is MemberNotificationType {
  return (
    value === "CHAT" ||
    value === "SLOT_PROPOSED" ||
    value === "SLOT_VOTED" ||
    value === "SLOT_CONFIRMED" ||
    value === "RESCHEDULE" ||
    value === "INVOICE_CONFIRMED" ||
    value === "INVOICE_RETURNED" ||
    value === "MATCH_ASSIGNED" ||
    value === "ROLEPLAY_REVEALED" ||
    value === "INQUIRY_REPLIED"
  );
}

/**
 * 受信者ごとに最大 1,000 件を超えたら、古い既読/未読を切り詰める（確率 prune）。
 */
const MEMBER_NOTIF_PER_USER_CAP = 1000;

async function pruneOldMemberNotifications(recipientUserId: string) {
  if (Math.random() > 0.05) return;
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return;
    try {
      const snap = await db
        .collection("memberNotifications")
        .where("recipientUserId", "==", recipientUserId)
        .get();
      if (snap.size <= MEMBER_NOTIF_PER_USER_CAP) return;
      const sorted = snap.docs.sort((a, b) =>
        String((b.data() as Record<string, unknown>).createdAt ?? "").localeCompare(
          String((a.data() as Record<string, unknown>).createdAt ?? ""),
        ),
      );
      const toDelete = sorted.slice(MEMBER_NOTIF_PER_USER_CAP);
      const batch = db.batch();
      toDelete.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    } catch {
      /* noop */
    }
    return;
  }
  const delegate = (
    prisma as unknown as { memberNotification?: { findMany?: Function; deleteMany?: Function } }
  ).memberNotification;
  if (!delegate?.findMany || !delegate?.deleteMany) return;
  try {
    const oldest = (await delegate.findMany({
      where: { recipientUserId },
      orderBy: { createdAt: "desc" },
      skip: MEMBER_NOTIF_PER_USER_CAP,
      take: 200,
      select: { id: true },
    })) as Array<{ id: string }>;
    if (oldest.length === 0) return;
    await delegate.deleteMany({ where: { id: { in: oldest.map((o) => o.id) } } });
  } catch {
    /* noop */
  }
}

export async function appendMemberNotification(input: {
  recipientUserId: string;
  type: MemberNotificationType;
  matchId?: string | null;
  sessionNumber?: number | null;
  actorUserId?: string | null;
  actorRole?: string | null;
  summary: string;
  link?: string | null;
}): Promise<{ id: string } | null> {
  if (!input.recipientUserId) return null;
  const summary = input.summary.slice(0, 500);
  const link = input.link?.slice(0, 500) ?? null;
  const createdAt = new Date().toISOString();
  void pruneOldMemberNotifications(input.recipientUserId);

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const ref = db.collection("memberNotifications").doc();
    await ref.set({
      recipientUserId: input.recipientUserId,
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
    prisma as unknown as { memberNotification?: { create?: Function } }
  ).memberNotification;
  if (!delegate?.create) return null;
  try {
    const row = (await delegate.create({
      data: {
        recipientUserId: input.recipientUserId,
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

export async function listMemberNotifications(
  recipientUserId: string,
  input?: { limit?: number },
): Promise<MemberNotificationRow[]> {
  if (!recipientUserId) return [];
  const limit = Math.max(1, Math.min(200, input?.limit ?? 100));
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    // createdAt orderBy + recipient where：複合 index 不要にするため where のみで取得→メモリでソート
    const snap = await db
      .collection("memberNotifications")
      .where("recipientUserId", "==", recipientUserId)
      .get();
    const rows = snap.docs.map((d) => {
      const raw = d.data() as Record<string, unknown>;
      const type = isType(raw.type) ? raw.type : "CHAT";
      return {
        id: d.id,
        recipientUserId,
        type,
        matchId: raw.matchId ? String(raw.matchId) : null,
        sessionNumber: typeof raw.sessionNumber === "number" ? raw.sessionNumber : null,
        actorUserId: raw.actorUserId ? String(raw.actorUserId) : null,
        actorRole: raw.actorRole ? String(raw.actorRole) : null,
        summary: String(raw.summary ?? ""),
        link: raw.link ? String(raw.link) : null,
        readAt: raw.readAt ? String(raw.readAt) : null,
        createdAt: String(raw.createdAt ?? new Date().toISOString()),
      } as MemberNotificationRow;
    });
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }
  const delegate = (
    prisma as unknown as { memberNotification?: { findMany?: Function } }
  ).memberNotification;
  if (!delegate?.findMany) return [];
  const rows = (await delegate.findMany({
    where: { recipientUserId },
    orderBy: { createdAt: "desc" },
    take: limit,
  })) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    recipientUserId,
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

export async function markMemberNotificationRead(id: string, recipientUserId: string) {
  const now = new Date().toISOString();
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return;
    const ref = db.collection("memberNotifications").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return;
    const raw = snap.data() as Record<string, unknown>;
    if (raw.recipientUserId !== recipientUserId) return;
    await ref.set({ readAt: now }, { merge: true });
    return;
  }
  const delegate = (
    prisma as unknown as { memberNotification?: { updateMany?: Function } }
  ).memberNotification;
  if (!delegate?.updateMany) return;
  try {
    await delegate.updateMany({
      where: { id, recipientUserId },
      data: { readAt: new Date(now) },
    });
  } catch {
    /* noop */
  }
}

export async function markAllMemberNotificationsRead(recipientUserId: string) {
  const now = new Date().toISOString();
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return;
    const snap = await db
      .collection("memberNotifications")
      .where("recipientUserId", "==", recipientUserId)
      .where("readAt", "==", null)
      .get();
    if (snap.empty) return;
    const batch = db.batch();
    for (const d of snap.docs) batch.set(d.ref, { readAt: now }, { merge: true });
    await batch.commit();
    return;
  }
  const delegate = (
    prisma as unknown as { memberNotification?: { updateMany?: Function } }
  ).memberNotification;
  if (!delegate?.updateMany) return;
  try {
    await delegate.updateMany({
      where: { recipientUserId, readAt: null },
      data: { readAt: new Date(now) },
    });
  } catch {
    /* noop */
  }
}

/**
 * 指定された match の `type === "CHAT"` 通知のうち、未読のものをまとめて既読化する。
 *
 * 用途: match ページのチャットタブを開いたタイミングで呼ぶことで、
 *      ユーザーが「通知一覧」を経由せずチャットを読んだ場合でも、
 *      「次のアクション」リストの未読カウントが正しく 0 に戻るようにする。
 */
export async function markChatNotificationsReadForMatch(
  recipientUserId: string,
  matchId: string,
): Promise<void> {
  if (!recipientUserId || !matchId) return;
  const now = new Date().toISOString();
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return;
    const snap = await db
      .collection("memberNotifications")
      .where("recipientUserId", "==", recipientUserId)
      .where("matchId", "==", matchId)
      .where("type", "==", "CHAT")
      .where("readAt", "==", null)
      .get();
    if (snap.empty) return;
    const batch = db.batch();
    for (const d of snap.docs) batch.set(d.ref, { readAt: now }, { merge: true });
    await batch.commit();
    return;
  }
  const delegate = (
    prisma as unknown as { memberNotification?: { updateMany?: Function } }
  ).memberNotification;
  if (!delegate?.updateMany) return;
  try {
    await delegate.updateMany({
      where: { recipientUserId, matchId, type: "CHAT", readAt: null },
      data: { readAt: new Date(now) },
    });
  } catch {
    /* noop */
  }
}

export async function countUnreadMemberNotifications(recipientUserId: string): Promise<number> {
  if (!recipientUserId) return 0;
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return 0;
    const snap = await db
      .collection("memberNotifications")
      .where("recipientUserId", "==", recipientUserId)
      .where("readAt", "==", null)
      .get();
    return snap.size;
  }
  const delegate = (
    prisma as unknown as { memberNotification?: { count?: Function } }
  ).memberNotification;
  if (!delegate?.count) return 0;
  try {
    return (await delegate.count({ where: { recipientUserId, readAt: null } })) as number;
  } catch {
    return 0;
  }
}
