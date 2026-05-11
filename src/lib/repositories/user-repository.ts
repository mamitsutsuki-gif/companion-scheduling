import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import {
  getFirebaseAuthUserEmail,
  getFirebaseFirestoreClient,
  isFirebaseDataBackend,
} from "@/lib/firebase-admin";

type UserView = {
  id: string;
  displayName: string;
  role: Role;
  firebaseUid: string | null;
  googleSub: string | null;
  email: string;
  deletedAt?: string | null;
  companyId?: string | null;
  createdAt?: Date | string;
  availabilitySlotIds: string[];
};

function asRole(input: unknown): Role {
  return input === "ADMIN" ||
    input === "PARTNER" ||
    input === "CLIENT" ||
    input === "CLIENT_ADMIN"
    ? input
    : "CLIENT";
}

function asStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((v): v is string => typeof v === "string");
}

function userFromDoc(id: string, data: Record<string, unknown>): UserView {
  return {
    id,
    displayName: String(data.displayName ?? "ユーザー"),
    role: asRole(data.role),
    firebaseUid: typeof data.firebaseUid === "string" ? data.firebaseUid : null,
    googleSub: typeof data.googleSub === "string" ? data.googleSub : null,
    email: String(data.email ?? "").toLowerCase(),
    deletedAt: typeof data.deletedAt === "string" ? data.deletedAt : null,
    companyId: typeof data.companyId === "string" ? data.companyId : null,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : new Date(),
    availabilitySlotIds: asStringArray(data.availabilitySlotIds),
  };
}

export async function findUserForFirebaseLogin(params: { email: string; firebaseUid: string }) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const users = db.collection("users");

    const byUid = await users.where("firebaseUid", "==", params.firebaseUid).limit(1).get();
    if (!byUid.empty) {
      const d = byUid.docs[0]!;
      return userFromDoc(d.id, d.data() as Record<string, unknown>);
    }
    const byEmail = await users.where("email", "==", params.email).limit(1).get();
    if (!byEmail.empty) {
      const d = byEmail.docs[0]!;
      return userFromDoc(d.id, d.data() as Record<string, unknown>);
    }
    return null;
  }

  try {
    const row = await prisma.user.findFirst({
      where: { OR: [{ firebaseUid: params.firebaseUid }, { email: params.email }] },
      select: {
        id: true,
        displayName: true,
        role: true,
        firebaseUid: true,
        googleSub: true,
        email: true,
        deletedAt: true,
      },
    });
    if (!row) return null;
    return {
      ...row,
      deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
      availabilitySlotIds: [] as string[],
    };
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Unknown field `deletedAt`")) throw error;
    const row = await prisma.user.findFirst({
      where: { OR: [{ firebaseUid: params.firebaseUid }, { email: params.email }] },
      select: { id: true, displayName: true, role: true, firebaseUid: true, googleSub: true, email: true },
    });
    if (!row) return null;
    return { ...row, deletedAt: null, availabilitySlotIds: [] as string[] };
  }
}

/**
 * メール（小文字化）で既存ユーザーを引く。重複登録判定用。
 * Firebase バックエンドのみ実装（本フローは Firestore 想定）。
 */
export async function findUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const snap = await db.collection("users").where("email", "==", normalized).limit(1).get();
    if (snap.empty) return null;
    const d = snap.docs[0]!;
    return userFromDoc(d.id, d.data() as Record<string, unknown>);
  }
  try {
    const row = await prisma.user.findFirst({
      where: { email: normalized },
      select: {
        id: true,
        displayName: true,
        role: true,
        firebaseUid: true,
        googleSub: true,
        email: true,
        deletedAt: true,
      },
    });
    if (!row) return null;
    return {
      ...row,
      deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
      availabilitySlotIds: [] as string[],
    };
  } catch {
    return null;
  }
}

/** soft-delete されたユーザーかを判定 */
export function isDeletedUser(user: { deletedAt?: string | Date | null } | null | undefined) {
  if (!user) return false;
  const v = user.deletedAt;
  if (!v) return false;
  if (typeof v === "string") return v.trim().length > 0;
  return v instanceof Date && !Number.isNaN(v.valueOf());
}

export async function createFirebaseUser(params: {
  email: string;
  displayName: string;
  firebaseUid: string;
  availabilitySlotIds?: string[];
}) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) throw new Error("Firestore is not configured");
    const id = params.firebaseUid;
    const data = {
      email: params.email.toLowerCase(),
      displayName: params.displayName,
      role: "CLIENT",
      firebaseUid: params.firebaseUid,
      availabilitySlotIds: asStringArray(params.availabilitySlotIds),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.collection("users").doc(id).set(data, { merge: true });
    return userFromDoc(id, data);
  }

  const created = await prisma.user.create({
    data: {
      email: params.email,
      displayName: params.displayName,
      role: "CLIENT",
      firebaseUid: params.firebaseUid,
    },
    select: { id: true, displayName: true, role: true, firebaseUid: true, googleSub: true, email: true },
  });
  return { ...created, deletedAt: null, availabilitySlotIds: [] as string[] };
}

export async function updateUserAvailability(userId: string, availabilitySlotIds: string[]) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const ref = db.collection("users").doc(userId);
    await ref.set(
      {
        availabilitySlotIds: asStringArray(availabilitySlotIds),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    const snap = await ref.get();
    if (!snap.exists) return null;
    return userFromDoc(snap.id, snap.data() as Record<string, unknown>);
  }
  return null;
}

export async function attachFirebaseUid(userId: string, firebaseUid: string) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) throw new Error("Firestore is not configured");
    const ref = db.collection("users").doc(userId);
    await ref.set({ firebaseUid, updatedAt: new Date().toISOString() }, { merge: true });
    const snap = await ref.get();
    if (!snap.exists) return null;
    return userFromDoc(snap.id, snap.data() as Record<string, unknown>);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { firebaseUid },
    select: { id: true, displayName: true, role: true, firebaseUid: true, googleSub: true, email: true },
  });
  return { ...updated, deletedAt: null, availabilitySlotIds: [] as string[] };
}

/**
 * 削除済み（ハード削除前の旧仕様の soft-delete レコード）を識別する。
 * 旧 soft-delete は email を `<元のemail>__deleted_<unix>` に書き換えていたため、
 * 互換のためにここで弾く。
 */
function isStaleDeletedRow(u: {
  email?: string | null;
  firebaseUid?: string | null;
  deletedAt?: string | Date | null;
}): boolean {
  if (isDeletedUser(u)) return true;
  const email = (u.email ?? "").toString();
  const uid = (u.firebaseUid ?? "").toString();
  return email.includes("__deleted_") || uid.includes("__deleted_");
}

export async function listAdminVisibleUsers(role?: "ADMIN" | "PARTNER" | "CLIENT" | "CLIENT_ADMIN") {
  const allRoles = ["ADMIN", "PARTNER", "CLIENT", "CLIENT_ADMIN"] as const;
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    const snap = await db.collection("users").get();
    const rows = snap.docs
      .map((doc) => userFromDoc(doc.id, doc.data() as Record<string, unknown>))
      .filter((u) => (role ? u.role === role : (allRoles as readonly string[]).includes(u.role)))
      .filter((u) => !isStaleDeletedRow(u));
    return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  try {
    const rows = await prisma.user.findMany({
      where: role ? { role } : { role: { in: [...allRoles] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        displayName: true,
        role: true,
        email: true,
        firebaseUid: true,
        companyId: true,
        createdAt: true,
        deletedAt: true,
      },
    });
    return rows
      .filter((r) => !isStaleDeletedRow(r))
      .map((r) => ({ ...r, availabilitySlotIds: [] as string[] }));
  } catch (error) {
    if (!(error instanceof Error) || !/Unknown field `(firebaseUid|companyId|deletedAt)`/.test(error.message))
      throw error;
    const rows = await prisma.user.findMany({
      where: role ? { role } : { role: { in: [...allRoles] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        displayName: true,
        role: true,
        email: true,
        createdAt: true,
      },
    });
    return rows
      .filter((r) => !isStaleDeletedRow(r))
      .map((r) => ({
        ...r,
        firebaseUid: null,
        companyId: null,
        availabilitySlotIds: [] as string[],
      }));
  }
}

/** クライアント / クライアント管理者の所属企業 ID を更新（管理者専用） */
export async function setUserCompany(userId: string, companyId: string | null) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const ref = db.collection("users").doc(userId);
    await ref.set(
      { companyId: companyId ?? null, updatedAt: new Date().toISOString() },
      { merge: true },
    );
    const snap = await ref.get();
    return snap.exists ? userFromDoc(snap.id, snap.data() as Record<string, unknown>) : null;
  }
  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { companyId: companyId ?? null },
      select: { id: true, displayName: true, role: true, email: true, companyId: true },
    });
    return { ...updated, availabilitySlotIds: [] as string[] };
  } catch {
    return null;
  }
}

/** 同じ companyId を持つクライアント / クライアント管理者を一覧（クライアント管理者用） */
export async function listClientsInCompany(companyId: string) {
  if (!companyId) return [];
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    const snap = await db.collection("users").where("companyId", "==", companyId).get();
    return snap.docs
      .map((d) => userFromDoc(d.id, d.data() as Record<string, unknown>))
      .filter(
        (u) => (u.role === "CLIENT" || u.role === "CLIENT_ADMIN") && !isDeletedUser(u),
      );
  }
  try {
    const rows = await prisma.user.findMany({
      where: {
        companyId,
        role: { in: ["CLIENT", "CLIENT_ADMIN"] },
        deletedAt: null,
      },
      select: { id: true, displayName: true, role: true, email: true, companyId: true },
      orderBy: { displayName: "asc" },
    });
    return rows.map((r) => ({ ...r, availabilitySlotIds: [] as string[] }));
  } catch {
    return [];
  }
}

/**
 * 管理者によるユーザー削除（ハード削除）。
 * - `users/<id>` ドキュメントを削除し、メールアドレスを再登録可能にする
 * - Firebase Auth 上のアカウントを **完全に削除** する（disable ではなく deleteUser）
 *   これにより、同じメールアドレスで新規登録すると別アカウントが作られる
 * - 個人プロフィール系（zoom 設定 / 請求書プロフィール / 自分FTA / 編集アンロック）も
 *   合わせて掃除する。マッチ・チャット・通知などの履歴ドキュメントは残す
 *   （userId 参照は残り、UI 側で「不明なユーザー」として安全に表示される想定）。
 */
export async function deleteUserAsAdmin(userId: string) {
  // Firebase Auth: 該当 uid を完全に削除する（DATA_BACKEND 問わず常に試みる）
  async function deleteFirebaseAuthUserIfPossible(firebaseUid: string | null | undefined) {
    if (!firebaseUid) return;
    try {
      const { isFirebaseAdminConfigured } = await import("@/lib/firebase-admin");
      if (!isFirebaseAdminConfigured()) return;
      const { getApps, initializeApp, applicationDefault, cert } = await import(
        "firebase-admin/app"
      );
      const { getAuth } = await import("firebase-admin/auth");
      if (!getApps().length) {
        const hasKey = Boolean(
          process.env.FIREBASE_PROJECT_ID &&
            process.env.FIREBASE_CLIENT_EMAIL &&
            process.env.FIREBASE_PRIVATE_KEY,
        );
        if (hasKey) {
          initializeApp({
            credential: cert({
              projectId: process.env.FIREBASE_PROJECT_ID,
              clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
              privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").trim(),
            }),
          });
        } else {
          initializeApp({
            credential: applicationDefault(),
            projectId: process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
          });
        }
      }
      // 旧仕様で `__deleted_<unix>` が末尾に追加された UID を渡された場合も想定し、
      // suffix を取り除いてから削除する。
      const cleanUid = firebaseUid.replace(/__deleted_\d+/g, "");
      try {
        await getAuth().deleteUser(cleanUid);
      } catch (inner) {
        // 元の UID でも試す
        if (cleanUid !== firebaseUid) {
          await getAuth()
            .deleteUser(firebaseUid)
            .catch((e2) => {
              console.warn("[user-delete] failed to delete firebase auth user (both)", e2);
            });
        } else {
          console.warn("[user-delete] failed to delete firebase auth user", inner);
        }
      }
    } catch (error) {
      console.warn("[user-delete] failed to delete firebase auth user", error);
    }
  }

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return { ok: false as const, error: "Firestore 未設定です。" };
    const userRef = db.collection("users").doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return { ok: false as const, error: "ユーザーが見つかりません。", status: 404 };
    const raw = userSnap.data() as Record<string, unknown>;
    const firebaseUid = typeof raw.firebaseUid === "string" ? raw.firebaseUid : null;

    // 個人プロフィール系を best-effort で削除（履歴系は残す）
    const personalCollections = [
      "partnerZoomProfiles",
      "partnerBillingProfiles",
      "userZoomProfiles",
      "myFta",
      "clientFta",
    ];
    await Promise.all(
      personalCollections.map((c) =>
        db
          .collection(c)
          .doc(userId)
          .delete()
          .catch(() => null),
      ),
    );

    // partnerInvoiceUnlocks: partnerId == userId のドキュメントを全削除
    try {
      const unlockSnap = await db
        .collection("partnerInvoiceUnlocks")
        .where("partnerId", "==", userId)
        .get();
      if (!unlockSnap.empty) {
        const batch = db.batch();
        unlockSnap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    } catch {
      /* noop */
    }

    // users ドキュメント自体を完全削除
    await userRef.delete().catch(() => null);

    await deleteFirebaseAuthUserIfPossible(firebaseUid);
    return { ok: true as const };
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { firebaseUid: true, email: true, googleSub: true },
    });
    if (!existing) return { ok: false as const, error: "ユーザーが見つかりません。", status: 404 };

    await prisma.user.delete({ where: { id: userId } }).catch(async () => {
      // Foreign-key 制約が無くなった場合のフォールバック：ローカルでは soft-delete で互換維持
      const ts = Date.now();
      const suffix = `__deleted_${ts}`;
      await prisma.user.update({
        where: { id: userId },
        data: {
          deletedAt: new Date(),
          email: `${existing.email}${suffix}`,
          firebaseUid: existing.firebaseUid ? `${existing.firebaseUid}${suffix}` : null,
          googleSub: existing.googleSub ? `${existing.googleSub}${suffix}` : null,
        },
      });
    });
    await deleteFirebaseAuthUserIfPossible(existing.firebaseUid);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "ユーザー削除に失敗しました。", status: 400 };
  }
}

export async function updateUserRole(userId: string, role: Role) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const ref = db.collection("users").doc(userId);
    await ref.set({ role, updatedAt: new Date().toISOString() }, { merge: true });
    const snap = await ref.get();
    if (!snap.exists) return null;
    return userFromDoc(snap.id, snap.data() as Record<string, unknown>);
  }

  try {
    const row = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        displayName: true,
        role: true,
        email: true,
        firebaseUid: true,
        googleSub: true,
        companyId: true,
      },
    });
    return { ...row, deletedAt: null, availabilitySlotIds: [] as string[] };
  } catch (error) {
    if (!(error instanceof Error) || !/Unknown field `(firebaseUid|companyId)`/.test(error.message))
      throw error;
    const row = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, displayName: true, role: true, email: true },
    });
    return {
      ...row,
      firebaseUid: null,
      googleSub: null,
      companyId: null,
      deletedAt: null,
      availabilitySlotIds: [] as string[],
    };
  }
}

export async function getUserMapByIds(ids: string[]) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (uniq.length === 0) return new Map<string, { displayName: string; role: string }>();

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return new Map();
    const docs = await Promise.all(uniq.map((id) => db.collection("users").doc(id).get()));
    const map = new Map<string, { displayName: string; role: string }>();
    for (const d of docs) {
      if (!d.exists) continue;
      const raw = d.data() as Record<string, unknown>;
      map.set(d.id, {
        displayName: String(raw.displayName ?? "ユーザー"),
        role: String(raw.role ?? "CLIENT"),
      });
    }
    return map;
  }

  const rows = await prisma.user.findMany({
    where: { id: { in: uniq } },
    select: { id: true, displayName: true, role: true },
  });
  return new Map(rows.map((r) => [r.id, { displayName: r.displayName, role: r.role }]));
}

export async function getUserById(userId: string) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const snap = await db.collection("users").doc(userId).get();
    if (!snap.exists) return null;
    const raw = snap.data() as Record<string, unknown>;
    return {
      id: snap.id,
      displayName: String(raw.displayName ?? "ユーザー"),
      role: asRole(raw.role),
      email: typeof raw.email === "string" ? raw.email : null,
      deletedAt: typeof raw.deletedAt === "string" ? raw.deletedAt : null,
      availabilitySlotIds: asStringArray(raw.availabilitySlotIds),
    };
  }
  try {
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true, role: true, email: true, deletedAt: true },
    });
    if (!row) return null;
    return {
      ...row,
      deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
      availabilitySlotIds: [] as string[],
    };
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Unknown field `deletedAt`")) throw error;
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true, role: true, email: true },
    });
    if (!row) return null;
    return { ...row, deletedAt: null, availabilitySlotIds: [] as string[] };
  }
}

export async function getUserEmailById(userId: string) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const snap = await db.collection("users").doc(userId).get();
    if (!snap.exists) return null;
    const raw = snap.data() as Record<string, unknown>;
    return typeof raw.email === "string" ? raw.email : null;
  }
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return row?.email ?? null;
}

/**
 * メール通知用に「確実に届け先を得る」。
 * Firestore の email が空のときは Firebase Auth（ドキュメントID＝UID または firebaseUid フィールド）を参照する。
 */
export async function resolveUserEmailForNotifications(userId: string): Promise<string | null> {
  const fromDoc = await getUserEmailById(userId);
  if (fromDoc?.trim()) return fromDoc.trim().toLowerCase();

  if (!isFirebaseDataBackend()) return null;

  const byUid = await getFirebaseAuthUserEmail(userId);
  if (byUid) return byUid;

  const db = getFirebaseFirestoreClient();
  if (!db) return null;
  const snap = await db.collection("users").doc(userId).get();
  if (!snap.exists) return null;
  const raw = snap.data() as Record<string, unknown>;
  const altUid = typeof raw.firebaseUid === "string" ? raw.firebaseUid.trim() : "";
  if (altUid && altUid !== userId) {
    const e = await getFirebaseAuthUserEmail(altUid);
    if (e) return e;
  }
  return null;
}

export async function listAdminEmails() {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    const snap = await db.collection("users").where("role", "==", "ADMIN").get();
    const resolved = await Promise.all(
      snap.docs.map((d) => resolveUserEmailForNotifications(d.id)),
    );
    return [...new Set(resolved.filter((e): e is string => Boolean(e?.trim())))];
  }
  const rows = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { email: true },
  });
  return [...new Set(rows.map((r) => r.email.trim()).filter(Boolean))];
}
