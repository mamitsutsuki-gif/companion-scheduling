import { addMinutes } from "date-fns";
import {
  slotStartPickerStepMinutes,
  type SlotWindowSettings,
  zonedWallClockToUtc,
} from "@/lib/slot-schedule";

export const MAX_PROPOSAL_SLOTS = 30;
export const MIN_PROPOSAL_SLOTS_WARNING = 5;

export type TimeRangeInput = {
  dateYmd: string;
  startTime: string;
  endTime: string;
};

export type GenerateSlotsResult = {
  slots: Array<{ startAt: Date; endAt: Date }>;
  totalGenerated: number;
  truncated: boolean;
};

function parseHm(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

export function generateSlotsFromTimeRanges(
  ranges: TimeRangeInput[],
  settings: SlotWindowSettings,
): GenerateSlotsResult {
  const duration = Math.max(1, settings.slotDurationMinutes);
  const step = slotStartPickerStepMinutes(duration);
  const all: Array<{ startAt: Date; endAt: Date }> = [];
  let truncated = false;

  const sorted = [...ranges].sort((a, b) =>
    `${a.dateYmd}${a.startTime}`.localeCompare(`${b.dateYmd}${b.startTime}`),
  );

  for (const range of sorted) {
    const rangeStartMin = parseHm(range.startTime);
    const rangeEndMin = parseHm(range.endTime);
    if (rangeEndMin <= rangeStartMin) continue;

    const latestStartMin = rangeEndMin - duration;
    for (let total = rangeStartMin; total <= latestStartMin; total += step) {
      const h = Math.floor(total / 60);
      const m = total % 60;
      const timeHm = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const startAt = zonedWallClockToUtc(range.dateYmd, timeHm, settings.timezone);
      const endAt = addMinutes(startAt, duration);

      if (total % step !== 0) continue;
      if (!settings.allowWeekends) {
        const weekday = new Intl.DateTimeFormat("en-US", {
          timeZone: settings.timezone,
          weekday: "short",
        })
          .format(startAt)
          .slice(0, 3);
        if (weekday === "Sat" || weekday === "Sun") continue;
      }

      all.push({ startAt, endAt });
      if (all.length >= MAX_PROPOSAL_SLOTS) {
        truncated = true;
        break;
      }
    }
    if (truncated) break;
  }

  const unique = dedupeSlots(all);
  return {
    slots: unique.slice(0, MAX_PROPOSAL_SLOTS),
    totalGenerated: unique.length,
    truncated: truncated || unique.length > MAX_PROPOSAL_SLOTS,
  };
}

function dedupeSlots(slots: Array<{ startAt: Date; endAt: Date }>) {
  const seen = new Set<string>();
  const out: Array<{ startAt: Date; endAt: Date }> = [];
  for (const s of slots) {
    const key = s.startAt.toISOString();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}
