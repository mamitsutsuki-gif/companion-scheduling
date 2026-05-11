import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";

export type PartnerInvoiceUnlockRow = {
  partnerId: string;
  year: number;
  month: number;
  unlockedAt: string;
  unlockedBy: string;
};

const COLLECTION = "partnerInvoiceUnlocks";

function docId(partnerId: string, year: number, month: number) {
  const mm = String(month).padStart(2, "0");
  return `${partnerId}_${year}_${mm}`;
}

export async function isPartnerInvoiceUnlocked(
  partnerId: string,
  year: number,
  month: number,
): Promise<boolean> {
  if (!isFirebaseDataBackend()) return false;
  const db = getFirebaseFirestoreClient();
  if (!db) return false;
  const snap = await db.collection(COLLECTION).doc(docId(partnerId, year, month)).get();
  return snap.exists;
}

export async function listUnlocksForPartner(
  partnerId: string,
): Promise<PartnerInvoiceUnlockRow[]> {
  if (!isFirebaseDataBackend()) return [];
  const db = getFirebaseFirestoreClient();
  if (!db) return [];
  const snap = await db.collection(COLLECTION).where("partnerId", "==", partnerId).get();
  return snap.docs.map((d) => {
    const raw = d.data() as Record<string, unknown>;
    return {
      partnerId: String(raw.partnerId ?? partnerId),
      year: Number(raw.year ?? 0),
      month: Number(raw.month ?? 0),
      unlockedAt: String(raw.unlockedAt ?? new Date().toISOString()),
      unlockedBy: String(raw.unlockedBy ?? ""),
    };
  });
}

export async function setPartnerInvoiceUnlock(input: {
  partnerId: string;
  year: number;
  month: number;
  unlockedBy: string;
}): Promise<PartnerInvoiceUnlockRow> {
  const now = new Date().toISOString();
  const row: PartnerInvoiceUnlockRow = {
    partnerId: input.partnerId,
    year: input.year,
    month: input.month,
    unlockedAt: now,
    unlockedBy: input.unlockedBy,
  };
  if (!isFirebaseDataBackend()) return row;
  const db = getFirebaseFirestoreClient();
  if (!db) return row;
  await db
    .collection(COLLECTION)
    .doc(docId(input.partnerId, input.year, input.month))
    .set(row, { merge: true });
  return row;
}

export async function clearPartnerInvoiceUnlock(
  partnerId: string,
  year: number,
  month: number,
): Promise<void> {
  if (!isFirebaseDataBackend()) return;
  const db = getFirebaseFirestoreClient();
  if (!db) return;
  await db
    .collection(COLLECTION)
    .doc(docId(partnerId, year, month))
    .delete()
    .catch(() => null);
}
