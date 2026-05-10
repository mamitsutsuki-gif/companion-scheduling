import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";

type UserView = {
  id: string;
  displayName: string;
  role: Role;
  firebaseUid: string | null;
  googleSub: string | null;
  email: string;
  deletedAt?: string | null;
  createdAt?: Date | string;
  availabilitySlotIds: string[];
};

function asRole(input: unknown): Role {
  return input === "ADMIN" || input === "PARTNER" || input === "CLIENT" ? input : "CLIENT";
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

export async function listAdminVisibleUsers(role?: "ADMIN" | "PARTNER" | "CLIENT") {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    const snap = await db.collection("users").get();
    const rows = snap.docs
      .map((doc) => userFromDoc(doc.id, doc.data() as Record<string, unknown>))
      .filter((u) =>
        role ? u.role === role : u.role === "ADMIN" || u.role === "PARTNER" || u.role === "CLIENT",
      );
    return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  try {
    const rows = await prisma.user.findMany({
      where: role ? { role } : { role: { in: ["ADMIN", "PARTNER", "CLIENT"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        displayName: true,
        role: true,
        email: true,
        firebaseUid: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({ ...r, availabilitySlotIds: [] as string[] }));
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Unknown field `firebaseUid`")) throw error;
    const rows = await prisma.user.findMany({
      where: role ? { role } : { role: { in: ["ADMIN", "PARTNER", "CLIENT"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        displayName: true,
        role: true,
        email: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({ ...r, firebaseUid: null, availabilitySlotIds: [] as string[] }));
  }
}

/**
 * 管理者によるユーザー削除（論理削除）。
 * 過去ログ（マッチ・チャット・調整・FTAなど）はすべて保持しつつ、
 * 当該ユーザーは以後ログインできない状態にする。
 *
 * - users ドキュメント / Prisma 行に deletedAt をセット
 * - email / firebaseUid / googleSub の **uniqueness を解放** するため、
 *   末尾に `_deleted_<unix>` を付けてリネーム
 *   （新規登録の重複を妨げず、検索で漏れない）
 * - Firebase Auth 上のアカウントを disable（ログイン時に Firebase 側で弾かれる）
 */
export async function deleteUserAsAdmin(userId: string) {
  const ts = Date.now();
  const suffix = `__deleted_${ts}`;

  // Firebase Auth: 該当 uid を disable する（DATA_BACKEND 問わず常に試みる）
  async function disableFirebaseAuthIfPossible(firebaseUid: string | null | undefined) {
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
      await getAuth().updateUser(firebaseUid, { disabled: true });
    } catch (error) {
      console.warn("[user-delete] failed to disable firebase auth user", error);
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
    const email = typeof raw.email === "string" ? raw.email : "";
    const googleSub = typeof raw.googleSub === "string" ? raw.googleSub : null;

    await userRef.set(
      {
        deletedAt: new Date().toISOString(),
        email: email ? `${email}${suffix}` : email,
        firebaseUid: firebaseUid ? `${firebaseUid}${suffix}` : null,
        googleSub: googleSub ? `${googleSub}${suffix}` : null,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    await disableFirebaseAuthIfPossible(firebaseUid);
    return { ok: true as const };
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { firebaseUid: true, email: true, googleSub: true },
    });
    if (!existing) return { ok: false as const, error: "ユーザーが見つかりません。", status: 404 };

    await prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        email: `${existing.email}${suffix}`,
        firebaseUid: existing.firebaseUid ? `${existing.firebaseUid}${suffix}` : null,
        googleSub: existing.googleSub ? `${existing.googleSub}${suffix}` : null,
      },
    });
    await disableFirebaseAuthIfPossible(existing.firebaseUid);
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
      select: { id: true, displayName: true, role: true, email: true, firebaseUid: true, googleSub: true },
    });
    return { ...row, deletedAt: null, availabilitySlotIds: [] as string[] };
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Unknown field `firebaseUid`")) throw error;
    const row = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, displayName: true, role: true, email: true },
    });
    return { ...row, firebaseUid: null, googleSub: null, deletedAt: null, availabilitySlotIds: [] as string[] };
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

export async function listAdminEmails() {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    const snap = await db.collection("users").where("role", "==", "ADMIN").get();
    return [...new Set(snap.docs.map((d) => String((d.data() as Record<string, unknown>).email ?? "").trim()).filter(Boolean))];
  }
  const rows = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { email: true },
  });
  return [...new Set(rows.map((r) => r.email.trim()).filter(Boolean))];
}
