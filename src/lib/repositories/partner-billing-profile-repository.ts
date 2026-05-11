import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";

export type PartnerBillingProfileRow = {
  partnerId: string;
  address: string;
  phone: string;
  bankAccount: string;
  updatedAt: string;
};

const COLLECTION = "partnerBillingProfiles";

export async function getPartnerBillingProfile(
  partnerId: string,
): Promise<PartnerBillingProfileRow | null> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const snap = await db.collection(COLLECTION).doc(partnerId).get();
    if (!snap.exists) return null;
    const raw = snap.data() as Record<string, unknown>;
    return {
      partnerId,
      address: String(raw.address ?? ""),
      phone: String(raw.phone ?? ""),
      bankAccount: String(raw.bankAccount ?? ""),
      updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
    };
  }
  // ローカル SQLite では未実装。リクエストは Firestore 経由を前提。
  return null;
}

export async function upsertPartnerBillingProfile(input: {
  partnerId: string;
  address: string;
  phone: string;
  bankAccount: string;
}): Promise<PartnerBillingProfileRow> {
  const now = new Date().toISOString();
  const data: PartnerBillingProfileRow = {
    partnerId: input.partnerId,
    address: input.address.slice(0, 1000),
    phone: input.phone.slice(0, 200),
    bankAccount: input.bankAccount.slice(0, 1000),
    updatedAt: now,
  };
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) throw new Error("Firestore is not configured");
    await db.collection(COLLECTION).doc(input.partnerId).set(data, { merge: true });
    return data;
  }
  return data;
}
