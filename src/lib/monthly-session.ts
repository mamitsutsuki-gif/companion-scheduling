/**
 * 月額プラン（画面表示名:「セッション申し込み」）の定数・共通ヘルパー。
 * 既存の Match / Negotiation とは完全に分離する。
 */

export const MONTHLY_SERVICE_TYPES = ["counseling", "coaching", "career"] as const;
export type MonthlyServiceType = (typeof MONTHLY_SERVICE_TYPES)[number];

export const MONTHLY_SERVICE_LABELS: Record<MonthlyServiceType, string> = {
  counseling: "カウンセリング",
  coaching: "コーチング",
  career: "キャリア相談",
};

export const MONTHLY_SLOT_MINUTES = 30;
/** 予約・空き枠の登録は現在時刻からこの時間以降のみ */
export const MONTHLY_BOOKING_LEAD_HOURS = 48;
/** 開始何時間前までキャンセル可能か */
export const MONTHLY_CANCEL_DEADLINE_HOURS = 24;

export type MonthlyBookingStatus = "confirmed" | "cancelled" | "completed";

export type MonthlyReceptionSettings = {
  /** 0=日 … 6=土。含めない曜日 = 受付不可 */
  closedWeekdays: number[];
  earliestHour: number;
  latestHour: number;
  updatedAt: string;
};

export const DEFAULT_MONTHLY_RECEPTION: MonthlyReceptionSettings = {
  closedWeekdays: [0, 6],
  earliestHour: 8,
  latestHour: 18,
  updatedAt: new Date(0).toISOString(),
};

export function isMonthlyServiceType(v: unknown): v is MonthlyServiceType {
  return typeof v === "string" && (MONTHLY_SERVICE_TYPES as readonly string[]).includes(v);
}

export function normalizeMonthlyServiceTypes(input: unknown): MonthlyServiceType[] {
  if (!Array.isArray(input)) return [];
  const out: MonthlyServiceType[] = [];
  for (const item of input) {
    if (isMonthlyServiceType(item) && !out.includes(item)) out.push(item);
  }
  return out;
}

export function normalizeMonthlyReception(input: unknown): MonthlyReceptionSettings {
  if (!input || typeof input !== "object") return { ...DEFAULT_MONTHLY_RECEPTION };
  const raw = input as Record<string, unknown>;
  const closed = Array.isArray(raw.closedWeekdays)
    ? raw.closedWeekdays
        .map((n) => (typeof n === "number" ? n : Number(n)))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    : DEFAULT_MONTHLY_RECEPTION.closedWeekdays;
  const earliest =
    typeof raw.earliestHour === "number" && raw.earliestHour >= 0 && raw.earliestHour <= 23
      ? raw.earliestHour
      : DEFAULT_MONTHLY_RECEPTION.earliestHour;
  let latest =
    typeof raw.latestHour === "number" && raw.latestHour >= 1 && raw.latestHour <= 24
      ? raw.latestHour
      : DEFAULT_MONTHLY_RECEPTION.latestHour;
  if (latest <= earliest) latest = earliest + 1;
  return {
    closedWeekdays: [...new Set(closed)].sort(),
    earliestHour: earliest,
    latestHour: latest,
    updatedAt:
      typeof raw.updatedAt === "string" && raw.updatedAt
        ? raw.updatedAt
        : new Date().toISOString(),
  };
}

export function earliestBookableAt(now = new Date()): Date {
  return new Date(now.getTime() + MONTHLY_BOOKING_LEAD_HOURS * 60 * 60 * 1000);
}

export function canCancelBooking(startAtIso: string, now = new Date()): boolean {
  const start = new Date(startAtIso).getTime();
  if (!Number.isFinite(start)) return false;
  return start - now.getTime() >= MONTHLY_CANCEL_DEADLINE_HOURS * 60 * 60 * 1000;
}

export function isChatActiveForBooking(startAtIso: string, endAtIso: string, now = new Date()): boolean {
  const start = new Date(startAtIso);
  const end = new Date(endAtIso);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return false;
  const dayStart = new Date(start);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(start);
  dayEnd.setHours(23, 59, 59, 999);
  const t = now.getTime();
  return t >= dayStart.getTime() && t <= dayEnd.getTime();
}

/** Asia/Tokyo の年月キー YYYY-MM */
export function tokyoMonthKey(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}-${m}`;
}

export function addMinutesIso(startIso: string, minutes: number): string {
  return new Date(new Date(startIso).getTime() + minutes * 60_000).toISOString();
}

/** 受付時間帯の中で、指定日の 30 分枠開始時刻（ISO）を列挙（Asia/Tokyo）。 */
export function listSlotStartsForTokyoDay(
  ymd: string,
  reception: MonthlyReceptionSettings,
): string[] {
  const [y, mo, da] = ymd.split("-").map((n) => Number(n));
  if (!y || !mo || !da) return [];
  // その日の正午 JST を作って曜日判定
  const noonJst = new Date(`${ymd}T12:00:00+09:00`);
  const weekday = noonJst.getDay();
  if (reception.closedWeekdays.includes(weekday)) return [];

  const out: string[] = [];
  for (let h = reception.earliestHour; h < reception.latestHour; h++) {
    for (const m of [0, 30]) {
      if (h === reception.latestHour - 1 && m === 30 && reception.latestHour * 60 === h * 60 + 30) {
        // latest がちょうど枠終了なら許容
      }
      const endMinutes = h * 60 + m + MONTHLY_SLOT_MINUTES;
      if (endMinutes > reception.latestHour * 60) continue;
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      out.push(new Date(`${ymd}T${hh}:${mm}:00+09:00`).toISOString());
    }
  }
  return out;
}

export function formatSlotJa(startIso: string, endIso: string): string {
  try {
    const start = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(startIso));
    const end = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(endIso));
    return `${start}〜${end}`;
  } catch {
    return `${startIso} - ${endIso}`;
  }
}
