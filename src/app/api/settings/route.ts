import { getAppSettings } from "@/lib/app-settings";
import { jsonOk } from "@/lib/json";

/** 認証なし／パートナーが日程入力するために枠情報を読む */
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getAppSettings();
  return jsonOk({
    slotDurationMinutes: s.slotDurationMinutes,
    totalSessions: s.totalSessions,
    timezone: s.timezone,
    availabilitySlotOptions: s.availabilitySlotOptions,
  });
}
