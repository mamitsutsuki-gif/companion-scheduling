import { resolveAppTimeZone } from "@/lib/format-datetime";

/** 候補の「開始時刻」ピッカー刻み。セッション長とは別（終了は start + duration）。 */
export function slotStartPickerStepMinutes(slotDurationMinutes: number): number {
  const d = Math.max(1, Math.round(slotDurationMinutes));
  if (60 % d === 0) return d;
  return 60;
}

export function slotStartPickerStepLabel(stepMinutes: number): string {
  if (stepMinutes >= 60) return "1時間";
  return `${stepMinutes}分`;
}

export function minutesSinceMidnightInTimeZone(date: Date, timeZone: string): number {
  const tz = resolveAppTimeZone(timeZone);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return Number(parts.hour) * 60 + Number(parts.minute);
}

export function calendarDateInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveAppTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function weekdayShortInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: resolveAppTimeZone(timeZone),
    weekday: "short",
  }).format(date);
}

export type SlotWindowSettings = {
  slotDurationMinutes: number;
  slotEarliestHour: number;
  slotLatestHour: number;
  allowWeekends: boolean;
  timezone: string;
};

export function buildSlotStartTimeOptions(settings: SlotWindowSettings): Array<{ value: string; label: string }> {
  const step = slotStartPickerStepMinutes(settings.slotDurationMinutes);
  const duration = Math.max(1, settings.slotDurationMinutes);
  const earliest = settings.slotEarliestHour * 60;
  const latest = settings.slotLatestHour * 60 - duration;
  const out: Array<{ value: string; label: string }> = [];
  if (latest < earliest) return out;
  for (let total = earliest; total <= latest; total += step) {
    const h = Math.floor(total / 60);
    const m = total % 60;
    const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    out.push({ value, label: value });
  }
  return out;
}

export function isSlotStartOnPickerGrid(start: Date, settings: SlotWindowSettings): boolean {
  const step = slotStartPickerStepMinutes(settings.slotDurationMinutes);
  const duration = Math.max(1, settings.slotDurationMinutes);
  const earliest = settings.slotEarliestHour * 60;
  const latest = settings.slotLatestHour * 60 - duration;
  const total = minutesSinceMidnightInTimeZone(start, settings.timezone);
  if (total < earliest || total > latest) return false;
  return (total - earliest) % step === 0;
}

export function validateSlotWindow(
  start: Date,
  end: Date,
  settings: SlotWindowSettings,
): string | null {
  const tz = resolveAppTimeZone(settings.timezone);
  const startMinutes = minutesSinceMidnightInTimeZone(start, tz);
  const endMinutes = minutesSinceMidnightInTimeZone(end, tz);
  const earliest = settings.slotEarliestHour * 60;
  const latest = settings.slotLatestHour * 60;
  if (startMinutes < earliest || endMinutes > latest) {
    return `候補日時は ${String(settings.slotEarliestHour).padStart(2, "0")}:00〜${String(settings.slotLatestHour).padStart(2, "0")}:00 の間で指定してください。`;
  }
  if (!settings.allowWeekends) {
    const weekday = weekdayShortInTimeZone(start, tz).slice(0, 3);
    if (weekday === "Sat" || weekday === "Sun") {
      return "土曜・日曜は、このサービスの設定では候補として指定できません。";
    }
  }
  return null;
}

/** 確定時の手動微調整: 5分刻み・同一日・許容時間帯内。 */
export function validateManualSlotStart(
  start: Date,
  originalStart: Date,
  settings: SlotWindowSettings,
): string | null {
  const tz = resolveAppTimeZone(settings.timezone);
  if (calendarDateInTimeZone(start, tz) !== calendarDateInTimeZone(originalStart, tz)) {
    return "微調整は、クライアントが ○ を付けた候補と同じ日付の中で行ってください。";
  }
  const minutes = minutesSinceMidnightInTimeZone(start, tz);
  if (minutes % 5 !== 0) {
    return "微調整の開始時刻は 5 分単位で指定してください。";
  }
  const duration = Math.max(1, settings.slotDurationMinutes);
  const endMinutes = minutes + duration;
  const latestEnd = settings.slotLatestHour * 60;
  if (minutes < settings.slotEarliestHour * 60 || endMinutes > latestEnd) {
    return `開始時刻は ${String(settings.slotEarliestHour).padStart(2, "0")}:00〜${String(settings.slotLatestHour).padStart(2, "0")}:00 の範囲（終了 ${duration} 分後まで）に収めてください。`;
  }
  if (!settings.allowWeekends) {
    const weekday = weekdayShortInTimeZone(start, tz).slice(0, 3);
    if (weekday === "Sat" || weekday === "Sun") {
      return "土曜・日曜は指定できません。";
    }
  }
  return null;
}

/** タイムゾーン上の日付＋時刻（壁時計）を UTC Date に変換する。 */
export function zonedWallClockToUtc(dateYmd: string, timeHm: string, timeZone: string): Date {
  const tz = resolveAppTimeZone(timeZone);
  const [y, mo, d] = dateYmd.split("-").map(Number);
  const [h, mi] = timeHm.split(":").map(Number);
  let candidate = new Date(Date.UTC(y, mo - 1, d, h, mi, 0));
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
        .formatToParts(candidate)
        .map((p) => [p.type, p.value]),
    );
    const gotY = Number(parts.year);
    const gotMo = Number(parts.month);
    const gotD = Number(parts.day);
    const gotH = Number(parts.hour);
    const gotMi = Number(parts.minute);
    if (gotY === y && gotMo === mo && gotD === d && gotH === h && gotMi === mi) {
      return candidate;
    }
    const diffMin = (h - gotH) * 60 + (mi - gotMi) + (d - gotD) * 24 * 60 + (mo - gotMo) * 30 * 24 * 60;
    candidate = new Date(candidate.getTime() + diffMin * 60_000);
  }
  return candidate;
}

export function formatTimeHmInZone(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: resolveAppTimeZone(timeZone),
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}
