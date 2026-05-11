import { getAppSettings } from "@/lib/app-settings";
import { getEffectiveAppSettingsForMatch } from "@/lib/effective-app-settings";
import { jsonOk } from "@/lib/json";

/**
 * 認証なしで枠情報を読む。
 * `?matchId=...` が指定された場合は、その match に紐付くクライアントの企業の
 * 実効設定（global + 企業上書き）を返す。指定が無ければ従来通りグローバル設定を返す。
 *
 * セキュリティ補足:
 *   ここで返すフィールドは「枠の長さ・候補時間帯・選択肢一覧」など
 *   ユーザー識別を含まない設定値のみ。matchId を渡しても返却されるのは
 *   設定値のみで、ペアのメンバー情報は含めていない。
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const matchId = url.searchParams.get("matchId");
  const s = matchId
    ? await getEffectiveAppSettingsForMatch(matchId)
    : await getAppSettings();
  return jsonOk({
    slotDurationMinutes: s.slotDurationMinutes,
    totalSessions: s.totalSessions,
    timezone: s.timezone,
    availabilitySlotOptions: s.availabilitySlotOptions,
    slotEarliestHour: s.slotEarliestHour,
    slotLatestHour: s.slotLatestHour,
    allowWeekends: s.allowWeekends,
  });
}
