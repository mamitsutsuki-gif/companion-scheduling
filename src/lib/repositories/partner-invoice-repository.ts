import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";

export type PartnerInvoiceStatus = "DRAFT" | "SUBMITTED" | "RETURNED" | "CONFIRMED";

export type PartnerInvoiceItem = {
  matchId: string;
  sessionNumber: number;
  /** セッション実施日 ISO (パートナーが編集可能だが既定値は確定済みスロットの開始日時) */
  sessionDate: string;
  /** クライアント名 (パートナーが編集可能) */
  clientName: string;
  /** クライアント所属企業の表示名（アプリ設定の企業名（ID）。パートナーが編集可能） */
  clientCompanyName: string;
  /** 税抜単価 (円, 整数) */
  unitPriceExclTax: number;
};

export type PartnerInvoiceRow = {
  id: string;
  partnerId: string;
  year: number;
  month: number;
  status: PartnerInvoiceStatus;
  /** 提出時にスナップショットされた表示用のパートナー名（後から名前変更されても請求書の整合性を保つ） */
  partnerName: string;
  address: string;
  phone: string;
  bankAccount: string;
  items: PartnerInvoiceItem[];
  submittedAt: string | null;
  confirmedAt: string | null;
  returnedAt: string | null;
  /** 管理者からの差し戻しコメント */
  adminComment: string | null;
  /** 振込日 ISO (対象月の翌月末) — 表示上のみ。クライアント側で固定。 */
  transferDate: string;
  createdAt: string;
  updatedAt: string;
};

const COLLECTION = "partnerInvoices";

export function invoiceDocId(partnerId: string, year: number, month: number) {
  const mm = String(month).padStart(2, "0");
  return `${partnerId}_${year}_${mm}`;
}

/** 対象月の翌月末日 (ISO 文字列, タイムゾーンは JST 想定の日付のみ表現) */
export function computeTransferDate(year: number, month: number): string {
  // month は 1..12 想定。new Date(Date.UTC(y, m, 0)) は y/m 月の末日を返す（month は 0-based の月数）。
  // 翌月末日が欲しいので (year, month + 1, 0) を渡す。
  const nextEnd = new Date(Date.UTC(year, month + 1, 0));
  return nextEnd.toISOString().slice(0, 10);
}

function normalizeStatus(input: unknown): PartnerInvoiceStatus {
  return input === "SUBMITTED" || input === "RETURNED" || input === "CONFIRMED"
    ? input
    : "DRAFT";
}

function normalizeItems(input: unknown): PartnerInvoiceItem[] {
  if (!Array.isArray(input)) return [];
  const out: PartnerInvoiceItem[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const matchId = String(r.matchId ?? "");
    const sessionNumber = Number(r.sessionNumber ?? 0);
    if (!matchId || !Number.isFinite(sessionNumber) || sessionNumber <= 0) continue;
    out.push({
      matchId,
      sessionNumber,
      sessionDate: String(r.sessionDate ?? ""),
      clientName: String(r.clientName ?? "").slice(0, 200),
      clientCompanyName: String(r.clientCompanyName ?? "").slice(0, 200),
      unitPriceExclTax: Math.max(
        0,
        Math.round(Number(r.unitPriceExclTax ?? 0)) || 0,
      ),
    });
  }
  return out;
}

function rowFromFirestore(snap: FirebaseFirestore.DocumentSnapshot): PartnerInvoiceRow | null {
  if (!snap.exists) return null;
  const raw = snap.data() as Record<string, unknown>;
  const year = Number(raw.year ?? 0);
  const month = Number(raw.month ?? 0);
  if (year <= 0 || month <= 0 || month > 12) return null;
  return {
    id: snap.id,
    partnerId: String(raw.partnerId ?? ""),
    year,
    month,
    status: normalizeStatus(raw.status),
    partnerName: String(raw.partnerName ?? ""),
    address: String(raw.address ?? ""),
    phone: String(raw.phone ?? ""),
    bankAccount: String(raw.bankAccount ?? ""),
    items: normalizeItems(raw.items),
    submittedAt: raw.submittedAt ? String(raw.submittedAt) : null,
    confirmedAt: raw.confirmedAt ? String(raw.confirmedAt) : null,
    returnedAt: raw.returnedAt ? String(raw.returnedAt) : null,
    adminComment: raw.adminComment ? String(raw.adminComment) : null,
    transferDate: String(raw.transferDate ?? computeTransferDate(year, month)),
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
  };
}

export async function getPartnerInvoice(
  partnerId: string,
  year: number,
  month: number,
): Promise<PartnerInvoiceRow | null> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const snap = await db
      .collection(COLLECTION)
      .doc(invoiceDocId(partnerId, year, month))
      .get();
    return rowFromFirestore(snap);
  }
  return null;
}

export async function listPartnerInvoicesByPartner(
  partnerId: string,
): Promise<PartnerInvoiceRow[]> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    const snap = await db.collection(COLLECTION).where("partnerId", "==", partnerId).get();
    return snap.docs
      .map((d) => rowFromFirestore(d))
      .filter((r): r is PartnerInvoiceRow => r != null)
      .sort((a, b) => b.year * 100 + b.month - (a.year * 100 + a.month));
  }
  return [];
}

export async function listPartnerInvoicesByMonth(
  year: number,
  month: number,
): Promise<PartnerInvoiceRow[]> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    const snap = await db
      .collection(COLLECTION)
      .where("year", "==", year)
      .where("month", "==", month)
      .get();
    return snap.docs
      .map((d) => rowFromFirestore(d))
      .filter((r): r is PartnerInvoiceRow => r != null);
  }
  return [];
}

export async function getPartnerInvoiceById(id: string): Promise<PartnerInvoiceRow | null> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const snap = await db.collection(COLLECTION).doc(id).get();
    return rowFromFirestore(snap);
  }
  return null;
}

export type PartnerInvoiceSaveInput = {
  partnerId: string;
  year: number;
  month: number;
  partnerName: string;
  address: string;
  phone: string;
  bankAccount: string;
  items: PartnerInvoiceItem[];
};

export async function upsertPartnerInvoice(
  input: PartnerInvoiceSaveInput,
): Promise<PartnerInvoiceRow> {
  const now = new Date().toISOString();
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) throw new Error("Firestore is not configured");
    const id = invoiceDocId(input.partnerId, input.year, input.month);
    const ref = db.collection(COLLECTION).doc(id);
    const existing = await ref.get();
    const prev = existing.exists ? (existing.data() as Record<string, unknown>) : null;
    const prevStatus = normalizeStatus(prev?.status);
    // 確定済みは編集を上書き禁止。SUBMITTED 中も再編集不可（差し戻し後は RETURNED で再編集可）。
    if (prevStatus === "CONFIRMED") {
      throw Object.assign(new Error("確定済みのため編集できません。"), { http: 409 });
    }
    if (prevStatus === "SUBMITTED") {
      throw Object.assign(new Error("提出済みのため編集できません。差し戻しを受けてから再編集してください。"), {
        http: 409,
      });
    }
    const data: Record<string, unknown> = {
      partnerId: input.partnerId,
      year: input.year,
      month: input.month,
      status: prevStatus === "RETURNED" ? "RETURNED" : "DRAFT",
      partnerName: input.partnerName.slice(0, 200),
      address: input.address.slice(0, 1000),
      phone: input.phone.slice(0, 200),
      bankAccount: input.bankAccount.slice(0, 1000),
      items: normalizeItems(input.items),
      submittedAt: null,
      confirmedAt: null,
      returnedAt: prev?.returnedAt ?? null,
      adminComment: prev?.adminComment ?? null,
      transferDate: computeTransferDate(input.year, input.month),
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };
    await ref.set(data, { merge: true });
    const fresh = await ref.get();
    const out = rowFromFirestore(fresh);
    if (!out) throw new Error("保存に失敗しました。");
    return out;
  }
  throw new Error("Firestore is required for partner invoices in this environment");
}

export async function submitPartnerInvoice(
  partnerId: string,
  year: number,
  month: number,
): Promise<PartnerInvoiceRow> {
  if (!isFirebaseDataBackend()) {
    throw new Error("Firestore is required for partner invoices in this environment");
  }
  const db = getFirebaseFirestoreClient();
  if (!db) throw new Error("Firestore is not configured");
  const id = invoiceDocId(partnerId, year, month);
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw Object.assign(new Error("先に下書きを保存してください。"), { http: 400 });
  }
  const data = snap.data() as Record<string, unknown>;
  const status = normalizeStatus(data.status);
  if (status === "CONFIRMED") {
    throw Object.assign(new Error("確定済みのため提出できません。"), { http: 409 });
  }
  if (status === "SUBMITTED") {
    throw Object.assign(new Error("既に提出済みです。"), { http: 409 });
  }
  const now = new Date().toISOString();
  await ref.set(
    {
      status: "SUBMITTED",
      submittedAt: now,
      updatedAt: now,
    },
    { merge: true },
  );
  const fresh = await ref.get();
  const out = rowFromFirestore(fresh);
  if (!out) throw new Error("提出に失敗しました。");
  return out;
}

export async function adminConfirmPartnerInvoice(invoiceId: string): Promise<PartnerInvoiceRow> {
  if (!isFirebaseDataBackend()) {
    throw new Error("Firestore is required for partner invoices in this environment");
  }
  const db = getFirebaseFirestoreClient();
  if (!db) throw new Error("Firestore is not configured");
  const ref = db.collection(COLLECTION).doc(invoiceId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw Object.assign(new Error("請求書が見つかりません。"), { http: 404 });
  }
  const now = new Date().toISOString();
  await ref.set(
    {
      status: "CONFIRMED",
      confirmedAt: now,
      adminComment: null,
      updatedAt: now,
    },
    { merge: true },
  );
  const fresh = await ref.get();
  const out = rowFromFirestore(fresh);
  if (!out) throw new Error("確定に失敗しました。");
  return out;
}

export async function adminReturnPartnerInvoice(
  invoiceId: string,
  comment: string | null,
): Promise<PartnerInvoiceRow> {
  if (!isFirebaseDataBackend()) {
    throw new Error("Firestore is required for partner invoices in this environment");
  }
  const db = getFirebaseFirestoreClient();
  if (!db) throw new Error("Firestore is not configured");
  const ref = db.collection(COLLECTION).doc(invoiceId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw Object.assign(new Error("請求書が見つかりません。"), { http: 404 });
  }
  const now = new Date().toISOString();
  await ref.set(
    {
      status: "RETURNED",
      returnedAt: now,
      adminComment: comment ? comment.slice(0, 2000) : null,
      updatedAt: now,
    },
    { merge: true },
  );
  const fresh = await ref.get();
  const out = rowFromFirestore(fresh);
  if (!out) throw new Error("差し戻しに失敗しました。");
  return out;
}
