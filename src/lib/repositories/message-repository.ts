import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { getUserMapByIds } from "@/lib/repositories/user-repository";

export type MessageAudience = "ALL" | "CLIENT" | "PARTNER";

type MessageRow = {
  id: string;
  matchId: string;
  senderId: string;
  body: string;
  kind?: string;
  payload?: unknown;
  audience?: MessageAudience;
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
    audience: (msg.audience ?? "ALL") as MessageAudience,
    createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt,
    sender: { displayName: sender.displayName, role: sender.role },
  };
}

function asAudience(value: unknown): MessageAudience {
  return value === "CLIENT" || value === "PARTNER" ? value : "ALL";
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
        audience: asAudience(raw.audience),
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

export function filterMessagesForViewer<T extends { audience: MessageAudience }>(
  messages: T[],
  viewerRole: "ADMIN" | "PARTNER" | "CLIENT",
): T[] {
  if (viewerRole === "ADMIN") return messages;
  return messages.filter((m) => m.audience === "ALL" || m.audience === viewerRole);
}

export async function createMessage(input: {
  matchId: string;
  senderId: string;
  body: string;
  kind?: string;
  payload?: unknown;
  audience?: MessageAudience;
}) {
  const audience: MessageAudience = input.audience ?? "ALL";
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
      audience,
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
        audience,
      },
    });
    return { id: row.id };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    if (error.message.includes("Unknown argument `audience`")) {
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
    }
    if (error.message.includes("Unknown argument `kind`")) {
      const row = await prisma.message.create({
        data: { matchId: input.matchId, senderId: input.senderId, body: input.body },
      });
      return { id: row.id };
    }
    throw error;
  }
}
