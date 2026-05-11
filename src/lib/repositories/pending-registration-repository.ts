import crypto from "node:crypto";
import { getFirebaseFirestoreClient } from "@/lib/firebase-admin";

/**
 * メールアドレス本人確認つき新規登録の一時データ。
 * - クライアントには **平文トークン** をメール URL 経由で渡し、
 *   サーバ側 Firestore には **トークンハッシュ** のみを保存する。
 * - 有効期限 24 時間。期限切れ・使用済みは finish API で弾く。
 */

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export type PendingRegistrationRow = {
  tokenHash: string;
  email: string;
  displayName: string;
  role: "PARTNER" | "CLIENT";
  availabilitySlotIds: string[];
  zoomUrl: string | null;
  zoomMeetingId: string | null;
  zoomPass: string | null;
  expiresAt: string;
  createdAt: string;
};

/** ランダムトークン生成 (平文) + 保存。返り値: { token, expiresAt } */
export async function createPendingRegistration(input: {
  email: string;
  displayName: string;
  role: "PARTNER" | "CLIENT";
  availabilitySlotIds?: string[];
  zoomUrl?: string | null;
  zoomMeetingId?: string | null;
  zoomPass?: string | null;
}): Promise<{ token: string; expiresAt: string }> {
  const db = getFirebaseFirestoreClient();
  if (!db) throw new Error("Firestore is not configured");
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS).toISOString();
  const data: PendingRegistrationRow = {
    tokenHash,
    email: input.email.trim().toLowerCase(),
    displayName: input.displayName.trim().slice(0, 80),
    role: input.role,
    availabilitySlotIds: Array.isArray(input.availabilitySlotIds)
      ? input.availabilitySlotIds.filter((v) => typeof v === "string").slice(0, 64)
      : [],
    zoomUrl: input.zoomUrl?.trim() || null,
    zoomMeetingId: input.zoomMeetingId?.trim() || null,
    zoomPass: input.zoomPass?.trim() || null,
    expiresAt,
    createdAt: now.toISOString(),
  };
  await db.collection("pendingRegistrations").doc(tokenHash).set(data);
  return { token, expiresAt };
}

export async function getPendingRegistrationByToken(token: string): Promise<PendingRegistrationRow | null> {
  const db = getFirebaseFirestoreClient();
  if (!db) return null;
  const snap = await db.collection("pendingRegistrations").doc(hashToken(token)).get();
  if (!snap.exists) return null;
  const data = snap.data() as PendingRegistrationRow | undefined;
  if (!data) return null;
  if (Date.parse(data.expiresAt) < Date.now()) {
    // 期限切れは見つからない扱い + 残骸を消す
    await snap.ref.delete().catch(() => null);
    return null;
  }
  return data;
}

export async function deletePendingRegistrationByToken(token: string) {
  const db = getFirebaseFirestoreClient();
  if (!db) return;
  await db.collection("pendingRegistrations").doc(hashToken(token)).delete().catch(() => null);
}
