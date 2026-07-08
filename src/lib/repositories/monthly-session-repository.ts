/**
 * 月額プラン（セッション申し込み）専用リポジトリ。
 * matches / negotiations には触れない。
 */
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import {
  DEFAULT_MONTHLY_RECEPTION,
  MONTHLY_SLOT_MINUTES,
  addMinutesIso,
  earliestBookableAt,
  isMonthlyServiceType,
  normalizeMonthlyReception,
  normalizeMonthlyServiceTypes,
  tokyoMonthKey,
  type MonthlyBookingStatus,
  type MonthlyReceptionSettings,
  type MonthlyServiceType,
} from "@/lib/monthly-session";
import { listProgramsForCompany } from "@/lib/repositories/program-repository";
import { getUserById } from "@/lib/repositories/user-repository";
import { companyLabelFromRegistry } from "@/lib/company-display";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";

const COL = {
  settings: "monthlySessionSettings",
  settingsDoc: "global",
  profiles: "monthlyPartnerProfiles",
  availability: "monthlyAvailabilitySlots",
  bookings: "monthlyBookings",
  messages: "monthlyBookingMessages",
} as const;

export type MonthlyGlobalSettings = {
  eligiblePartnerIds: string[];
  reception: MonthlyReceptionSettings;
  /** programId → 月あたり予約上限 */
  monthlyLimitsByProgramId: Record<string, number>;
  updatedAt: string;
};

export type MonthlyPartnerProfile = {
  partnerId: string;
  fullName: string;
  career: string;
  bio: string;
  services: MonthlyServiceType[];
  updatedAt: string;
};

export type MonthlyAvailabilitySlot = {
  id: string;
  partnerId: string;
  startAt: string;
  endAt: string;
  createdAt: string;
};

export type MonthlyBooking = {
  id: string;
  clientId: string;
  partnerId: string;
  companyId: string;
  programId: string;
  serviceType: MonthlyServiceType;
  startAt: string;
  endAt: string;
  status: MonthlyBookingStatus;
  createdAt: string;
  cancelledAt: string | null;
};

export type MonthlyBookingMessage = {
  id: string;
  bookingId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

function emptyGlobal(): MonthlyGlobalSettings {
  return {
    eligiblePartnerIds: [],
    reception: { ...DEFAULT_MONTHLY_RECEPTION, updatedAt: new Date().toISOString() },
    monthlyLimitsByProgramId: {},
    updatedAt: new Date().toISOString(),
  };
}

function normalizeGlobal(raw: Record<string, unknown> | undefined): MonthlyGlobalSettings {
  if (!raw) return emptyGlobal();
  const eligible = Array.isArray(raw.eligiblePartnerIds)
    ? raw.eligiblePartnerIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  const limits: Record<string, number> = {};
  if (raw.monthlyLimitsByProgramId && typeof raw.monthlyLimitsByProgramId === "object") {
    for (const [k, v] of Object.entries(raw.monthlyLimitsByProgramId as Record<string, unknown>)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isInteger(n) && n >= 0 && n <= 500) limits[k] = n;
    }
  }
  return {
    eligiblePartnerIds: [...new Set(eligible)],
    reception: normalizeMonthlyReception(raw.reception),
    monthlyLimitsByProgramId: limits,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export async function getMonthlyGlobalSettings(): Promise<MonthlyGlobalSettings> {
  if (!isFirebaseDataBackend()) return emptyGlobal();
  const db = getFirebaseFirestoreClient();
  if (!db) return emptyGlobal();
  const snap = await db.collection(COL.settings).doc(COL.settingsDoc).get();
  return normalizeGlobal(snap.data() as Record<string, unknown> | undefined);
}

export async function upsertMonthlyGlobalSettings(
  patch: Partial<{
    eligiblePartnerIds: string[];
    reception: Partial<MonthlyReceptionSettings>;
    monthlyLimitsByProgramId: Record<string, number>;
  }>,
): Promise<MonthlyGlobalSettings> {
  if (!isFirebaseDataBackend()) return emptyGlobal();
  const db = getFirebaseFirestoreClient();
  if (!db) return emptyGlobal();
  const current = await getMonthlyGlobalSettings();
  const next: MonthlyGlobalSettings = {
    eligiblePartnerIds:
      patch.eligiblePartnerIds !== undefined
        ? [...new Set(patch.eligiblePartnerIds.filter(Boolean))]
        : current.eligiblePartnerIds,
    reception: patch.reception
      ? normalizeMonthlyReception({ ...current.reception, ...patch.reception })
      : current.reception,
    monthlyLimitsByProgramId:
      patch.monthlyLimitsByProgramId !== undefined
        ? { ...current.monthlyLimitsByProgramId, ...patch.monthlyLimitsByProgramId }
        : current.monthlyLimitsByProgramId,
    updatedAt: new Date().toISOString(),
  };
  await db.collection(COL.settings).doc(COL.settingsDoc).set(next, { merge: true });
  return next;
}

export async function setProgramMonthlyLimit(programId: string, limit: number | null) {
  const settings = await getMonthlyGlobalSettings();
  const next = { ...settings.monthlyLimitsByProgramId };
  if (limit === null || limit <= 0) delete next[programId];
  else next[programId] = Math.min(500, Math.max(1, Math.floor(limit)));
  return upsertMonthlyGlobalSettings({ monthlyLimitsByProgramId: next });
}

export async function isEligibleMonthlyPartner(partnerId: string): Promise<boolean> {
  const s = await getMonthlyGlobalSettings();
  return s.eligiblePartnerIds.includes(partnerId);
}

export async function getMonthlyPartnerProfile(
  partnerId: string,
): Promise<MonthlyPartnerProfile | null> {
  if (!isFirebaseDataBackend()) return null;
  const db = getFirebaseFirestoreClient();
  if (!db) return null;
  const snap = await db.collection(COL.profiles).doc(partnerId).get();
  if (!snap.exists) return null;
  const raw = snap.data() as Record<string, unknown>;
  return {
    partnerId,
    fullName: typeof raw.fullName === "string" ? raw.fullName.slice(0, 80) : "",
    career: typeof raw.career === "string" ? raw.career.slice(0, 4000) : "",
    bio: typeof raw.bio === "string" ? raw.bio.slice(0, 4000) : "",
    services: normalizeMonthlyServiceTypes(raw.services),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export async function upsertMonthlyPartnerProfile(
  partnerId: string,
  patch: { fullName?: string; career?: string; bio?: string; services?: MonthlyServiceType[] },
): Promise<MonthlyPartnerProfile | null> {
  if (!isFirebaseDataBackend()) return null;
  const db = getFirebaseFirestoreClient();
  if (!db) return null;
  const current = (await getMonthlyPartnerProfile(partnerId)) ?? {
    partnerId,
    fullName: "",
    career: "",
    bio: "",
    services: [] as MonthlyServiceType[],
    updatedAt: new Date().toISOString(),
  };
  const next: MonthlyPartnerProfile = {
    partnerId,
    fullName:
      patch.fullName !== undefined ? patch.fullName.trim().slice(0, 80) : current.fullName,
    career: patch.career !== undefined ? patch.career.trim().slice(0, 4000) : current.career,
    bio: patch.bio !== undefined ? patch.bio.trim().slice(0, 4000) : current.bio,
    services: patch.services !== undefined ? normalizeMonthlyServiceTypes(patch.services) : current.services,
    updatedAt: new Date().toISOString(),
  };
  await db.collection(COL.profiles).doc(partnerId).set(next, { merge: true });
  return next;
}

export async function listAvailabilityForPartner(
  partnerId: string,
  opts?: { fromIso?: string },
): Promise<MonthlyAvailabilitySlot[]> {
  if (!isFirebaseDataBackend()) return [];
  const db = getFirebaseFirestoreClient();
  if (!db) return [];
  const snap = await db.collection(COL.availability).where("partnerId", "==", partnerId).get();
  const from = opts?.fromIso ?? earliestBookableAt().toISOString();
  return snap.docs
    .map((d) => {
      const raw = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        partnerId: String(raw.partnerId ?? ""),
        startAt: String(raw.startAt ?? ""),
        endAt: String(raw.endAt ?? ""),
        createdAt: String(raw.createdAt ?? ""),
      };
    })
    .filter((s) => s.startAt >= from)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export async function addAvailabilitySlots(
  partnerId: string,
  startAts: string[],
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  if (!isFirebaseDataBackend()) return { ok: false, error: "Firebase 未設定です。" };
  const db = getFirebaseFirestoreClient();
  if (!db) return { ok: false, error: "Firestore 未設定です。" };
  const settings = await getMonthlyGlobalSettings();
  const minStart = earliestBookableAt().toISOString();
  const existing = await listAvailabilityForPartner(partnerId, { fromIso: "1970-01-01T00:00:00.000Z" });
  const existingSet = new Set(existing.map((s) => s.startAt));
  const bookings = await listBookingsForPartner(partnerId, { statuses: ["confirmed"] });
  const bookedSet = new Set(bookings.map((b) => b.startAt));

  let created = 0;
  for (const startAt of startAts) {
    if (startAt < minStart) continue;
    if (existingSet.has(startAt) || bookedSet.has(startAt)) continue;
    const start = new Date(startAt);
    if (!Number.isFinite(start.getTime())) continue;
    // 受付時間・曜日チェック（JST）
    const jstParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
    }).formatToParts(start);
    const hour = Number(jstParts.find((p) => p.type === "hour")?.value);
    const minute = Number(jstParts.find((p) => p.type === "minute")?.value);
    if (minute !== 0 && minute !== 30) continue;
    if (hour < settings.reception.earliestHour) continue;
    if (hour * 60 + minute + MONTHLY_SLOT_MINUTES > settings.reception.latestHour * 60) continue;
    const weekday = start.toLocaleString("en-US", { timeZone: "Asia/Tokyo", weekday: "short" });
    const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const wd = map[weekday];
    if (wd === undefined || settings.reception.closedWeekdays.includes(wd)) continue;

    const endAt = addMinutesIso(startAt, MONTHLY_SLOT_MINUTES);
    const ref = db.collection(COL.availability).doc();
    await ref.set({
      partnerId,
      startAt,
      endAt,
      createdAt: new Date().toISOString(),
    });
    created += 1;
    existingSet.add(startAt);
  }
  return { ok: true, created };
}

export async function deleteAvailabilitySlot(
  partnerId: string,
  slotId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isFirebaseDataBackend()) return { ok: false, error: "Firebase 未設定です。" };
  const db = getFirebaseFirestoreClient();
  if (!db) return { ok: false, error: "Firestore 未設定です。" };
  const ref = db.collection(COL.availability).doc(slotId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "枠が見つかりません。" };
  if (String((snap.data() as Record<string, unknown>).partnerId ?? "") !== partnerId) {
    return { ok: false, error: "権限がありません。" };
  }
  await ref.delete();
  return { ok: true };
}

function normalizeBooking(id: string, raw: Record<string, unknown>): MonthlyBooking | null {
  const serviceType = raw.serviceType;
  if (!isMonthlyServiceType(serviceType)) return null;
  const status = raw.status === "cancelled" || raw.status === "completed" ? raw.status : "confirmed";
  return {
    id,
    clientId: String(raw.clientId ?? ""),
    partnerId: String(raw.partnerId ?? ""),
    companyId: String(raw.companyId ?? ""),
    programId: String(raw.programId ?? ""),
    serviceType,
    startAt: String(raw.startAt ?? ""),
    endAt: String(raw.endAt ?? ""),
    status,
    createdAt: String(raw.createdAt ?? ""),
    cancelledAt: typeof raw.cancelledAt === "string" ? raw.cancelledAt : null,
  };
}

export async function listBookingsForPartner(
  partnerId: string,
  opts?: { statuses?: MonthlyBookingStatus[] },
): Promise<MonthlyBooking[]> {
  if (!isFirebaseDataBackend()) return [];
  const db = getFirebaseFirestoreClient();
  if (!db) return [];
  const snap = await db.collection(COL.bookings).where("partnerId", "==", partnerId).get();
  const statuses = new Set(opts?.statuses ?? ["confirmed", "cancelled", "completed"]);
  return snap.docs
    .map((d) => normalizeBooking(d.id, d.data() as Record<string, unknown>))
    .filter((b): b is MonthlyBooking => b !== null && statuses.has(b.status))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export async function listBookingsForClient(
  clientId: string,
  opts?: { statuses?: MonthlyBookingStatus[] },
): Promise<MonthlyBooking[]> {
  if (!isFirebaseDataBackend()) return [];
  const db = getFirebaseFirestoreClient();
  if (!db) return [];
  const snap = await db.collection(COL.bookings).where("clientId", "==", clientId).get();
  const statuses = new Set(opts?.statuses ?? ["confirmed", "cancelled", "completed"]);
  return snap.docs
    .map((d) => normalizeBooking(d.id, d.data() as Record<string, unknown>))
    .filter((b): b is MonthlyBooking => b !== null && statuses.has(b.status))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export async function listAllBookings(opts?: {
  statuses?: MonthlyBookingStatus[];
}): Promise<MonthlyBooking[]> {
  if (!isFirebaseDataBackend()) return [];
  const db = getFirebaseFirestoreClient();
  if (!db) return [];
  const snap = await db.collection(COL.bookings).get();
  const statuses = new Set(opts?.statuses ?? ["confirmed", "cancelled", "completed"]);
  return snap.docs
    .map((d) => normalizeBooking(d.id, d.data() as Record<string, unknown>))
    .filter((b): b is MonthlyBooking => b !== null && statuses.has(b.status))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export async function getBookingById(bookingId: string): Promise<MonthlyBooking | null> {
  if (!isFirebaseDataBackend()) return null;
  const db = getFirebaseFirestoreClient();
  if (!db) return null;
  const snap = await db.collection(COL.bookings).doc(bookingId).get();
  if (!snap.exists) return null;
  return normalizeBooking(snap.id, snap.data() as Record<string, unknown>);
}

export async function countConfirmedBookingsInMonth(
  clientId: string,
  programId: string,
  monthKey: string,
): Promise<number> {
  const bookings = await listBookingsForClient(clientId, { statuses: ["confirmed", "completed"] });
  return bookings.filter(
    (b) => b.programId === programId && tokyoMonthKey(b.startAt) === monthKey,
  ).length;
}

/** 種別・開始時刻で空きパートナーを返す（プロフィール込み） */
export async function listOpenSlotsForService(opts: {
  serviceType: MonthlyServiceType;
  fromYmd: string;
  toYmd: string;
}): Promise<
  Array<{
    startAt: string;
    endAt: string;
    partners: Array<{
      partnerId: string;
      displayName: string;
      profile: MonthlyPartnerProfile | null;
    }>;
  }>
> {
  const settings = await getMonthlyGlobalSettings();
  const eligible = settings.eligiblePartnerIds;
  if (eligible.length === 0) return [];

  const minStart = earliestBookableAt().toISOString();
  const fromIso = new Date(`${opts.fromYmd}T00:00:00+09:00`).toISOString();
  const toIso = new Date(`${opts.toYmd}T23:59:59+09:00`).toISOString();

  const slotMap = new Map<string, Set<string>>();
  for (const partnerId of eligible) {
    const profile = await getMonthlyPartnerProfile(partnerId);
    if (!profile || !profile.services.includes(opts.serviceType)) continue;
    const slots = await listAvailabilityForPartner(partnerId, { fromIso: minStart });
    for (const s of slots) {
      if (s.startAt < fromIso || s.startAt > toIso) continue;
      if (!slotMap.has(s.startAt)) slotMap.set(s.startAt, new Set());
      slotMap.get(s.startAt)!.add(partnerId);
    }
  }

  const out: Array<{
    startAt: string;
    endAt: string;
    partners: Array<{
      partnerId: string;
      displayName: string;
      profile: MonthlyPartnerProfile | null;
    }>;
  }> = [];

  const sorted = [...slotMap.keys()].sort();
  for (const startAt of sorted) {
    const partners: Array<{
      partnerId: string;
      displayName: string;
      profile: MonthlyPartnerProfile | null;
    }> = [];
    for (const partnerId of slotMap.get(startAt) ?? []) {
      const user = await getUserById(partnerId);
      const profile = await getMonthlyPartnerProfile(partnerId);
      partners.push({
        partnerId,
        displayName: profile?.fullName?.trim() || user?.displayName || "パートナー",
        profile,
      });
    }
    if (partners.length === 0) continue;
    out.push({
      startAt,
      endAt: addMinutesIso(startAt, MONTHLY_SLOT_MINUTES),
      partners,
    });
  }
  return out;
}

export async function createMonthlyBooking(input: {
  clientId: string;
  partnerId: string;
  companyId: string;
  programId: string;
  serviceType: MonthlyServiceType;
  startAt: string;
}): Promise<{ ok: true; booking: MonthlyBooking } | { ok: false; error: string }> {
  if (!isFirebaseDataBackend()) return { ok: false, error: "Firebase 未設定です。" };
  const db = getFirebaseFirestoreClient();
  if (!db) return { ok: false, error: "Firestore 未設定です。" };

  const settings = await getMonthlyGlobalSettings();
  if (!settings.eligiblePartnerIds.includes(input.partnerId)) {
    return { ok: false, error: "このパートナーは予約対象外です。" };
  }
  const profile = await getMonthlyPartnerProfile(input.partnerId);
  if (!profile?.services.includes(input.serviceType)) {
    return { ok: false, error: "このパートナーは選択された種別に対応していません。" };
  }
  if (input.startAt < earliestBookableAt().toISOString()) {
    return { ok: false, error: "予約は48時間後以降の枠のみ可能です。" };
  }

  const slots = await listAvailabilityForPartner(input.partnerId, {
    fromIso: input.startAt,
  });
  const slot = slots.find((s) => s.startAt === input.startAt);
  if (!slot) return { ok: false, error: "選択した枠は空きではありません。" };

  const existingAtSlot = await listBookingsForPartner(input.partnerId, { statuses: ["confirmed"] });
  if (existingAtSlot.some((b) => b.startAt === input.startAt)) {
    return { ok: false, error: "この枠は既に予約されています。" };
  }

  const limit = settings.monthlyLimitsByProgramId[input.programId] ?? 0;
  if (limit > 0) {
    const used = await countConfirmedBookingsInMonth(
      input.clientId,
      input.programId,
      tokyoMonthKey(input.startAt),
    );
    if (used >= limit) {
      return { ok: false, error: `今月の予約上限（${limit}回）に達しています。` };
    }
  }

  const endAt = addMinutesIso(input.startAt, MONTHLY_SLOT_MINUTES);
  const ref = db.collection(COL.bookings).doc();
  const booking: MonthlyBooking = {
    id: ref.id,
    clientId: input.clientId,
    partnerId: input.partnerId,
    companyId: input.companyId,
    programId: input.programId,
    serviceType: input.serviceType,
    startAt: input.startAt,
    endAt,
    status: "confirmed",
    createdAt: new Date().toISOString(),
    cancelledAt: null,
  };
  await ref.set(booking);
  // 空き枠を消す
  await db.collection(COL.availability).doc(slot.id).delete().catch(() => undefined);
  return { ok: true, booking };
}

export async function cancelMonthlyBooking(
  bookingId: string,
  actorUserId: string,
): Promise<{ ok: true; booking: MonthlyBooking } | { ok: false; error: string }> {
  const booking = await getBookingById(bookingId);
  if (!booking) return { ok: false, error: "予約が見つかりません。" };
  if (booking.status !== "confirmed") return { ok: false, error: "この予約はキャンセルできません。" };

  const actor = await getUserById(actorUserId);
  const isAdmin = actor?.role === "ADMIN" || actor?.role === "ADMIN_ASSISTANT";
  if (booking.clientId !== actorUserId && booking.partnerId !== actorUserId && !isAdmin) {
    return { ok: false, error: "権限がありません。" };
  }
  const { canCancelBooking } = await import("@/lib/monthly-session");
  if (!canCancelBooking(booking.startAt) && !isAdmin) {
    return { ok: false, error: "開始24時間前を過ぎたためキャンセルできません。" };
  }

  if (!isFirebaseDataBackend()) return { ok: false, error: "Firebase 未設定です。" };
  const db = getFirebaseFirestoreClient();
  if (!db) return { ok: false, error: "Firestore 未設定です。" };

  const next: MonthlyBooking = {
    ...booking,
    status: "cancelled",
    cancelledAt: new Date().toISOString(),
  };
  await db.collection(COL.bookings).doc(bookingId).set(next, { merge: true });

  if (booking.startAt >= earliestBookableAt().toISOString()) {
    await addAvailabilitySlots(booking.partnerId, [booking.startAt]);
  }
  return { ok: true, booking: next };
}

export async function listMonthlyMessages(bookingId: string) {
  if (!isFirebaseDataBackend()) return [];
  const db = getFirebaseFirestoreClient();
  if (!db) return [];
  const snap = await db.collection(COL.messages).where("bookingId", "==", bookingId).get();
  const rows = snap.docs.map((d) => {
    const raw = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      bookingId: String(raw.bookingId ?? ""),
      senderId: String(raw.senderId ?? ""),
      body: String(raw.body ?? ""),
      createdAt: String(raw.createdAt ?? ""),
    } satisfies MonthlyBookingMessage;
  });
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function createMonthlyMessage(
  bookingId: string,
  senderId: string,
  body: string,
): Promise<{ ok: true; message: MonthlyBookingMessage } | { ok: false; error: string }> {
  const text = body.trim().slice(0, 4000);
  if (!text) return { ok: false, error: "メッセージを入力してください。" };
  if (!isFirebaseDataBackend()) return { ok: false, error: "Firebase 未設定です。" };
  const db = getFirebaseFirestoreClient();
  if (!db) return { ok: false, error: "Firestore 未設定です。" };
  const ref = db.collection(COL.messages).doc();
  const message: MonthlyBookingMessage = {
    id: ref.id,
    bookingId,
    senderId,
    body: text,
    createdAt: new Date().toISOString(),
  };
  await ref.set(message);
  return { ok: true, message };
}

/** クライアントが月額プログラムに参加しているか */
export async function resolveMonthlyProgramForClient(clientId: string): Promise<{
  companyId: string;
  programId: string;
  monthlyLimit: number;
  usedThisMonth: number;
} | null> {
  const user = await getUserById(clientId);
  if (!user) return null;
  const companyId = String((user as { companyId?: string | null }).companyId ?? "").trim();
  if (!companyId) return null;
  const programs = await listProgramsForCompany(companyId);
  const monthly = programs.filter((p) => p.plan === "monthly_session");
  if (monthly.length === 0) return null;
  const enrolled = Array.isArray((user as { enrolledProgramIds?: string[] }).enrolledProgramIds)
    ? ((user as { enrolledProgramIds?: string[] }).enrolledProgramIds ?? [])
    : [];
  const target =
    enrolled.length > 0
      ? monthly.find((p) => enrolled.includes(p.id)) ?? null
      : monthly[0] ?? null;
  if (!target) return null;
  const settings = await getMonthlyGlobalSettings();
  const monthlyLimit = settings.monthlyLimitsByProgramId[target.id] ?? 0;
  const usedThisMonth = await countConfirmedBookingsInMonth(
    clientId,
    target.id,
    tokyoMonthKey(new Date()),
  );
  return { companyId, programId: target.id, monthlyLimit, usedThisMonth };
}

export async function enrichBookingForDisplay(booking: MonthlyBooking) {
  const [client, partner, profile, settings] = await Promise.all([
    getUserById(booking.clientId),
    getUserById(booking.partnerId),
    getMonthlyPartnerProfile(booking.partnerId),
    getAppSettingsRow(),
  ]);
  const companyName = companyLabelFromRegistry(booking.companyId, settings.companies);
  return {
    ...booking,
    clientDisplayName: client?.displayName ?? "クライアント",
    partnerDisplayName: profile?.fullName?.trim() || partner?.displayName || "パートナー",
    companyName: companyName ?? booking.companyId,
  };
}
