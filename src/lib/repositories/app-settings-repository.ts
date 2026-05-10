import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import {
  DEFAULT_AVAILABILITY_OPTIONS,
  normalizeAvailabilityOptions,
  type AvailabilitySlotOption,
} from "@/lib/availability";

/** { [sessionNumber: number]: string[] } 各回のレポートに表示する追加設問 */
export type PartnerExtraQuestionsByRound = Record<string, string[]>;

export type AppSettingsRow = {
  id: string;
  slotDurationMinutes: number;
  totalSessions: number;
  timezone: string;
  availabilitySlotOptions: AvailabilitySlotOption[];
  partnerExtraQuestionsByRound: PartnerExtraQuestionsByRound;
};

const DEFAULT_PARTNER_EXTRA_QUESTIONS: PartnerExtraQuestionsByRound = {
  "4": [
    "ここまで担当いただいていて感じるクライアントの強み、課題は何ですか？",
    "クライアントを通して感じる組織課題があれば教えてください（例：直属上司のフィードバックが直接的すぎてモチベーションが下がっている等）",
  ],
  "8": [
    "ここまでの全1on1セッションを振り返り、クライアントにどのような変化がありましたか？",
  ],
};

export function normalizePartnerExtraQuestionsByRound(input: unknown): PartnerExtraQuestionsByRound {
  if (!input || typeof input !== "object") return { ...DEFAULT_PARTNER_EXTRA_QUESTIONS };
  const out: PartnerExtraQuestionsByRound = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const round = String(Number(k));
    if (round === "NaN" || Number(round) <= 0 || Number(round) > 60) continue;
    if (!Array.isArray(v)) continue;
    const list = v
      .filter((q): q is string => typeof q === "string")
      .map((q) => q.trim())
      .filter((q) => q.length > 0 && q.length <= 500)
      .slice(0, 8);
    if (list.length > 0) out[round] = list;
  }
  return out;
}

const defaults: AppSettingsRow = {
  id: "app",
  slotDurationMinutes: 30,
  totalSessions: 6,
  timezone: "Asia/Tokyo",
  availabilitySlotOptions: [...DEFAULT_AVAILABILITY_OPTIONS],
  partnerExtraQuestionsByRound: { ...DEFAULT_PARTNER_EXTRA_QUESTIONS },
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
      partnerExtraQuestionsByRound:
        raw.partnerExtraQuestionsByRound !== undefined
          ? normalizePartnerExtraQuestionsByRound(raw.partnerExtraQuestionsByRound)
          : { ...DEFAULT_PARTNER_EXTRA_QUESTIONS },
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
          partnerExtraQuestionsByRound: { ...DEFAULT_PARTNER_EXTRA_QUESTIONS },
        }
      : defaults;
  }
  try {
    const row = (await delegate.upsert({
      where: { id: "app" },
      create: { id: "app" },
      update: {},
    })) as Record<string, unknown>;
    return {
      id: "app",
      slotDurationMinutes: Number((row.slotDurationMinutes as number) ?? defaults.slotDurationMinutes),
      totalSessions: Number((row.totalSessions as number) ?? defaults.totalSessions),
      timezone: String((row.timezone as string) ?? defaults.timezone),
      availabilitySlotOptions: [...DEFAULT_AVAILABILITY_OPTIONS],
      partnerExtraQuestionsByRound:
        row.partnerExtraQuestionsByRound !== undefined && row.partnerExtraQuestionsByRound !== null
          ? normalizePartnerExtraQuestionsByRound(row.partnerExtraQuestionsByRound)
          : { ...DEFAULT_PARTNER_EXTRA_QUESTIONS },
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
          partnerExtraQuestionsByRound: { ...DEFAULT_PARTNER_EXTRA_QUESTIONS },
        }
      : defaults;
  }
}

export async function upsertAppSettingsRow(input: {
  slotDurationMinutes: number;
  totalSessions: number;
  timezone: string;
  availabilitySlotOptions?: AvailabilitySlotOption[];
  partnerExtraQuestionsByRound?: PartnerExtraQuestionsByRound;
}): Promise<AppSettingsRow> {
  const availabilitySlotOptions = normalizeAvailabilityOptions(input.availabilitySlotOptions);
  const partnerExtraQuestionsByRound =
    input.partnerExtraQuestionsByRound !== undefined
      ? normalizePartnerExtraQuestionsByRound(input.partnerExtraQuestionsByRound)
      : undefined;

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) {
      return {
        ...defaults,
        slotDurationMinutes: input.slotDurationMinutes,
        totalSessions: input.totalSessions,
        timezone: input.timezone,
        availabilitySlotOptions,
        partnerExtraQuestionsByRound:
          partnerExtraQuestionsByRound ?? defaults.partnerExtraQuestionsByRound,
      };
    }
    const ref = db.collection("appSettings").doc("app");
    const baseDoc: Record<string, unknown> = {
      id: "app",
      slotDurationMinutes: input.slotDurationMinutes,
      totalSessions: input.totalSessions,
      timezone: input.timezone,
      availabilitySlotOptions,
      updatedAt: new Date().toISOString(),
    };
    if (partnerExtraQuestionsByRound !== undefined) {
      baseDoc.partnerExtraQuestionsByRound = partnerExtraQuestionsByRound;
    }
    await ref.set(baseDoc, { merge: true });
    const snap = await ref.get();
    const raw = (snap.data() ?? {}) as Record<string, unknown>;
    return {
      id: "app",
      slotDurationMinutes: input.slotDurationMinutes,
      totalSessions: input.totalSessions,
      timezone: input.timezone,
      availabilitySlotOptions,
      partnerExtraQuestionsByRound:
        raw.partnerExtraQuestionsByRound !== undefined
          ? normalizePartnerExtraQuestionsByRound(raw.partnerExtraQuestionsByRound)
          : partnerExtraQuestionsByRound ?? { ...DEFAULT_PARTNER_EXTRA_QUESTIONS },
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
    return {
      id: "app",
      slotDurationMinutes: input.slotDurationMinutes,
      totalSessions: input.totalSessions,
      timezone: input.timezone,
      availabilitySlotOptions,
      partnerExtraQuestionsByRound:
        partnerExtraQuestionsByRound ?? { ...DEFAULT_PARTNER_EXTRA_QUESTIONS },
    };
  }
  const writeData: Record<string, unknown> = {
    slotDurationMinutes: input.slotDurationMinutes,
    totalSessions: input.totalSessions,
    timezone: input.timezone,
  };
  if (partnerExtraQuestionsByRound !== undefined) {
    writeData.partnerExtraQuestionsByRound = partnerExtraQuestionsByRound;
  }
  try {
    const row = (await delegate.upsert({
      where: { id: "app" },
      create: { id: "app", ...writeData },
      update: writeData,
    })) as Record<string, unknown>;
    return {
      id: String(row.id ?? "app"),
      slotDurationMinutes: Number(row.slotDurationMinutes ?? input.slotDurationMinutes),
      totalSessions: Number(row.totalSessions ?? input.totalSessions),
      timezone: String(row.timezone ?? input.timezone),
      availabilitySlotOptions,
      partnerExtraQuestionsByRound:
        row.partnerExtraQuestionsByRound !== undefined && row.partnerExtraQuestionsByRound !== null
          ? normalizePartnerExtraQuestionsByRound(row.partnerExtraQuestionsByRound)
          : partnerExtraQuestionsByRound ?? { ...DEFAULT_PARTNER_EXTRA_QUESTIONS },
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("Unknown argument `totalSessions`") ||
        error.message.includes("Unknown argument `partnerExtraQuestionsByRound`") ||
        error.message.includes("no such column"))
    ) {
      const fallbackData: Record<string, unknown> = {
        slotDurationMinutes: input.slotDurationMinutes,
        timezone: input.timezone,
      };
      const row = (await delegate.upsert({
        where: { id: "app" },
        create: { id: "app", ...fallbackData },
        update: fallbackData,
      })) as Record<string, unknown>;
      return {
        id: String(row.id ?? "app"),
        slotDurationMinutes: Number(row.slotDurationMinutes ?? input.slotDurationMinutes),
        totalSessions: input.totalSessions,
        timezone: String(row.timezone ?? input.timezone),
        availabilitySlotOptions,
        partnerExtraQuestionsByRound:
          partnerExtraQuestionsByRound ?? { ...DEFAULT_PARTNER_EXTRA_QUESTIONS },
      };
    }
    await upsertByRawSql({
      slotDurationMinutes: input.slotDurationMinutes,
      totalSessions: input.totalSessions,
      timezone: input.timezone,
    }).catch(() => null);
    return {
      id: "app",
      slotDurationMinutes: input.slotDurationMinutes,
      totalSessions: input.totalSessions,
      timezone: input.timezone,
      availabilitySlotOptions,
      partnerExtraQuestionsByRound:
        partnerExtraQuestionsByRound ?? { ...DEFAULT_PARTNER_EXTRA_QUESTIONS },
    };
  }
}
