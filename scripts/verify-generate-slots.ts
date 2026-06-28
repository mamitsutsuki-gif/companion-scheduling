import { generateSlotsFromTimeRanges, MAX_PROPOSAL_SLOTS } from "@/lib/generate-slots-from-ranges";

const settings = {
  slotDurationMinutes: 30,
  slotEarliestHour: 8,
  slotLatestHour: 20,
  allowWeekends: false,
  timezone: "Asia/Tokyo",
};

const result = generateSlotsFromTimeRanges(
  [{ dateYmd: "2026-07-10", startTime: "18:00", endTime: "21:00" }],
  settings,
);

if (result.slots.length !== 6) {
  console.error("Expected 6 slots for 18:00-21:00 / 30min, got", result.slots.length);
  process.exit(1);
}

const result60 = generateSlotsFromTimeRanges(
  [{ dateYmd: "2026-07-10", startTime: "18:00", endTime: "21:00" }],
  { ...settings, slotDurationMinutes: 60 },
);

if (result60.slots.length !== 3) {
  console.error("Expected 3 slots for 60min sessions, got", result60.slots.length);
  process.exit(1);
}

const many = generateSlotsFromTimeRanges(
  Array.from({ length: 20 }, (_, i) => ({
    dateYmd: `2026-07-${String(10 + (i % 10)).padStart(2, "0")}`,
    startTime: "09:00",
    endTime: "20:00",
  })),
  settings,
);

if (many.slots.length > MAX_PROPOSAL_SLOTS) {
  console.error("Should cap at MAX_PROPOSAL_SLOTS");
  process.exit(1);
}

console.log("verify-generate-slots: ok");
