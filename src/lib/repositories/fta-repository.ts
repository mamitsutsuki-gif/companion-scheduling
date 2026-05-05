import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { defaultFtaChart, normalizeFtaChart, type FtaChart } from "@/lib/fta";

async function readByRawSql(userId: string) {
  const rows = (await prisma.$queryRawUnsafe('SELECT data FROM "UserFta" WHERE userId = ? LIMIT 1', userId)) as Array<{
    data: unknown;
  }>;
  return rows[0]?.data ?? null;
}

async function upsertByRawSql(userId: string, chart: FtaChart) {
  const raw = JSON.stringify(chart);
  await prisma.$executeRawUnsafe(
    'INSERT INTO "UserFta" (id, userId, data, createdAt, updatedAt) VALUES (?, ?, json(?), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ' +
      'ON CONFLICT(userId) DO UPDATE SET data = json(excluded.data), updatedAt = CURRENT_TIMESTAMP',
    `fta-${userId}`,
    userId,
    raw,
  );
}

function asJsonValue(input: unknown) {
  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch {
      return null;
    }
  }
  return input;
}

export async function getFtaByUserId(userId: string): Promise<FtaChart> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return defaultFtaChart();
    const snap = await db.collection("userFta").doc(userId).get();
    if (!snap.exists) return defaultFtaChart();
    const raw = snap.data() as Record<string, unknown>;
    return normalizeFtaChart(raw.data);
  }
  const delegate = (prisma as unknown as { userFta?: { findUnique?: Function } }).userFta;
  if (!delegate?.findUnique) {
    const raw = await readByRawSql(userId).catch(() => null);
    return raw ? normalizeFtaChart(asJsonValue(raw)) : defaultFtaChart();
  }
  try {
    const row = await delegate.findUnique({ where: { userId }, select: { data: true } });
    if (!row) return defaultFtaChart();
    return normalizeFtaChart(row.data);
  } catch {
    const raw = await readByRawSql(userId).catch(() => null);
    return raw ? normalizeFtaChart(asJsonValue(raw)) : defaultFtaChart();
  }
}

export async function upsertFtaByUserId(userId: string, data: FtaChart): Promise<FtaChart> {
  const normalized = normalizeFtaChart(data);
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return normalized;
    await db.collection("userFta").doc(userId).set(
      {
        userId,
        data: normalized,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    return normalized;
  }
  const delegate = (prisma as unknown as { userFta?: { upsert?: Function } }).userFta;
  if (!delegate?.upsert) {
    await upsertByRawSql(userId, normalized).catch(() => null);
    return normalized;
  }
  try {
    await delegate.upsert({
      where: { userId },
      create: { userId, data: normalized },
      update: { data: normalized },
    });
  } catch {
    await upsertByRawSql(userId, normalized).catch(() => null);
  }
  return normalized;
}
