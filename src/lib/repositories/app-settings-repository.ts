import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import {
  DEFAULT_AVAILABILITY_OPTIONS,
  normalizeAvailabilityOptions,
  type AvailabilitySlotOption,
} from "@/lib/availability";

export type AppSettingsRow = {
  id: string;
  slotDurationMinutes: number;
  totalSessions: number;
  timezone: string;
  availabilitySlotOptions: AvailabilitySlotOption[];
};

const defaults: AppSettingsRow = {
  id: "app",
  slotDurationMinutes: 30,
  totalSessions: 6,
  timezone: "Asia/Tokyo",
  availabilitySlotOptions: [...DEFAULT_AVAILABILITY_OPTIONS],
};

async function readByRawSql() {
  try {
    const rows = (await prisma.$queryRawUnsafe(
      'SELECT id, slotDurationMinutes, totalSessions, timezone FROM "AppSettings" WHERE id = ? LIMIT 1',
      "app",
    )) as Array<{ id: string; slotDurationMinutes: number; totalSessions: number; timezone: string }>;
    if (!rows.length) return null;
    return rows[0]!;
  } catch {
    const rows = (await prisma.$queryRawUnsafe(
      'SELECT id, slotDurationMinutes, timezone FROM "AppSettings" WHERE id = ? LIMIT 1',
      "app",
    )) as Array<{ id: string; slotDurationMinutes: number; timezone: string }>;
    if (!rows.length) return null;
    return { ...rows[0], totalSessions: defaults.totalSessions };
  }
}

async function upsertByRawSql(input: { slotDurationMinutes: number; totalSessions: number; timezone: string }) {
  try {
    await prisma.$executeRawUnsafe(
      'INSERT INTO "AppSettings" (id, slotDurationMinutes, totalSessions, timezone, updatedAt) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ' +
        "ON CONFLICT(id) DO UPDATE SET slotDurationMinutes = excluded.slotDurationMinutes, totalSessions = excluded.totalSessions, timezone = excluded.timezone, updatedAt = CURRENT_TIMESTAMP",
      "app",
      input.slotDurationMinutes,
      input.totalSessions,
      input.timezone,
    );
  } catch {
    await prisma.$executeRawUnsafe(
      'INSERT INTO "AppSettings" (id, slotDurationMinutes, timezone, updatedAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ' +
        'ON CONFLICT(id) DO UPDATE SET slotDurationMinutes = excluded.slotDurationMinutes, timezone = excluded.timezone, updatedAt = CURRENT_TIMESTAMP',
      "app",
      input.slotDurationMinutes,
      input.timezone,
    );
  }
}

export async function getAppSettingsRow(): Promise<AppSettingsRow> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return defaults;
    const ref = db.collection("appSettings").doc("app");
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({ ...defaults, updatedAt: new Date().toISOString() }, { merge: true });
      return defaults;
    }
    const raw = snap.data() as Record<string, unknown>;
    return {
      id: "app",
      slotDurationMinutes:
        typeof raw.slotDurationMinutes === "number" ? raw.slotDurationMinutes : defaults.slotDurationMinutes,
      totalSessions: typeof raw.totalSessions === "number" ? raw.totalSessions : defaults.totalSessions,
      timezone: typeof raw.timezone === "string" ? raw.timezone : defaults.timezone,
      availabilitySlotOptions: normalizeAvailabilityOptions(raw.availabilitySlotOptions),
    };
  }

  const delegate = (prisma as unknown as {
    appSettings?: { upsert?: Function; findUnique?: Function };
  }).appSettings;
  if (!delegate?.upsert) {
    const row = await readByRawSql().catch(() => null);
    return row
      ? {
          id: "app",
          slotDurationMinutes: Number(row.slotDurationMinutes ?? defaults.slotDurationMinutes),
          totalSessions: Number((row as { totalSessions?: number }).totalSessions ?? defaults.totalSessions),
          timezone: String(row.timezone ?? defaults.timezone),
          availabilitySlotOptions: [...DEFAULT_AVAILABILITY_OPTIONS],
        }
      : defaults;
  }
  try {
    const row = await delegate.upsert({
      where: { id: "app" },
      create: defaults,
      update: {},
    });
    return {
      id: "app",
      slotDurationMinutes: Number(row.slotDurationMinutes ?? defaults.slotDurationMinutes),
      totalSessions: Number(row.totalSessions ?? defaults.totalSessions),
      timezone: String(row.timezone ?? defaults.timezone),
      availabilitySlotOptions: [...DEFAULT_AVAILABILITY_OPTIONS],
    };
  } catch {
    const row = await readByRawSql().catch(() => null);
    return row
      ? {
          id: "app",
          slotDurationMinutes: Number(row.slotDurationMinutes ?? defaults.slotDurationMinutes),
          totalSessions: Number((row as { totalSessions?: number }).totalSessions ?? defaults.totalSessions),
          timezone: String(row.timezone ?? defaults.timezone),
          availabilitySlotOptions: [...DEFAULT_AVAILABILITY_OPTIONS],
        }
      : defaults;
  }
}

export async function upsertAppSettingsRow(input: {
  slotDurationMinutes: number;
  totalSessions: number;
  timezone: string;
  availabilitySlotOptions?: AvailabilitySlotOption[];
}): Promise<AppSettingsRow> {
  const availabilitySlotOptions = normalizeAvailabilityOptions(input.availabilitySlotOptions);

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return { ...defaults, ...input, availabilitySlotOptions };
    const ref = db.collection("appSettings").doc("app");
    await ref.set(
      {
        id: "app",
        slotDurationMinutes: input.slotDurationMinutes,
        totalSessions: input.totalSessions,
        timezone: input.timezone,
        availabilitySlotOptions,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    return {
      id: "app",
      slotDurationMinutes: input.slotDurationMinutes,
      totalSessions: input.totalSessions,
      timezone: input.timezone,
      availabilitySlotOptions,
    };
  }

  const delegate = (prisma as unknown as {
    appSettings?: { upsert?: Function };
  }).appSettings;
  if (!delegate?.upsert) {
    await upsertByRawSql({
      slotDurationMinutes: input.slotDurationMinutes,
      totalSessions: input.totalSessions,
      timezone: input.timezone,
    }).catch(() => null);
    return { id: "app", slotDurationMinutes: input.slotDurationMinutes, totalSessions: input.totalSessions, timezone: input.timezone, availabilitySlotOptions };
  }
  try {
    const row = await delegate.upsert({
      where: { id: "app" },
      create: {
        id: "app",
        slotDurationMinutes: input.slotDurationMinutes,
        totalSessions: input.totalSessions,
        timezone: input.timezone,
      },
      update: {
        slotDurationMinutes: input.slotDurationMinutes,
        totalSessions: input.totalSessions,
        timezone: input.timezone,
      },
    });
    return {
      id: String(row.id ?? "app"),
      slotDurationMinutes: Number(row.slotDurationMinutes ?? input.slotDurationMinutes),
      totalSessions: Number(row.totalSessions ?? input.totalSessions),
      timezone: String(row.timezone ?? input.timezone),
      availabilitySlotOptions,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("Unknown argument `totalSessions`") ||
        error.message.includes("no such column: totalSessions"))
    ) {
      const row = await delegate.upsert({
        where: { id: "app" },
        create: { id: "app", slotDurationMinutes: input.slotDurationMinutes, timezone: input.timezone },
        update: { slotDurationMinutes: input.slotDurationMinutes, timezone: input.timezone },
      });
      return {
        id: String(row.id ?? "app"),
        slotDurationMinutes: Number(row.slotDurationMinutes ?? input.slotDurationMinutes),
        totalSessions: input.totalSessions,
        timezone: String(row.timezone ?? input.timezone),
        availabilitySlotOptions,
      };
    }
    await upsertByRawSql({
      slotDurationMinutes: input.slotDurationMinutes,
      totalSessions: input.totalSessions,
      timezone: input.timezone,
    }).catch(() => null);
    return { id: "app", slotDurationMinutes: input.slotDurationMinutes, totalSessions: input.totalSessions, timezone: input.timezone, availabilitySlotOptions };
  }
}
