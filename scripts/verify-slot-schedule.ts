import {
  buildSlotStartTimeOptions,
  isSlotStartOnPickerGrid,
  slotStartPickerStepMinutes,
} from "../src/lib/slot-schedule";

const base = {
  slotEarliestHour: 8,
  slotLatestHour: 20,
  allowWeekends: true,
  timezone: "Asia/Tokyo",
};

const fortyFive = buildSlotStartTimeOptions({ ...base, slotDurationMinutes: 45 });
if (!fortyFive.some((o) => o.value === "08:00") || !fortyFive.some((o) => o.value === "09:00")) {
  throw new Error("45分セッションの開始候補は1時間刻み（8:00, 9:00…）であるべき");
}
if (fortyFive.some((o) => o.value === "08:45")) {
  throw new Error("45分セッションで 8:45 開始は出さない");
}

const step45 = slotStartPickerStepMinutes(45);
if (step45 !== 60) throw new Error("45分セッションのピッカー刻みは60分");

const nineAm = new Date("2026-06-21T09:00:00+09:00");
if (!isSlotStartOnPickerGrid(nineAm, { ...base, slotDurationMinutes: 45 })) {
  throw new Error("9:00 は45分セッションのグリッド上");
}
const nineThirty = new Date("2026-06-21T09:30:00+09:00");
if (isSlotStartOnPickerGrid(nineThirty, { ...base, slotDurationMinutes: 45 })) {
  throw new Error("9:30 は45分セッションのグリッド外");
}

console.log("verify-slot-schedule: ok");
