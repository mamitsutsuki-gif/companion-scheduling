import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { getFirebaseFirestoreClient, isFirebaseAdminConfigured } from "../src/lib/firebase-admin";

const prisma = new PrismaClient();

type Counters = Record<string, number>;

function toIso(input: Date | string | null | undefined) {
  if (!input) return null;
  return input instanceof Date ? input.toISOString() : input;
}

async function migrateAppSettings(counters: Counters) {
  const row = await prisma.appSettings.findUnique({ where: { id: "app" } });
  if (!row) return;
  const db = getFirebaseFirestoreClient();
  if (!db) throw new Error("Firestore is not configured");
  await db.collection("appSettings").doc("app").set(
    {
      id: "app",
      slotDurationMinutes: row.slotDurationMinutes,
      totalSessions: (row as { totalSessions?: number }).totalSessions ?? 6,
      timezone: row.timezone,
      updatedAt: toIso(row.updatedAt),
    },
    { merge: true },
  );
  counters.appSettings = 1;
}

async function migrateUsers(counters: Counters) {
  const rows = await prisma.user.findMany();
  const db = getFirebaseFirestoreClient();
  if (!db) throw new Error("Firestore is not configured");
  for (const row of rows) {
    await db.collection("users").doc(row.id).set(
      {
        email: row.email,
        passwordHash: row.passwordHash ?? null,
        displayName: row.displayName,
        role: row.role,
        googleSub: row.googleSub ?? null,
        firebaseUid: row.firebaseUid ?? null,
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
      },
      { merge: true },
    );
  }
  counters.users = rows.length;
}

async function migrateMatches(counters: Counters) {
  const rows = await prisma.match.findMany();
  const db = getFirebaseFirestoreClient();
  if (!db) throw new Error("Firestore is not configured");
  for (const row of rows) {
    await db.collection("matches").doc(row.id).set(
      {
        partnerId: row.partnerId,
        clientId: row.clientId,
        createdAt: toIso(row.createdAt),
      },
      { merge: true },
    );
  }
  counters.matches = rows.length;
}

async function migrateMessages(counters: Counters) {
  const rows = await prisma.message.findMany();
  const db = getFirebaseFirestoreClient();
  if (!db) throw new Error("Firestore is not configured");
  for (const row of rows) {
    await db.collection("messages").doc(row.id).set(
      {
        matchId: row.matchId,
        senderId: row.senderId,
        body: row.body,
        kind: row.kind,
        payload: row.payload ?? null,
        createdAt: toIso(row.createdAt),
      },
      { merge: true },
    );
  }
  counters.messages = rows.length;
}

async function migrateNegotiations(counters: Counters) {
  const rows = await prisma.negotiation.findMany({
    include: { slots: true },
  });
  const db = getFirebaseFirestoreClient();
  if (!db) throw new Error("Firestore is not configured");
  for (const row of rows) {
    await db.collection("negotiations").doc(row.id).set(
      {
        matchId: row.matchId,
        sessionNumber: (row as { sessionNumber?: number }).sessionNumber ?? 1,
        round: row.round,
        status: row.status,
        slots: row.slots.map((slot) => ({
          id: slot.id,
          startAt: toIso(slot.startAt),
          endAt: toIso(slot.endAt),
          clientVote: slot.clientVote ?? null,
          isConfirmed: slot.isConfirmed,
        })),
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
      },
      { merge: true },
    );
  }
  counters.negotiations = rows.length;
}

async function migratePartnerZoomProfiles(counters: Counters) {
  const rows = await prisma.partnerZoomProfile.findMany();
  const db = getFirebaseFirestoreClient();
  if (!db) throw new Error("Firestore is not configured");
  for (const row of rows) {
    await db.collection("partnerZoomProfiles").doc(row.id).set(
      {
        partnerId: row.partnerId,
        zoomUrl: row.zoomUrl,
        zoomMeetingId: (row as unknown as { zoomMeetingId?: string | null }).zoomMeetingId ?? null,
        zoomPass: row.zoomPass ?? null,
        updatedAt: toIso(row.updatedAt),
      },
      { merge: true },
    );
  }
  counters.partnerZoomProfiles = rows.length;
}

async function migratePasswordResetTokens(counters: Counters) {
  const rows = await prisma.passwordResetToken.findMany();
  const db = getFirebaseFirestoreClient();
  if (!db) throw new Error("Firestore is not configured");
  for (const row of rows) {
    await db.collection("passwordResetTokens").doc(row.id).set(
      {
        tokenHash: row.tokenHash,
        userId: row.userId,
        expiresAt: toIso(row.expiresAt),
        createdAt: toIso(row.createdAt),
      },
      { merge: true },
    );
  }
  counters.passwordResetTokens = rows.length;
}

async function migrateFta(counters: Counters) {
  const rows = await prisma.userFta.findMany();
  const db = getFirebaseFirestoreClient();
  if (!db) throw new Error("Firestore is not configured");
  for (const row of rows) {
    await db.collection("userFta").doc(row.userId).set(
      {
        userId: row.userId,
        data: row.data,
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
      },
      { merge: true },
    );
  }
  counters.userFta = rows.length;
}

async function migrateAvailabilityTemplates(counters: Counters) {
  const rows = await prisma.availabilityTemplate.findMany();
  const db = getFirebaseFirestoreClient();
  if (!db) throw new Error("Firestore is not configured");
  for (const row of rows) {
    await db.collection("availabilityTemplates").doc(row.id).set(
      {
        userId: row.userId,
        weekday: row.weekday,
        startMinutes: row.startMinutes,
        endMinutes: row.endMinutes,
      },
      { merge: true },
    );
  }
  counters.availabilityTemplates = rows.length;
}

async function main() {
  if (process.env.DATA_BACKEND !== "firebase") {
    throw new Error("DATA_BACKEND must be firebase.");
  }
  if (!isFirebaseAdminConfigured()) {
    throw new Error("Firebase Admin is not configured.");
  }

  const counters: Counters = {};
  await migrateAppSettings(counters);
  await migrateUsers(counters);
  await migrateMatches(counters);
  await migrateMessages(counters);
  await migrateNegotiations(counters);
  await migratePartnerZoomProfiles(counters);
  await migratePasswordResetTokens(counters);
  await migrateFta(counters);
  await migrateAvailabilityTemplates(counters);

  console.log("[migrate] SQLite -> Firestore completed.");
  for (const [name, count] of Object.entries(counters)) {
    console.log(`[migrate] ${name}: ${count}`);
  }
}

main()
  .catch((error) => {
    console.error("[migrate] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
