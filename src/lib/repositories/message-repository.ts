import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { getUserMapByIds } from "@/lib/repositories/user-repository";

type MessageRow = {
  id: string;
  matchId: string;
  senderId: string;
  body: string;
  kind?: string;
  payload?: unknown;
  createdAt: string | Date;
};

function normalizeMessage(msg: MessageRow, sender: { displayName: string; role: string }) {
  return {
    id: msg.id,
    matchId: msg.matchId,
    senderId: msg.senderId,
    body: msg.body,
    kind: msg.kind ?? "STANDARD",
    payload: msg.payload ?? null,
    createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt,
    sender: { displayName: sender.displayName, role: sender.role },
  };
}

export async function listMessagesForMatch(matchId: string) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    const snap = await db.collection("messages").where("matchId", "==", matchId).get();
    const rows: MessageRow[] = snap.docs.map((d) => {
      const raw = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        matchId: String(raw.matchId ?? ""),
        senderId: String(raw.senderId ?? ""),
        body: String(raw.body ?? ""),
        kind: typeof raw.kind === "string" ? raw.kind : "STANDARD",
        payload: raw.payload ?? null,
        createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
      };
    });
    const users = await getUserMapByIds(rows.map((r) => r.senderId));
    return rows
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      .map((row) =>
        normalizeMessage(row, users.get(row.senderId) ?? { displayName: "不明", role: "CLIENT" }),
      );
  }

  const msgs = await prisma.message.findMany({
    where: { matchId },
    orderBy: { createdAt: "asc" },
    include: { sender: { select: { displayName: true, role: true } } },
  });
  return msgs.map((m) => normalizeMessage(m as unknown as MessageRow, m.sender));
}

export async function createMessage(input: {
  matchId: string;
  senderId: string;
  body: string;
  kind?: string;
  payload?: unknown;
}) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) throw new Error("Firestore is not configured");
    const ref = db.collection("messages").doc();
    await ref.set({
      matchId: input.matchId,
      senderId: input.senderId,
      body: input.body,
      kind: input.kind ?? "STANDARD",
      payload: input.payload ?? null,
      createdAt: new Date().toISOString(),
    });
    return { id: ref.id };
  }

  try {
    const row = await prisma.message.create({
      data: {
        matchId: input.matchId,
        senderId: input.senderId,
        body: input.body,
        kind: (input.kind as never) ?? "STANDARD",
        payload: (input.payload as never) ?? undefined,
      },
    });
    return { id: row.id };
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Unknown argument `kind`")) throw error;
    const row = await prisma.message.create({
      data: { matchId: input.matchId, senderId: input.senderId, body: input.body },
    });
    return { id: row.id };
  }
}
