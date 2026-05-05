import "dotenv/config";
import { getFirebaseFirestoreClient, isFirebaseAdminConfigured } from "../src/lib/firebase-admin";

async function main() {
  if (process.env.DATA_BACKEND !== "firebase") {
    console.error("[smoke] DATA_BACKEND is not firebase.");
    process.exit(1);
  }
  if (!isFirebaseAdminConfigured()) {
    console.error(
      "[smoke] Firebase Admin credentials are missing. Set service-account env vars OR ADC (GOOGLE_APPLICATION_CREDENTIALS / GOOGLE_CLOUD_PROJECT).",
    );
    process.exit(1);
  }

  const db = getFirebaseFirestoreClient();
  if (!db) {
    console.error("[smoke] Failed to initialize Firestore client.");
    process.exit(1);
  }

  const settingsRef = db.collection("appSettings").doc("app");
  const settingsSnap = await settingsRef.get();
  if (!settingsSnap.exists) {
    await settingsRef.set({
      id: "app",
      slotDurationMinutes: 30,
      timezone: "Asia/Tokyo",
      updatedAt: new Date().toISOString(),
    });
    console.log("[smoke] appSettings/app created.");
  } else {
    console.log("[smoke] appSettings/app exists.");
  }

  const collectionNames = [
    "users",
    "matches",
    "messages",
    "negotiations",
    "partnerZoomProfiles",
    "passwordResetTokens",
  ];

  for (const name of collectionNames) {
    const snap = await db.collection(name).limit(1).get();
    console.log(`[smoke] collection ${name}: ${snap.size > 0 ? "ok" : "empty"}`);
  }

  console.log("[smoke] Firebase backend reachable.");
}

void main().catch((error) => {
  console.error("[smoke] failed:", error);
  process.exit(1);
});
