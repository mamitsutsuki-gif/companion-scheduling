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
