import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function readMultiline(input: string | undefined) {
  if (!input) return "";
  return input.replace(/\\n/g, "\n").trim();
}

export function isFirebaseAdminConfigured() {
  const hasServiceAccountKey = Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
  );
  const hasAdc =
    Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS) || Boolean(process.env.GOOGLE_CLOUD_PROJECT);
  return hasServiceAccountKey || hasAdc;
}

export function isFirebaseDataBackend() {
  return process.env.DATA_BACKEND === "firebase";
}

function getFirebaseAdminApp() {
  if (getApps().length > 0) return getApps()[0]!;
  const hasServiceAccountKey = Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
  );
  try {
    if (hasServiceAccountKey) {
      return initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: readMultiline(process.env.FIREBASE_PRIVATE_KEY),
        }),
      });
    }
    return initializeApp({
      credential: applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
    });
  } catch {
    return null;
  }
}

export async function verifyFirebaseIdToken(idToken: string) {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  const auth = getAuth(app);
  return auth.verifyIdToken(idToken);
}

export function getFirebaseFirestoreClient() {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  return getFirestore(app);
}

/** Firebase Auth に登録されたメール（Firestore に email が無い場合の通知用フォールバック） */
export async function getFirebaseAuthUserEmail(uid: string): Promise<string | null> {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  try {
    const rec = await getAuth(app).getUser(uid);
    return rec.email?.trim().toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function getFirebaseAuthAdmin() {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  return getAuth(app);
}

function isAuthUserNotFound(error: unknown): boolean {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  return code === "auth/user-not-found";
}

/** メールアドレスに紐づく Firebase Auth ユーザーが存在するか */
export async function firebaseAuthUserExistsByEmail(email: string): Promise<boolean> {
  const auth = getFirebaseAuthAdmin();
  if (!auth) return false;
  try {
    await auth.getUserByEmail(email.trim().toLowerCase());
    return true;
  } catch (error) {
    if (isAuthUserNotFound(error)) return false;
    console.warn("[firebase-admin] getUserByEmail failed", { email, error });
    return true;
  }
}

/** Firebase Auth ユーザーを UID で削除（存在しない場合は成功扱い） */
export async function deleteFirebaseAuthUserByUid(uid: string): Promise<boolean> {
  const auth = getFirebaseAuthAdmin();
  if (!auth) return false;
  const cleanUid = uid.replace(/__deleted_\d+/g, "");
  try {
    await auth.deleteUser(cleanUid);
    return true;
  } catch (error) {
    if (isAuthUserNotFound(error)) return true;
    if (cleanUid !== uid) {
      try {
        await auth.deleteUser(uid);
        return true;
      } catch (retryError) {
        if (isAuthUserNotFound(retryError)) return true;
        console.warn("[firebase-admin] deleteUser by uid failed", { uid, cleanUid, retryError });
      }
    } else {
      console.warn("[firebase-admin] deleteUser by uid failed", { uid, error });
    }
    return false;
  }
}

/** Firebase Auth ユーザーをメールアドレスで削除（存在しない場合は成功扱い） */
export async function deleteFirebaseAuthUserByEmail(email: string): Promise<boolean> {
  const auth = getFirebaseAuthAdmin();
  if (!auth) return false;
  try {
    const rec = await auth.getUserByEmail(email.trim().toLowerCase());
    await auth.deleteUser(rec.uid);
    return true;
  } catch (error) {
    if (isAuthUserNotFound(error)) return true;
    console.warn("[firebase-admin] deleteUser by email failed", { email, error });
    return false;
  }
}

/**
 * Admin SDK で Firebase Auth に新規ユーザーを作成する。
 * メール本文のリンクを踏んで来た本人だけが叩く finish API で使う。
 * 失敗時は throw（呼び出し側で 4xx を返すこと）。
 */
export async function createFirebaseAuthUserWithPassword(input: {
  email: string;
  password: string;
  displayName: string;
}): Promise<{ uid: string }> {
  const app = getFirebaseAdminApp();
  if (!app) throw new Error("Firebase Admin SDK is not configured");
  const rec = await getAuth(app).createUser({
    email: input.email,
    password: input.password,
    displayName: input.displayName,
    emailVerified: true,
  });
  return { uid: rec.uid };
}
