import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import {
  DEFAULT_AVAILABILITY_OPTIONS,
  normalizeAvailabilityOptions,
  type AvailabilitySlotOption,
} from "@/lib/availability";

/** { [sessionNumber: number]: string[] } 各回のレポートに表示する追加設問 */
export type PartnerExtraQuestionsByRound = Record<string, string[]>;

/** { [sessionNumber: number]: { client: string; partner: string } } 各回のガイドライン本文 */
export type SessionGuidelineEntry = { client: string; partner: string };
export type SessionGuidelinesByRound = Record<string, SessionGuidelineEntry>;

/** { [sessionNumber: number]: string[] } 各回のクライアント振り返りに表示する追加設問 */
export type ClientExtraQuestionsByRound = Record<string, string[]>;

/**
 * 所属企業（テナント）の登録エントリ。
 * - `id` は user.companyId に格納されるキー（半角英数 / ハイフン / アンダースコア）。
 * - `name` は管理者画面・将来の表示用のヒトに読める表記。
 *
 * 同じ `id` のクライアント同士だけが、FTA 閲覧 / クライアント管理者の日程閲覧で
 * 互いに見えるようにスコープされる。`id` を間違って変えるとアクセスが途切れるので、
 * 編集 UI は select+登録制にしている。
 */
export type CompanyOption = { id: string; name: string };

export type AppSettingsRow = {
  id: string;
  slotDurationMinutes: number;
  totalSessions: number;
  timezone: string;
  availabilitySlotOptions: AvailabilitySlotOption[];
  partnerExtraQuestionsByRound: PartnerExtraQuestionsByRound;
  clientExtraQuestionsByRound: ClientExtraQuestionsByRound;
  sessionGuidelinesByRound: SessionGuidelinesByRound;
  slotEarliestHour: number;
  slotLatestHour: number;
  allowWeekends: boolean;
  companies: CompanyOption[];
};

/**
 * 企業（テナント）ごとに上書きできるフィールドの集合。
 * `companies` と管理者一覧はテナント横断の運用なので含まれない。
 */
export type AppSettingsOverridableFields = Pick<
  AppSettingsRow,
  | "slotDurationMinutes"
  | "totalSessions"
  | "timezone"
  | "availabilitySlotOptions"
  | "partnerExtraQuestionsByRound"
  | "clientExtraQuestionsByRound"
  | "sessionGuidelinesByRound"
  | "slotEarliestHour"
  | "slotLatestHour"
  | "allowWeekends"
>;

/**
 * 企業ごとに保存できる「上書き」。
 * - undefined / 未設定 = グローバル設定を継承する
 * - 値あり = その項目をこの企業に限り上書きする
 * Firestore では companyAppSettings/{companyId} に保存する。
 */

/** 企業設定の「プロジェクト概要」— パートナー向け（マッチルームに表示） */
export type PartnerProjectOverview = {
  companyName: string;
  sessionPeriod: string;
  sessionFrequency: string;
  background: string;
  sessionFocus: string;
  expectations: string;
  other: string;
};

/** 企業設定の「プロジェクト概要」— クライアント向け */
export type ClientProjectOverview = {
  sessionPeriod: string;
  sessionFrequency: string;
  background: string;
  sessionFocus: string;
  expectations: string;
  other: string;
};

const OVERVIEW_TEXT_MAX = 8000;

function trimOverviewField(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, OVERVIEW_TEXT_MAX);
}

export function normalizePartnerProjectOverview(input: unknown): PartnerProjectOverview | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const out: PartnerProjectOverview = {
    companyName: trimOverviewField(o.companyName),
    sessionPeriod: trimOverviewField(o.sessionPeriod),
    sessionFrequency: trimOverviewField(o.sessionFrequency),
    background: trimOverviewField(o.background),
    sessionFocus: trimOverviewField(o.sessionFocus),
    expectations: trimOverviewField(o.expectations),
    other: trimOverviewField(o.other),
  };
  const any =
    out.companyName ||
    out.sessionPeriod ||
    out.sessionFrequency ||
    out.background ||
    out.sessionFocus ||
    out.expectations ||
    out.other;
  return any ? out : null;
}

export function normalizeClientProjectOverview(input: unknown): ClientProjectOverview | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const out: ClientProjectOverview = {
    sessionPeriod: trimOverviewField(o.sessionPeriod),
    sessionFrequency: trimOverviewField(o.sessionFrequency),
    background: trimOverviewField(o.background),
    sessionFocus: trimOverviewField(o.sessionFocus),
    expectations: trimOverviewField(o.expectations),
    other: trimOverviewField(o.other),
  };
  const any =
    out.sessionPeriod ||
    out.sessionFrequency ||
    out.background ||
    out.sessionFocus ||
    out.expectations ||
    out.other;
  return any ? out : null;
}

export type CompanyAppSettingsOverride = Partial<AppSettingsOverridableFields> & {
  companyId: string;
  updatedAt?: string;
  partnerProjectOverview?: PartnerProjectOverview | null;
  clientProjectOverview?: ClientProjectOverview | null;
  /**
   * 同じ companyId のクライアント・クライアント管理者・クライアント人事の間で
   * 自分FTA を相互閲覧できるかどうか。
   * 未設定（undefined）= デフォルト共有あり（true）として扱う（後方互換）。
   * false に明示的に設定された場合のみ、各自は自分の FTA だけを見ることになる。
   */
  shareFtaWithinCompany?: boolean;
};

export function normalizeCompanies(input: unknown): CompanyOption[] {
  if (!Array.isArray(input)) return [];
  const out: CompanyOption[] = [];
  const seen = new Set<string>();
  for (const v of input) {
    if (!v || typeof v !== "object") continue;
    const obj = v as Record<string, unknown>;
    const idRaw = typeof obj.id === "string" ? obj.id : "";
    const nameRaw = typeof obj.name === "string" ? obj.name : "";
    const id = idRaw
      .normalize("NFKC")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 60);
    const name = nameRaw.trim().slice(0, 80);
    if (!id || !name) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name });
    if (out.length >= 64) break;
  }
  return out;
}

function clampHour(input: unknown, fallback: number) {
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(24, Math.max(0, Math.round(n)));
}

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

/** クライアント追加質問のデフォルトは空。企業側で必要時のみ設定する想定。 */
const DEFAULT_CLIENT_EXTRA_QUESTIONS: ClientExtraQuestionsByRound = {};

export function normalizeClientExtraQuestionsByRound(input: unknown): ClientExtraQuestionsByRound {
  if (!input || typeof input !== "object") return { ...DEFAULT_CLIENT_EXTRA_QUESTIONS };
  const out: ClientExtraQuestionsByRound = {};
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

const DEFAULT_SESSION_GUIDELINES: SessionGuidelinesByRound = {};

export function normalizeSessionGuidelinesByRound(input: unknown): SessionGuidelinesByRound {
  if (!input || typeof input !== "object") return {};
  const out: SessionGuidelinesByRound = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const round = String(Number(k));
    if (round === "NaN" || Number(round) <= 0 || Number(round) > 60) continue;
    if (!v || typeof v !== "object") continue;
    const obj = v as Record<string, unknown>;
    const client = typeof obj.client === "string" ? obj.client.slice(0, 4000) : "";
    const partner = typeof obj.partner === "string" ? obj.partner.slice(0, 4000) : "";
    if (client.length === 0 && partner.length === 0) continue;
    out[round] = { client, partner };
  }
  return out;
}

/**
 * 受け取った任意オブジェクトを CompanyAppSettingsOverride に正規化する。
 * - 認識しないキーは捨てる
 * - undefined / null は「未設定（=グローバル継承）」として落とす
 * - 数値・boolean は clamp / 厳密チェック
 */
export function normalizeCompanyAppSettingsOverride(
  companyId: string,
  input: unknown,
): CompanyAppSettingsOverride {
  const out: CompanyAppSettingsOverride = { companyId };
  if (!input || typeof input !== "object") return out;
  const raw = input as Record<string, unknown>;

  if (typeof raw.slotDurationMinutes === "number" && Number.isFinite(raw.slotDurationMinutes)) {
    const n = Math.round(raw.slotDurationMinutes);
    if (n >= 5 && n <= 240) out.slotDurationMinutes = n;
  }
  if (typeof raw.totalSessions === "number" && Number.isFinite(raw.totalSessions)) {
    const n = Math.round(raw.totalSessions);
    if (n >= 1 && n <= 60) out.totalSessions = n;
  }
  if (typeof raw.timezone === "string" && raw.timezone.trim().length > 0) {
    out.timezone = raw.timezone.trim().slice(0, 64);
  }
  if (Array.isArray(raw.availabilitySlotOptions)) {
    out.availabilitySlotOptions = normalizeAvailabilityOptions(raw.availabilitySlotOptions);
  }
  if (raw.partnerExtraQuestionsByRound !== undefined && raw.partnerExtraQuestionsByRound !== null) {
    out.partnerExtraQuestionsByRound = normalizePartnerExtraQuestionsByRound(raw.partnerExtraQuestionsByRound);
  }
  if (raw.clientExtraQuestionsByRound !== undefined && raw.clientExtraQuestionsByRound !== null) {
    out.clientExtraQuestionsByRound = normalizeClientExtraQuestionsByRound(raw.clientExtraQuestionsByRound);
  }
  if (raw.sessionGuidelinesByRound !== undefined && raw.sessionGuidelinesByRound !== null) {
    out.sessionGuidelinesByRound = normalizeSessionGuidelinesByRound(raw.sessionGuidelinesByRound);
  }
  if (raw.slotEarliestHour !== undefined && raw.slotEarliestHour !== null) {
    out.slotEarliestHour = clampHour(raw.slotEarliestHour, 0);
  }
  if (raw.slotLatestHour !== undefined && raw.slotLatestHour !== null) {
    out.slotLatestHour = clampHour(raw.slotLatestHour, 24);
  }
  if (typeof raw.allowWeekends === "boolean") {
    out.allowWeekends = raw.allowWeekends;
  }
  if (typeof raw.updatedAt === "string") {
    out.updatedAt = raw.updatedAt;
  }
  if (raw.partnerProjectOverview !== undefined && raw.partnerProjectOverview !== null) {
    const po = normalizePartnerProjectOverview(raw.partnerProjectOverview);
    if (po) out.partnerProjectOverview = po;
  }
  if (raw.clientProjectOverview !== undefined && raw.clientProjectOverview !== null) {
    const co = normalizeClientProjectOverview(raw.clientProjectOverview);
    if (co) out.clientProjectOverview = co;
  }
  if (typeof raw.shareFtaWithinCompany === "boolean") {
    out.shareFtaWithinCompany = raw.shareFtaWithinCompany;
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
  clientExtraQuestionsByRound: { ...DEFAULT_CLIENT_EXTRA_QUESTIONS },
  sessionGuidelinesByRound: { ...DEFAULT_SESSION_GUIDELINES },
  slotEarliestHour: 8,
  slotLatestHour: 20,
  allowWeekends: false,
  companies: [],
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
      clientExtraQuestionsByRound:
        raw.clientExtraQuestionsByRound !== undefined
          ? normalizeClientExtraQuestionsByRound(raw.clientExtraQuestionsByRound)
          : { ...DEFAULT_CLIENT_EXTRA_QUESTIONS },
      sessionGuidelinesByRound:
        raw.sessionGuidelinesByRound !== undefined
          ? normalizeSessionGuidelinesByRound(raw.sessionGuidelinesByRound)
          : { ...DEFAULT_SESSION_GUIDELINES },
      slotEarliestHour: clampHour(raw.slotEarliestHour, defaults.slotEarliestHour),
      slotLatestHour: clampHour(raw.slotLatestHour, defaults.slotLatestHour),
      allowWeekends: raw.allowWeekends === true,
      companies: normalizeCompanies(raw.companies),
    };
  }

  const delegate = (prisma as unknown as {
    appSettings?: { upsert?: Function; findUnique?: Function };
  }).appSettings;
  if (!delegate?.upsert) {
    const row = await readByRawSql().catch(() => null);
    return row
      ? {
          ...defaults,
          slotDurationMinutes: Number(row.slotDurationMinutes ?? defaults.slotDurationMinutes),
          totalSessions: Number((row as { totalSessions?: number }).totalSessions ?? defaults.totalSessions),
          timezone: String(row.timezone ?? defaults.timezone),
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
      clientExtraQuestionsByRound:
        row.clientExtraQuestionsByRound !== undefined && row.clientExtraQuestionsByRound !== null
          ? normalizeClientExtraQuestionsByRound(row.clientExtraQuestionsByRound)
          : { ...DEFAULT_CLIENT_EXTRA_QUESTIONS },
      sessionGuidelinesByRound:
        row.sessionGuidelinesByRound !== undefined && row.sessionGuidelinesByRound !== null
          ? normalizeSessionGuidelinesByRound(row.sessionGuidelinesByRound)
          : { ...DEFAULT_SESSION_GUIDELINES },
      slotEarliestHour: clampHour(row.slotEarliestHour, defaults.slotEarliestHour),
      slotLatestHour: clampHour(row.slotLatestHour, defaults.slotLatestHour),
      allowWeekends: row.allowWeekends === true,
      companies: normalizeCompanies(row.companies),
    };
  } catch {
    const row = await readByRawSql().catch(() => null);
    return row
      ? {
          ...defaults,
          slotDurationMinutes: Number(row.slotDurationMinutes ?? defaults.slotDurationMinutes),
          totalSessions: Number((row as { totalSessions?: number }).totalSessions ?? defaults.totalSessions),
          timezone: String(row.timezone ?? defaults.timezone),
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
  clientExtraQuestionsByRound?: ClientExtraQuestionsByRound;
  sessionGuidelinesByRound?: SessionGuidelinesByRound;
  slotEarliestHour?: number;
  slotLatestHour?: number;
  allowWeekends?: boolean;
  companies?: CompanyOption[];
}): Promise<AppSettingsRow> {
  const availabilitySlotOptions = normalizeAvailabilityOptions(input.availabilitySlotOptions);
  const partnerExtraQuestionsByRound =
    input.partnerExtraQuestionsByRound !== undefined
      ? normalizePartnerExtraQuestionsByRound(input.partnerExtraQuestionsByRound)
      : undefined;
  const clientExtraQuestionsByRound =
    input.clientExtraQuestionsByRound !== undefined
      ? normalizeClientExtraQuestionsByRound(input.clientExtraQuestionsByRound)
      : undefined;
  const sessionGuidelinesByRound =
    input.sessionGuidelinesByRound !== undefined
      ? normalizeSessionGuidelinesByRound(input.sessionGuidelinesByRound)
      : undefined;
  const slotEarliestHour =
    input.slotEarliestHour !== undefined ? clampHour(input.slotEarliestHour, defaults.slotEarliestHour) : undefined;
  const slotLatestHour =
    input.slotLatestHour !== undefined ? clampHour(input.slotLatestHour, defaults.slotLatestHour) : undefined;
  const allowWeekends = input.allowWeekends !== undefined ? Boolean(input.allowWeekends) : undefined;
  const companies =
    input.companies !== undefined ? normalizeCompanies(input.companies) : undefined;

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
        clientExtraQuestionsByRound:
          clientExtraQuestionsByRound ?? defaults.clientExtraQuestionsByRound,
        sessionGuidelinesByRound:
          sessionGuidelinesByRound ?? defaults.sessionGuidelinesByRound,
        companies: companies ?? defaults.companies,
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
    if (clientExtraQuestionsByRound !== undefined) {
      baseDoc.clientExtraQuestionsByRound = clientExtraQuestionsByRound;
    }
    if (sessionGuidelinesByRound !== undefined) {
      baseDoc.sessionGuidelinesByRound = sessionGuidelinesByRound;
    }
    if (slotEarliestHour !== undefined) baseDoc.slotEarliestHour = slotEarliestHour;
    if (slotLatestHour !== undefined) baseDoc.slotLatestHour = slotLatestHour;
    if (allowWeekends !== undefined) baseDoc.allowWeekends = allowWeekends;
    if (companies !== undefined) baseDoc.companies = companies;
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
      clientExtraQuestionsByRound:
        raw.clientExtraQuestionsByRound !== undefined
          ? normalizeClientExtraQuestionsByRound(raw.clientExtraQuestionsByRound)
          : clientExtraQuestionsByRound ?? { ...DEFAULT_CLIENT_EXTRA_QUESTIONS },
      sessionGuidelinesByRound:
        raw.sessionGuidelinesByRound !== undefined
          ? normalizeSessionGuidelinesByRound(raw.sessionGuidelinesByRound)
          : sessionGuidelinesByRound ?? { ...DEFAULT_SESSION_GUIDELINES },
      slotEarliestHour: clampHour(raw.slotEarliestHour, slotEarliestHour ?? defaults.slotEarliestHour),
      slotLatestHour: clampHour(raw.slotLatestHour, slotLatestHour ?? defaults.slotLatestHour),
      allowWeekends:
        raw.allowWeekends !== undefined ? raw.allowWeekends === true : allowWeekends ?? defaults.allowWeekends,
      companies:
        raw.companies !== undefined
          ? normalizeCompanies(raw.companies)
          : companies ?? [...defaults.companies],
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
      ...defaults,
      slotDurationMinutes: input.slotDurationMinutes,
      totalSessions: input.totalSessions,
      timezone: input.timezone,
      availabilitySlotOptions,
      partnerExtraQuestionsByRound:
        partnerExtraQuestionsByRound ?? { ...DEFAULT_PARTNER_EXTRA_QUESTIONS },
      clientExtraQuestionsByRound:
        clientExtraQuestionsByRound ?? { ...DEFAULT_CLIENT_EXTRA_QUESTIONS },
      sessionGuidelinesByRound:
        sessionGuidelinesByRound ?? { ...DEFAULT_SESSION_GUIDELINES },
      slotEarliestHour: slotEarliestHour ?? defaults.slotEarliestHour,
      slotLatestHour: slotLatestHour ?? defaults.slotLatestHour,
      allowWeekends: allowWeekends ?? defaults.allowWeekends,
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
  if (clientExtraQuestionsByRound !== undefined) {
    writeData.clientExtraQuestionsByRound = clientExtraQuestionsByRound;
  }
  if (sessionGuidelinesByRound !== undefined) {
    writeData.sessionGuidelinesByRound = sessionGuidelinesByRound;
  }
  if (slotEarliestHour !== undefined) writeData.slotEarliestHour = slotEarliestHour;
  if (slotLatestHour !== undefined) writeData.slotLatestHour = slotLatestHour;
  if (allowWeekends !== undefined) writeData.allowWeekends = allowWeekends;
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
      clientExtraQuestionsByRound:
        row.clientExtraQuestionsByRound !== undefined && row.clientExtraQuestionsByRound !== null
          ? normalizeClientExtraQuestionsByRound(row.clientExtraQuestionsByRound)
          : clientExtraQuestionsByRound ?? { ...DEFAULT_CLIENT_EXTRA_QUESTIONS },
      sessionGuidelinesByRound:
        row.sessionGuidelinesByRound !== undefined && row.sessionGuidelinesByRound !== null
          ? normalizeSessionGuidelinesByRound(row.sessionGuidelinesByRound)
          : sessionGuidelinesByRound ?? { ...DEFAULT_SESSION_GUIDELINES },
      slotEarliestHour: clampHour(row.slotEarliestHour, slotEarliestHour ?? defaults.slotEarliestHour),
      slotLatestHour: clampHour(row.slotLatestHour, slotLatestHour ?? defaults.slotLatestHour),
      allowWeekends:
        row.allowWeekends !== undefined ? row.allowWeekends === true : allowWeekends ?? defaults.allowWeekends,
      companies: companies ?? [],
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("Unknown argument `totalSessions`") ||
        error.message.includes("Unknown argument `partnerExtraQuestionsByRound`") ||
        error.message.includes("Unknown argument `sessionGuidelinesByRound`") ||
        error.message.includes("Unknown argument `slotEarliestHour`") ||
        error.message.includes("Unknown argument `slotLatestHour`") ||
        error.message.includes("Unknown argument `allowWeekends`") ||
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
        ...defaults,
        id: String(row.id ?? "app"),
        slotDurationMinutes: Number(row.slotDurationMinutes ?? input.slotDurationMinutes),
        totalSessions: input.totalSessions,
        timezone: String(row.timezone ?? input.timezone),
        availabilitySlotOptions,
        partnerExtraQuestionsByRound:
          partnerExtraQuestionsByRound ?? { ...DEFAULT_PARTNER_EXTRA_QUESTIONS },
        clientExtraQuestionsByRound:
          clientExtraQuestionsByRound ?? { ...DEFAULT_CLIENT_EXTRA_QUESTIONS },
        sessionGuidelinesByRound:
          sessionGuidelinesByRound ?? { ...DEFAULT_SESSION_GUIDELINES },
        slotEarliestHour: slotEarliestHour ?? defaults.slotEarliestHour,
        slotLatestHour: slotLatestHour ?? defaults.slotLatestHour,
        allowWeekends: allowWeekends ?? defaults.allowWeekends,
      };
    }
    await upsertByRawSql({
      slotDurationMinutes: input.slotDurationMinutes,
      totalSessions: input.totalSessions,
      timezone: input.timezone,
    }).catch(() => null);
    return {
      ...defaults,
      slotDurationMinutes: input.slotDurationMinutes,
      totalSessions: input.totalSessions,
      timezone: input.timezone,
      availabilitySlotOptions,
      partnerExtraQuestionsByRound:
        partnerExtraQuestionsByRound ?? { ...DEFAULT_PARTNER_EXTRA_QUESTIONS },
      clientExtraQuestionsByRound:
        clientExtraQuestionsByRound ?? { ...DEFAULT_CLIENT_EXTRA_QUESTIONS },
      sessionGuidelinesByRound:
        sessionGuidelinesByRound ?? { ...DEFAULT_SESSION_GUIDELINES },
      slotEarliestHour: slotEarliestHour ?? defaults.slotEarliestHour,
      slotLatestHour: slotLatestHour ?? defaults.slotLatestHour,
      allowWeekends: allowWeekends ?? defaults.allowWeekends,
    };
  }
}

/* ============================================================== *
 * Company-specific override (per-tenant settings)
 * Firestore: companyAppSettings/{companyId}
 * Prisma フォールバックでは現状の DB スキーマに該当テーブルがないため未保存。
 * （本番は Firebase バックエンドで動作する想定）
 * ============================================================== */

function sanitizeCompanyId(id: string | null | undefined): string {
  return (id ?? "")
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 60);
}

/**
 * 企業ごとの上書き設定を取得する。未設定 / 不正な companyId の場合は null。
 * グローバル設定との合成は `getEffectiveAppSettings` を使う。
 */
export async function getCompanyAppSettingsOverride(
  companyId: string | null | undefined,
): Promise<CompanyAppSettingsOverride | null> {
  const cid = sanitizeCompanyId(companyId);
  if (!cid) return null;
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const snap = await db.collection("companyAppSettings").doc(cid).get();
    if (!snap.exists) return null;
    return normalizeCompanyAppSettingsOverride(cid, snap.data() ?? {});
  }
  return null;
}

/**
 * 企業ごとの上書き設定を upsert する。
 * - `clear: true` の場合は当該フィールドを未設定（=グローバル継承）に戻す
 * - 指定されていないフィールドは既存値を保持する
 */
export async function upsertCompanyAppSettingsOverride(
  companyId: string,
  patch: Partial<AppSettingsOverridableFields> & {
    clearFields?: Array<keyof AppSettingsOverridableFields>;
    partnerProjectOverview?: PartnerProjectOverview | null;
    clientProjectOverview?: ClientProjectOverview | null;
    clearPartnerProjectOverview?: boolean;
    clearClientProjectOverview?: boolean;
    /** 明示的に true / false を指定。undefined の場合は変更しない（既存値を保持）。 */
    shareFtaWithinCompany?: boolean;
  },
): Promise<CompanyAppSettingsOverride | null> {
  const cid = sanitizeCompanyId(companyId);
  if (!cid) return null;
  if (!isFirebaseDataBackend()) return null;
  const db = getFirebaseFirestoreClient();
  if (!db) return null;
  const ref = db.collection("companyAppSettings").doc(cid);

  const {
    clearPartnerProjectOverview,
    clearClientProjectOverview,
    partnerProjectOverview: patchPartnerPo,
    clientProjectOverview: patchClientPo,
    shareFtaWithinCompany: patchShareFta,
    ...restPatch
  } = patch;

  const normalized = normalizeCompanyAppSettingsOverride(cid, restPatch);
  const writeData: Record<string, unknown> = {
    companyId: cid,
    updatedAt: new Date().toISOString(),
  };
  for (const [k, v] of Object.entries(normalized)) {
    if (k === "companyId" || k === "updatedAt") continue;
    if (v !== undefined) writeData[k] = v;
  }
  const { FieldValue } = await import("firebase-admin/firestore");
  if (patch.clearFields && patch.clearFields.length > 0) {
    for (const key of patch.clearFields) {
      writeData[key] = FieldValue.delete();
    }
  }
  if (clearPartnerProjectOverview) {
    writeData.partnerProjectOverview = FieldValue.delete();
  } else if (patchPartnerPo !== undefined) {
    const po = patchPartnerPo === null ? null : normalizePartnerProjectOverview(patchPartnerPo);
    writeData.partnerProjectOverview = po ?? FieldValue.delete();
  }
  if (clearClientProjectOverview) {
    writeData.clientProjectOverview = FieldValue.delete();
  } else if (patchClientPo !== undefined) {
    const co = patchClientPo === null ? null : normalizeClientProjectOverview(patchClientPo);
    writeData.clientProjectOverview = co ?? FieldValue.delete();
  }
  if (patchShareFta !== undefined) {
    writeData.shareFtaWithinCompany = patchShareFta;
  }
  await ref.set(writeData, { merge: true });
  const snap = await ref.get();
  return normalizeCompanyAppSettingsOverride(cid, snap.data() ?? {});
}

/** 企業上書きをまるごと削除する（=グローバル設定をそのまま使う状態に戻す）。 */
export async function deleteCompanyAppSettingsOverride(companyId: string): Promise<void> {
  const cid = sanitizeCompanyId(companyId);
  if (!cid) return;
  if (!isFirebaseDataBackend()) return;
  const db = getFirebaseFirestoreClient();
  if (!db) return;
  await db.collection("companyAppSettings").doc(cid).delete().catch(() => undefined);
}

/**
 * 実効設定（global + company override）を返す。
 * - `companyId` 無し / 未登録 / 上書き無し → グローバル設定そのまま
 * - 上書きあり → 当該フィールドだけ差し替える
 * 戻り値の `overriddenFields` で「どのフィールドが企業側で上書きされているか」が分かる。
 */
export type EffectiveAppSettings = AppSettingsRow & {
  effectiveCompanyId: string | null;
  overriddenFields: Array<keyof AppSettingsOverridableFields>;
  partnerProjectOverview: PartnerProjectOverview | null;
  clientProjectOverview: ClientProjectOverview | null;
  /**
   * 同じ companyId 内で自分FTA を相互閲覧できるか。
   * 企業設定で明示的に false が設定された場合のみ false。それ以外（未設定 / true）は true。
   */
  shareFtaWithinCompany: boolean;
};

export async function getEffectiveAppSettings(opts: {
  companyId?: string | null;
  global?: AppSettingsRow | null;
  override?: CompanyAppSettingsOverride | null;
} = {}): Promise<EffectiveAppSettings> {
  const global = opts.global ?? (await getAppSettingsRow());
  const cid = sanitizeCompanyId(opts.companyId);
  if (!cid) {
    return {
      ...global,
      effectiveCompanyId: null,
      overriddenFields: [],
      partnerProjectOverview: null,
      clientProjectOverview: null,
      // 企業未設定（=未割当 / 不正 ID）でもデフォルトは「共有する」。
      shareFtaWithinCompany: true,
    };
  }
  const override =
    opts.override !== undefined ? opts.override : await getCompanyAppSettingsOverride(cid);
  if (!override) {
    return {
      ...global,
      effectiveCompanyId: cid,
      overriddenFields: [],
      partnerProjectOverview: null,
      clientProjectOverview: null,
      shareFtaWithinCompany: true,
    };
  }
  const overridden: Array<keyof AppSettingsOverridableFields> = [];
  const merged: AppSettingsRow = { ...global };
  const keys: Array<keyof AppSettingsOverridableFields> = [
    "slotDurationMinutes",
    "totalSessions",
    "timezone",
    "partnerExtraQuestionsByRound",
    "clientExtraQuestionsByRound",
    "sessionGuidelinesByRound",
    "slotEarliestHour",
    "slotLatestHour",
    "allowWeekends",
  ];
  for (const k of keys) {
    const v = override[k];
    if (v !== undefined) {
      (merged as Record<string, unknown>)[k] = v;
      overridden.push(k);
    }
  }
  const partnerPO =
    override.partnerProjectOverview !== undefined && override.partnerProjectOverview !== null
      ? normalizePartnerProjectOverview(override.partnerProjectOverview)
      : null;
  const clientPO =
    override.clientProjectOverview !== undefined && override.clientProjectOverview !== null
      ? normalizeClientProjectOverview(override.clientProjectOverview)
      : null;
  return {
    ...merged,
    effectiveCompanyId: cid,
    overriddenFields: overridden,
    partnerProjectOverview: partnerPO,
    clientProjectOverview: clientPO,
    // 明示的に false が保存されている時のみ false（未設定 / true は true）。
    shareFtaWithinCompany: override.shareFtaWithinCompany === false ? false : true,
  };
}
