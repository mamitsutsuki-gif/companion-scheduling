import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { normalizeRoleplayStore, type RoleplayStore } from "@/lib/coaching-roleplay";
import { normalizeQuestionStore, type CoachingQuestionStore } from "@/lib/coaching-questions";
import { normalizeIcebreakerStore, type IcebreakerStore } from "@/lib/coaching-icebreaker";
import { normalizeOneOnOneFormat, type OneOnOneFormatDoc } from "@/lib/coaching-one-on-one-format";

const ROLEPLAY_COL = "coachingRoleplay";
const QUESTIONS_COL = "coachingQuestions";
const ICEBREAKER_COL = "coachingIcebreaker";
const FORMAT_COL = "coachingOneOnOneFormat";

async function readUserJsonDoc<T>(
  collection: string,
  userId: string,
  companyId: string,
  fallback: () => T,
  normalize: (d: unknown) => T,
): Promise<T> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return fallback();
    const snap = await db.collection(collection).doc(userId).get();
    if (!snap.exists) return fallback();
    return normalize(snap.data() ?? {});
  }
  const table =
    collection === QUESTIONS_COL
      ? "userCoachingQuestions"
      : collection === ICEBREAKER_COL
        ? "userCoachingIcebreaker"
        : null;
  if (!table) return fallback();
  const row = await (prisma as any)[table]?.findUnique?.({ where: { userId } }).catch(() => null);
  if (!row) return fallback();
  return normalize(row.data);
}

async function writeUserJsonDoc(collection: string, userId: string, companyId: string, data: unknown) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return;
    await db.collection(collection).doc(userId).set({ ...((data as object) ?? {}), userId, companyId }, { merge: true });
    return;
  }
  const table =
    collection === QUESTIONS_COL
      ? "userCoachingQuestions"
      : collection === ICEBREAKER_COL
        ? "userCoachingIcebreaker"
        : null;
  if (!table) return;
  const delegate = (prisma as any)[table];
  if (!delegate?.upsert) return;
  await delegate.upsert({
    where: { userId },
    create: { userId, companyId, data },
    update: { companyId, data },
  });
}

async function readMatchJsonDoc<T>(
  collection: string,
  matchId: string,
  fallback: () => T,
  normalize: (d: unknown) => T,
): Promise<T> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return fallback();
    const snap = await db.collection(collection).doc(matchId).get();
    if (!snap.exists) return fallback();
    return normalize(snap.data() ?? {});
  }
  const table = collection === ROLEPLAY_COL ? "matchCoachingRoleplay" : "matchCoachingOneOnOneFormat";
  const row = await (prisma as any)[table]?.findUnique?.({ where: { matchId } }).catch(() => null);
  if (!row) return fallback();
  return normalize(row.data);
}

async function writeMatchJsonDoc(collection: string, matchId: string, data: unknown) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return;
    await db.collection(collection).doc(matchId).set({ ...((data as object) ?? {}), matchId }, { merge: true });
    return;
  }
  const table = collection === ROLEPLAY_COL ? "matchCoachingRoleplay" : "matchCoachingOneOnOneFormat";
  const delegate = (prisma as any)[table];
  if (!delegate?.upsert) return;
  await delegate.upsert({
    where: { matchId },
    create: { matchId, data },
    update: { data },
  });
}

export async function getRoleplayStore(matchId: string): Promise<RoleplayStore> {
  return readMatchJsonDoc(
    ROLEPLAY_COL,
    matchId,
    () => normalizeRoleplayStore(matchId, {}),
    (d) => normalizeRoleplayStore(matchId, d),
  );
}

export async function saveRoleplayStore(store: RoleplayStore): Promise<RoleplayStore> {
  const next = normalizeRoleplayStore(store.matchId, {
    ...store,
    updatedAt: new Date().toISOString(),
  });
  await writeMatchJsonDoc(ROLEPLAY_COL, store.matchId, next);
  return next;
}

export async function getQuestionStore(userId: string, companyId: string): Promise<CoachingQuestionStore> {
  return readUserJsonDoc(
    QUESTIONS_COL,
    userId,
    companyId,
    () => normalizeQuestionStore(userId, companyId, {}),
    (d) => normalizeQuestionStore(userId, companyId, d),
  );
}

export async function saveQuestionStore(store: CoachingQuestionStore): Promise<CoachingQuestionStore> {
  const next = normalizeQuestionStore(store.userId, store.companyId, {
    ...store,
    updatedAt: new Date().toISOString(),
  });
  await writeUserJsonDoc(QUESTIONS_COL, store.userId, store.companyId, next);
  return next;
}

export async function getIcebreakerStore(userId: string, companyId: string): Promise<IcebreakerStore> {
  return readUserJsonDoc(
    ICEBREAKER_COL,
    userId,
    companyId,
    () => normalizeIcebreakerStore(userId, companyId, {}),
    (d) => normalizeIcebreakerStore(userId, companyId, d),
  );
}

export async function saveIcebreakerStore(store: IcebreakerStore): Promise<IcebreakerStore> {
  const next = normalizeIcebreakerStore(store.userId, store.companyId, {
    ...store,
    updatedAt: new Date().toISOString(),
  });
  await writeUserJsonDoc(ICEBREAKER_COL, store.userId, store.companyId, next);
  return next;
}

export async function getOneOnOneFormat(matchId: string): Promise<OneOnOneFormatDoc> {
  return readMatchJsonDoc(
    FORMAT_COL,
    matchId,
    () => normalizeOneOnOneFormat(matchId, {}),
    (d) => normalizeOneOnOneFormat(matchId, d),
  );
}

export async function saveOneOnOneFormat(doc: OneOnOneFormatDoc): Promise<OneOnOneFormatDoc> {
  const next = normalizeOneOnOneFormat(doc.matchId, {
    ...doc,
    updatedAt: new Date().toISOString(),
  });
  await writeMatchJsonDoc(FORMAT_COL, doc.matchId, next);
  return next;
}
