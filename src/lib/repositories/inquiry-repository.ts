import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";

export type InquirySubmitterRole = "CLIENT" | "PARTNER";
export type InquiryStatus = "OPEN" | "ANSWERED";

export type InquiryRow = {
  id: string;
  receptionNumber: string;
  userId: string;
  submitterRole: InquirySubmitterRole;
  name: string;
  category: string;
  body: string;
  status: InquiryStatus;
  replyBody: string | null;
  repliedByUserId: string | null;
  repliedAt: string | null;
  createdAt: string;
};

function isSubmitterRole(value: unknown): value is InquirySubmitterRole {
  return value === "CLIENT" || value === "PARTNER";
}

function isStatus(value: unknown): value is InquiryStatus {
  return value === "OPEN" || value === "ANSWERED";
}

function mapRow(id: string, raw: Record<string, unknown>): InquiryRow {
  return {
    id,
    receptionNumber: String(raw.receptionNumber ?? ""),
    userId: String(raw.userId ?? ""),
    submitterRole: isSubmitterRole(raw.submitterRole) ? raw.submitterRole : "CLIENT",
    name: String(raw.name ?? ""),
    category: String(raw.category ?? ""),
    body: String(raw.body ?? ""),
    status: isStatus(raw.status) ? raw.status : "OPEN",
    replyBody: raw.replyBody ? String(raw.replyBody) : null,
    repliedByUserId: raw.repliedByUserId ? String(raw.repliedByUserId) : null,
    repliedAt: raw.repliedAt ? String(raw.repliedAt) : null,
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
  };
}

async function allocateReceptionNumber(): Promise<string> {
  const yyyy = new Date().toLocaleString("en-CA", { timeZone: "Asia/Tokyo" }).slice(0, 4);

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) throw new Error("データベースに接続できません。");
    const counterRef = db.collection("counters").doc("inquiries");
    const next = await db.runTransaction(async (tx) => {
      const snap = await tx.get(counterRef);
      const data = snap.data() ?? { year: yyyy, seq: 0 };
      const seq = data.year === yyyy ? Number(data.seq ?? 0) + 1 : 1;
      tx.set(counterRef, { year: yyyy, seq });
      return seq;
    });
    return `INQ-${yyyy}-${String(next).padStart(5, "0")}`;
  }

  const delegate = (prisma as unknown as { inquiryCounter?: { upsert?: Function } }).inquiryCounter;
  if (delegate?.upsert) {
    const row = (await delegate.upsert({
      where: { id: "inquiries" },
      create: { id: "inquiries", year: yyyy, seq: 1 },
      update: {},
    })) as { year: string; seq: number };
    let seq = 1;
    if (row.year === yyyy) {
      seq = row.seq + 1;
    }
    await delegate.upsert({
      where: { id: "inquiries" },
      create: { id: "inquiries", year: yyyy, seq },
      update: { year: yyyy, seq },
    });
    return `INQ-${yyyy}-${String(seq).padStart(5, "0")}`;
  }

  const suffix = String(Date.now()).slice(-8);
  return `INQ-${yyyy}-${suffix}`;
}

export async function createInquiry(input: {
  userId: string;
  submitterRole: InquirySubmitterRole;
  name: string;
  category: string;
  body: string;
}): Promise<InquiryRow> {
  const receptionNumber = await allocateReceptionNumber();
  const createdAt = new Date().toISOString();
  const data = {
    receptionNumber,
    userId: input.userId,
    submitterRole: input.submitterRole,
    name: input.name.slice(0, 120),
    category: input.category.slice(0, 200),
    body: input.body.slice(0, 5000),
    status: "OPEN" as const,
    replyBody: null,
    repliedByUserId: null,
    repliedAt: null,
    createdAt,
  };

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) throw new Error("データベースに接続できません。");
    const ref = db.collection("inquiries").doc();
    await ref.set(data);
    return mapRow(ref.id, data);
  }

  const delegate = (prisma as unknown as { inquiry?: { create?: Function } }).inquiry;
  if (!delegate?.create) throw new Error("問い合わせの保存に失敗しました。");
  const row = (await delegate.create({ data })) as Record<string, unknown>;
  return mapRow(String(row.id), row);
}

export async function listInquiries(input?: {
  submitterRole?: InquirySubmitterRole | null;
  status?: InquiryStatus | null;
  limit?: number;
}): Promise<InquiryRow[]> {
  const limit = Math.max(1, Math.min(200, input?.limit ?? 100));

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    let query = db.collection("inquiries").orderBy("createdAt", "desc").limit(limit);
    if (input?.submitterRole) {
      query = db
        .collection("inquiries")
        .where("submitterRole", "==", input.submitterRole)
        .orderBy("createdAt", "desc")
        .limit(limit);
    }
    try {
      const snap = await query.get();
      let rows = snap.docs.map((d) => mapRow(d.id, d.data() as Record<string, unknown>));
      if (input?.status) rows = rows.filter((r) => r.status === input.status);
      return rows;
    } catch {
      const snap = await db.collection("inquiries").get();
      let rows = snap.docs
        .map((d) => mapRow(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      if (input?.submitterRole) rows = rows.filter((r) => r.submitterRole === input.submitterRole);
      if (input?.status) rows = rows.filter((r) => r.status === input.status);
      return rows.slice(0, limit);
    }
  }

  const delegate = (prisma as unknown as { inquiry?: { findMany?: Function } }).inquiry;
  if (!delegate?.findMany) return [];
  const where: Record<string, unknown> = {};
  if (input?.submitterRole) where.submitterRole = input.submitterRole;
  if (input?.status) where.status = input.status;
  const rows = (await delegate.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  })) as Array<Record<string, unknown>>;
  return rows.map((row) => mapRow(String(row.id), row));
}

export async function listMyInquiries(userId: string, input?: { limit?: number }): Promise<InquiryRow[]> {
  const limit = Math.max(1, Math.min(50, input?.limit ?? 20));

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    try {
      const snap = await db
        .collection("inquiries")
        .where("userId", "==", userId)
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();
      return snap.docs.map((d) => mapRow(d.id, d.data() as Record<string, unknown>));
    } catch {
      const snap = await db.collection("inquiries").where("userId", "==", userId).get();
      return snap.docs
        .map((d) => mapRow(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
    }
  }

  const delegate = (prisma as unknown as { inquiry?: { findMany?: Function } }).inquiry;
  if (!delegate?.findMany) return [];
  const rows = (await delegate.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  })) as Array<Record<string, unknown>>;
  return rows.map((row) => mapRow(String(row.id), row));
}

export async function countOpenInquiries(): Promise<number> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return 0;
    try {
      const snap = await db.collection("inquiries").where("status", "==", "OPEN").get();
      return snap.size;
    } catch {
      const snap = await db.collection("inquiries").get();
      return snap.docs.filter((d) => (d.data() as Record<string, unknown>).status === "OPEN").length;
    }
  }
  const delegate = (prisma as unknown as { inquiry?: { count?: Function } }).inquiry;
  if (!delegate?.count) return 0;
  try {
    return (await delegate.count({ where: { status: "OPEN" } })) as number;
  } catch {
    return 0;
  }
}

export async function replyToInquiry(input: {
  inquiryId: string;
  repliedByUserId: string;
  replyBody: string;
}): Promise<InquiryRow> {
  const replyBody = input.replyBody.slice(0, 5000);
  const repliedAt = new Date().toISOString();

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) throw new Error("データベースに接続できません。");
    const ref = db.collection("inquiries").doc(input.inquiryId);
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw Object.assign(new Error("問い合わせが見つかりません。"), { http: 404 });
      const raw = snap.data() as Record<string, unknown>;
      if (raw.status === "ANSWERED") {
        throw Object.assign(new Error("この問い合わせはすでに回答済みです。"), { http: 409 });
      }
      const updated = {
        status: "ANSWERED",
        replyBody,
        repliedByUserId: input.repliedByUserId,
        repliedAt,
      };
      tx.set(ref, updated, { merge: true });
      return mapRow(snap.id, { ...raw, ...updated });
    });
    return result;
  }

  const delegate = (prisma as unknown as { inquiry?: { updateMany?: Function; findUnique?: Function } })
    .inquiry;
  if (!delegate?.updateMany || !delegate?.findUnique) {
    throw new Error("問い合わせの回答に失敗しました。");
  }
  const updated = await delegate.updateMany({
    where: { id: input.inquiryId, status: "OPEN" },
    data: {
      status: "ANSWERED",
      replyBody,
      repliedByUserId: input.repliedByUserId,
      repliedAt: new Date(repliedAt),
    },
  });
  if (!updated || (updated as { count?: number }).count === 0) {
    const existing = (await delegate.findUnique({ where: { id: input.inquiryId } })) as
      | Record<string, unknown>
      | null;
    if (!existing) throw Object.assign(new Error("問い合わせが見つかりません。"), { http: 404 });
    throw Object.assign(new Error("この問い合わせはすでに回答済みです。"), { http: 409 });
  }
  const row = (await delegate.findUnique({ where: { id: input.inquiryId } })) as Record<string, unknown>;
  return mapRow(String(row.id), row);
}
