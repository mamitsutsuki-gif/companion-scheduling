import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";

type UserView = {
  id: string;
  displayName: string;
  role: Role;
  firebaseUid: string | null;
  email: string;
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
    email: String(data.email ?? "").toLowerCase(),
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

  return prisma.user.findFirst({
    where: { OR: [{ firebaseUid: params.firebaseUid }, { email: params.email }] },
    select: { id: true, displayName: true, role: true, firebaseUid: true, email: true },
  });
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

  return prisma.user.create({
    data: {
      email: params.email,
      displayName: params.displayName,
      role: "CLIENT",
      firebaseUid: params.firebaseUid,
    },
    select: { id: true, displayName: true, role: true, firebaseUid: true, email: true },
  });
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

  return prisma.user.update({
    where: { id: userId },
    data: { firebaseUid },
    select: { id: true, displayName: true, role: true, firebaseUid: true, email: true },
  });
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

export async function deleteUserAsAdmin(userId: string) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return { ok: false as const, error: "Firestore 未設定です。" };
    const userRef = db.collection("users").doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return { ok: false as const, error: "ユーザーが見つかりません。", status: 404 };

    const [asPartner, asClient, partnerZoom] = await Promise.all([
      db.collection("matches").where("partnerId", "==", userId).get(),
      db.collection("matches").where("clientId", "==", userId).get(),
      db.collection("partnerZoomProfiles").where("partnerId", "==", userId).get(),
    ]);
    const matchIds = new Set<string>([
      ...asPartner.docs.map((d) => d.id),
      ...asClient.docs.map((d) => d.id),
    ]);

    const messageRefs: unknown[] = [];
    const negotiationRefs: unknown[] = [];
    for (const matchId of matchIds) {
      const [msgSnap, negSnap] = await Promise.all([
        db.collection("messages").where("matchId", "==", matchId).get(),
        db.collection("negotiations").where("matchId", "==", matchId).get(),
      ]);
      msgSnap.docs.forEach((d) => messageRefs.push(d.ref));
      negSnap.docs.forEach((d) => negotiationRefs.push(d.ref));
    }

    const refs: any[] = [
      userRef,
      ...asPartner.docs.map((d) => d.ref),
      ...asClient.docs.map((d) => d.ref),
      ...partnerZoom.docs.map((d) => d.ref),
      ...(messageRefs as object[]),
      ...(negotiationRefs as object[]),
    ];
    const chunk = 450;
    for (let i = 0; i < refs.length; i += chunk) {
      const batch = db.batch();
      refs.slice(i, i + chunk).forEach((r) => batch.delete(r));
      await batch.commit();
    }
    return { ok: true as const };
  }

  try {
    await prisma.user.delete({ where: { id: userId } });
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
    return await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, displayName: true, role: true, email: true, firebaseUid: true },
    });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Unknown field `firebaseUid`")) throw error;
    const row = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, displayName: true, role: true, email: true },
    });
    return { ...row, firebaseUid: null };
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
      availabilitySlotIds: asStringArray(raw.availabilitySlotIds),
    };
  }
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, displayName: true, role: true, email: true },
  });
  if (!row) return null;
  return { ...row, availabilitySlotIds: [] as string[] };
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
