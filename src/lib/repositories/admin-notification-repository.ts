import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";

export type AdminNotificationType =
  | "CHAT"
  | "SLOT_PROPOSED"
  | "SLOT_VOTED"
  | "SLOT_CONFIRMED"
  | "RESCHEDULE"
  | "FEEDBACK_SUBMITTED"
  | "REPORT_SUBMITTED"
  | "SESSION_ABANDONED"
  | "INVOICE_SUBMITTED"
  | "INQUIRY_SUBMITTED";

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
    value === "REPORT_SUBMITTED" ||
    value === "SESSION_ABANDONED" ||
    value === "INVOICE_SUBMITTED" ||
    value === "INQUIRY_SUBMITTED"
  );
}

/**
 * 通知の遷移先 URL を「種別ごとの最適な場所」に正規化する。
 *
 * 過去に発火した通知は Firestore 上に `/admin/matches?focus=<id>` という
 * 旧リンクが保存されているため、種別 + matchId から正しい match ページ
 * （チャットタブ・日程調整タブ）に書き換える。
 *
 * - CHAT             → /match/<id>#chat
 * - SLOT_* / RESCHEDULE → /match/<id>#schedule
 * - FEEDBACK / REPORT / SESSION_ABANDONED → /match/<id>/sessions/<n>
 * - INVOICE_SUBMITTED は保存済みの link（/admin/invoices?...）をそのまま使用
 *
 * これにより、「該当ページを開く」ボタンから 1 アクションで該当ペアの
 * 該当タブに飛べる。
 */
function resolveLink(
  type: AdminNotificationType,
  matchId: string | null,
  sessionNumber: number | null,
  storedLink: string | null,
): string | null {
  const isLegacyMatchesLink = !!storedLink && /^\/admin\/matches(\?|$)/.test(storedLink);

  if (storedLink && !isLegacyMatchesLink) return storedLink;
  if (!matchId) return storedLink;

  switch (type) {
    case "CHAT":
      return `/match/${matchId}#chat`;
    case "SLOT_PROPOSED":
    case "SLOT_VOTED":
    case "SLOT_CONFIRMED":
    case "RESCHEDULE":
      return `/match/${matchId}#schedule`;
    case "FEEDBACK_SUBMITTED":
    case "REPORT_SUBMITTED":
    case "SESSION_ABANDONED":
      if (sessionNumber != null) {
        return `/match/${matchId}/sessions/${sessionNumber}`;
      }
      return `/match/${matchId}#sessions`;
    case "INVOICE_SUBMITTED":
      return storedLink;
    case "INQUIRY_SUBMITTED":
      return storedLink ?? "/admin/inquiries";
    default:
      return storedLink;
  }
}

/**
 * リスク対策: 通知が無限に積み上がらないよう、書き込み時に **古いものを自動 prune**。
 * 既読のものは 1,000 件超で削除、未読を含めても 5,000 件以上は古い既読から削除。
 */
const ADMIN_NOTIF_HARD_CAP = 5000;

async function pruneOldAdminNotifications() {
  if (Math.random() > 0.05) return; // 確率 prune（1/20）でコスト最小化
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return;
    try {
      const snap = await db
        .collection("adminNotifications")
        .orderBy("createdAt", "desc")
        .offset(ADMIN_NOTIF_HARD_CAP)
        .limit(200)
        .get();
      if (snap.empty) return;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    } catch {
      /* index 未作成等はスキップ */
    }
    return;
  }
  const delegate = (
    prisma as unknown as { adminNotification?: { findMany?: Function; deleteMany?: Function } }
  ).adminNotification;
  if (!delegate?.findMany || !delegate?.deleteMany) return;
  try {
    const oldest = (await delegate.findMany({
      orderBy: { createdAt: "desc" },
      skip: ADMIN_NOTIF_HARD_CAP,
      take: 200,
      select: { id: true },
    })) as Array<{ id: string }>;
    if (oldest.length === 0) return;
    await delegate.deleteMany({ where: { id: { in: oldest.map((o) => o.id) } } });
  } catch {
    /* noop */
  }
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
  void pruneOldAdminNotifications();

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
      const matchId = raw.matchId ? String(raw.matchId) : null;
      const sessionNumber = typeof raw.sessionNumber === "number" ? raw.sessionNumber : null;
      const storedLink = raw.link ? String(raw.link) : null;
      return {
        id: d.id,
        type,
        matchId,
        sessionNumber,
        actorUserId: raw.actorUserId ? String(raw.actorUserId) : null,
        actorRole: raw.actorRole ? String(raw.actorRole) : null,
        summary: String(raw.summary ?? ""),
        link: resolveLink(type, matchId, sessionNumber, storedLink),
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
  return rows.map((row) => {
    const type = isType(row.type) ? row.type : "CHAT";
    const matchId = row.matchId ? String(row.matchId) : null;
    const sessionNumber = typeof row.sessionNumber === "number" ? row.sessionNumber : null;
    const storedLink = row.link ? String(row.link) : null;
    return {
      id: String(row.id),
      type,
      matchId,
      sessionNumber,
      actorUserId: row.actorUserId ? String(row.actorUserId) : null,
      actorRole: row.actorRole ? String(row.actorRole) : null,
      summary: String(row.summary ?? ""),
      link: resolveLink(type, matchId, sessionNumber, storedLink),
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
    };
  });
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
