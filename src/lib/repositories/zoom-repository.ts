import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";

export async function getPartnerZoomProfile(partnerId: string) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const snap = await db.collection("partnerZoomProfiles").doc(partnerId).get();
    if (!snap.exists) return null;
    const raw = snap.data() as Record<string, unknown>;
    return {
      id: partnerId,
      partnerId,
      zoomUrl: String(raw.zoomUrl ?? ""),
      zoomPass: typeof raw.zoomPass === "string" ? raw.zoomPass : null,
    };
  }
  return prisma.partnerZoomProfile.findUnique({ where: { partnerId } });
}

export async function upsertPartnerZoomProfile(input: {
  partnerId: string;
  zoomUrl: string;
  zoomPass: string | null;
}) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) throw new Error("Firestore is not configured");
    await db.collection("partnerZoomProfiles").doc(input.partnerId).set(
      {
        partnerId: input.partnerId,
        zoomUrl: input.zoomUrl,
        zoomPass: input.zoomPass,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    return {
      id: input.partnerId,
      partnerId: input.partnerId,
      zoomUrl: input.zoomUrl,
      zoomPass: input.zoomPass,
    };
  }
  return prisma.partnerZoomProfile.upsert({
    where: { partnerId: input.partnerId },
    update: { zoomUrl: input.zoomUrl, zoomPass: input.zoomPass },
    create: { partnerId: input.partnerId, zoomUrl: input.zoomUrl, zoomPass: input.zoomPass },
  });
}
