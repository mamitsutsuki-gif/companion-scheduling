import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";
import { companyLabelFromRegistry } from "@/lib/company-display";

type MatchUser = { id: string; displayName: string; email?: string; companyId?: string | null };

export type MatchClientWithCompany = MatchUser & { companyName?: string | null };

async function getUserMap(ids: string[]) {
  const db = getFirebaseFirestoreClient();
  if (!db) return new Map<string, MatchUser>();
  const uniq = [...new Set(ids)];
  const snaps = await Promise.all(uniq.map((id) => db.collection("users").doc(id).get()));
  const map = new Map<string, MatchUser>();
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const data = snap.data() as Record<string, unknown>;
    const cid = data.companyId;
    map.set(snap.id, {
      id: snap.id,
      displayName: String(data.displayName ?? "ユーザー"),
      email: typeof data.email === "string" ? data.email : undefined,
      companyId: typeof cid === "string" ? cid : cid === null ? null : undefined,
    });
  }
  return map;
}

export async function listMatchesForRole(input: { role: Role; userId: string }) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    const all = await db.collection("matches").get();
    type MatchDoc = { id: string; partnerId: string; clientId: string; createdAt: string };
    const docs: MatchDoc[] = all.docs
      .map((d) => {
        const raw = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          partnerId: String(raw.partnerId ?? ""),
          clientId: String(raw.clientId ?? ""),
          createdAt: String(raw.createdAt ?? new Date().toISOString()),
        };
      })
      .filter((m) => {
        if (input.role === "ADMIN" || input.role === "ADMIN_ASSISTANT") return true;
        if (input.role === "PARTNER") return m.partnerId === input.userId;
        return m.clientId === input.userId;
      });

    const users = await getUserMap(
      docs.flatMap((d) => [String(d.partnerId ?? ""), String(d.clientId ?? "")]).filter(Boolean),
    );
    const settings = await getAppSettingsRow();

    return docs
      .map((m) => {
        const partner = users.get(String(m.partnerId ?? "")) ?? {
          id: String(m.partnerId ?? ""),
          displayName: "不明",
        };
        const clientRaw = users.get(String(m.clientId ?? "")) ?? {
          id: String(m.clientId ?? ""),
          displayName: "不明",
        };
        const client: MatchClientWithCompany = {
          ...clientRaw,
          companyName: companyLabelFromRegistry(clientRaw.companyId, settings.companies),
        };
        return {
          id: m.id,
          createdAt: String(m.createdAt ?? new Date().toISOString()),
          partner,
          client,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const settings = await getAppSettingsRow();

  if (input.role === "ADMIN" || input.role === "ADMIN_ASSISTANT") {
    const rows = await prisma.match.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        partner: { select: { id: true, displayName: true, email: true } },
        client: { select: { id: true, displayName: true, email: true, companyId: true } },
      },
    });
    return rows.map((r) => ({
      ...r,
      client: {
        ...r.client,
        companyName: companyLabelFromRegistry(
          (r.client as { companyId?: string | null }).companyId,
          settings.companies,
        ),
      },
    }));
  }

  const where = input.role === "PARTNER" ? { partnerId: input.userId } : { clientId: input.userId };
  const rows = await prisma.match.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      partner: { select: { id: true, displayName: true } },
      client: { select: { id: true, displayName: true, companyId: true } },
    },
  });
  return rows.map((r) => ({
    ...r,
    client: {
      ...r.client,
      companyName: companyLabelFromRegistry(
        (r.client as { companyId?: string | null }).companyId,
        settings.companies,
      ),
    },
  }));
}

export async function createMatchAsAdmin(partnerId: string, clientId: string) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return { ok: false as const, error: "Firestore 未設定です。" };
    const partner = await db.collection("users").doc(partnerId).get();
    const client = await db.collection("users").doc(clientId).get();
    if (!partner.exists || (partner.data()?.role as string) !== "PARTNER") {
      return { ok: false as const, error: "パートナー側のユーザーが不正です。" };
    }
    {
      const r = client.data()?.role as string | undefined;
      if (!client.exists || (r !== "CLIENT" && r !== "CLIENT_ADMIN")) {
        return { ok: false as const, error: "クライアント側のユーザーが不正です。" };
      }
    }
    const dup = await db
      .collection("matches")
      .where("partnerId", "==", partnerId)
      .where("clientId", "==", clientId)
      .limit(1)
      .get();
    if (!dup.empty) return { ok: false as const, error: "この組み合わせのマッチは既に存在します。", status: 409 };

    const ref = db.collection("matches").doc();
    await ref.set({
      partnerId,
      clientId,
      createdAt: new Date().toISOString(),
    });
    return { ok: true as const, matchId: ref.id };
  }

  const [partner, client] = await prisma.$transaction([
    prisma.user.findUnique({ where: { id: partnerId } }),
    prisma.user.findUnique({ where: { id: clientId } }),
  ]);
  if (!partner || partner.role !== "PARTNER") return { ok: false as const, error: "パートナー側のユーザーが不正です。" };
  if (!client || (client.role !== "CLIENT" && client.role !== "CLIENT_ADMIN"))
    return { ok: false as const, error: "クライアント側のユーザーが不正です。" };
  try {
    const match = await prisma.match.create({ data: { partnerId, clientId } });
    return { ok: true as const, matchId: match.id };
  } catch {
    return { ok: false as const, error: "この組み合わせのマッチは既に存在します。", status: 409 };
  }
}

export async function getMatchById(matchId: string) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const snap = await db.collection("matches").doc(matchId).get();
    if (!snap.exists) return null;
    const raw = snap.data() as Record<string, unknown>;
    const users = await getUserMap([String(raw.partnerId ?? ""), String(raw.clientId ?? "")]);
    const partner = users.get(String(raw.partnerId ?? ""));
    const client = users.get(String(raw.clientId ?? ""));
    if (!partner || !client) return null;
    return {
      id: snap.id,
      partnerId: partner.id,
      clientId: client.id,
      partner,
      client,
      createdAt: String(raw.createdAt ?? new Date().toISOString()),
    };
  }

  return prisma.match.findUnique({
    where: { id: matchId },
    include: {
      partner: true,
      client: true,
    },
  });
}

export async function clearMatchAsAdmin(matchId: string) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return { ok: false as const, error: "Firestore 未設定です。" };
    const matchRef = db.collection("matches").doc(matchId);
    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) return { ok: false as const, error: "マッチが見つかりません。", status: 404 };

    const msgSnap = await db.collection("messages").where("matchId", "==", matchId).get();
    const negSnap = await db.collection("negotiations").where("matchId", "==", matchId).get();

    const refs = [matchRef, ...msgSnap.docs.map((d) => d.ref), ...negSnap.docs.map((d) => d.ref)];
    const batchSize = 450;
    for (let i = 0; i < refs.length; i += batchSize) {
      const batch = db.batch();
      refs.slice(i, i + batchSize).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
    return { ok: true as const };
  }

  try {
    await prisma.match.delete({ where: { id: matchId } });
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "マッチが見つかりません。", status: 404 };
  }
}

export async function hasMatchBetween(partnerId: string, clientId: string) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return false;
    const snap = await db
      .collection("matches")
      .where("partnerId", "==", partnerId)
      .where("clientId", "==", clientId)
      .limit(1)
      .get();
    return !snap.empty;
  }
  const row = await prisma.match.findFirst({
    where: { partnerId, clientId },
    select: { id: true },
  });
  return Boolean(row);
}
