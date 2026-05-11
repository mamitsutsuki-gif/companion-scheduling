import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";

export type PartnerZoomProfileRow = {
  id: string;
  partnerId: string;
  zoomUrl: string;
  zoomMeetingId: string | null;
  zoomPass: string | null;
};

export async function getPartnerZoomProfile(partnerId: string): Promise<PartnerZoomProfileRow | null> {
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
      zoomMeetingId: typeof raw.zoomMeetingId === "string" ? raw.zoomMeetingId : null,
      zoomPass: typeof raw.zoomPass === "string" ? raw.zoomPass : null,
    };
  }
  const row = await prisma.partnerZoomProfile.findUnique({ where: { partnerId } });
  if (!row) return null;
  return {
    id: row.id,
    partnerId: row.partnerId,
    zoomUrl: row.zoomUrl,
    zoomMeetingId: (row as unknown as { zoomMeetingId?: string | null }).zoomMeetingId ?? null,
    zoomPass: row.zoomPass,
  };
}

export async function upsertPartnerZoomProfile(input: {
  partnerId: string;
  zoomUrl: string;
  zoomMeetingId: string | null;
  zoomPass: string | null;
}): Promise<PartnerZoomProfileRow> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) throw new Error("Firestore is not configured");
    await db.collection("partnerZoomProfiles").doc(input.partnerId).set(
      {
        partnerId: input.partnerId,
        zoomUrl: input.zoomUrl,
        zoomMeetingId: input.zoomMeetingId,
        zoomPass: input.zoomPass,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    return {
      id: input.partnerId,
      partnerId: input.partnerId,
      zoomUrl: input.zoomUrl,
      zoomMeetingId: input.zoomMeetingId,
      zoomPass: input.zoomPass,
    };
  }
  const row = await prisma.partnerZoomProfile.upsert({
    where: { partnerId: input.partnerId },
    update: {
      zoomUrl: input.zoomUrl,
      zoomPass: input.zoomPass,
      ...({ zoomMeetingId: input.zoomMeetingId } as Record<string, unknown>),
    },
    create: {
      partnerId: input.partnerId,
      zoomUrl: input.zoomUrl,
      zoomPass: input.zoomPass,
      ...({ zoomMeetingId: input.zoomMeetingId } as Record<string, unknown>),
    },
  });
  return {
    id: row.id,
    partnerId: row.partnerId,
    zoomUrl: row.zoomUrl,
    zoomMeetingId: (row as unknown as { zoomMeetingId?: string | null }).zoomMeetingId ?? null,
    zoomPass: row.zoomPass,
  };
}
