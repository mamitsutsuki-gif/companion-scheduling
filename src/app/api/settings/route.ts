import { getAppSettings } from "@/lib/app-settings";
import { getEffectiveAppSettingsForMatch } from "@/lib/effective-app-settings";
import { companyLabelFromRegistry } from "@/lib/company-display";
import { getPlanFeatures } from "@/lib/company-plan";
import { jsonOk } from "@/lib/json";

/**
 * 認証なしで枠情報を読む。
 * `?matchId=...` が指定された場合は、その match に紐付くクライアントの企業の
 * 実効設定（global + 企業上書き）を返す。指定が無ければ従来通りグローバル設定を返す。
 *
 * セキュリティ補足:
 *   ここで返すフィールドは「枠の長さ・候補時間帯・選択肢一覧」など
 *   ユーザー識別を含まない設定値のみ。matchId を渡しても返却されるのは
 *   設定値 + その match に効いている企業の "ID と表示名 と どの項目が上書きされているか"
 *   までで、ペアのメンバー情報は含めていない。company id / name は match のメンバーには
 *   元々見えている情報なのでこの API 経由で渡しても情報露出は増えない。
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const matchId = url.searchParams.get("matchId");
  const s = matchId
    ? await getEffectiveAppSettingsForMatch(matchId)
    : await getAppSettings();
  const effectiveCompanyId =
    "effectiveCompanyId" in s ? (s as { effectiveCompanyId: string | null }).effectiveCompanyId : null;
  const overriddenFields =
    "overriddenFields" in s
      ? (s as { overriddenFields: string[] }).overriddenFields
      : ([] as string[]);
  const effectiveCompanyName = effectiveCompanyId
    ? companyLabelFromRegistry(effectiveCompanyId, s.companies) ?? null
    : null;
  const companyPlan =
    "companyPlan" in s ? (s as { companyPlan: string }).companyPlan : "workplace_activation";
  const planFeatures = getPlanFeatures(
    companyPlan as "workplace_activation" | "individual_companion" | "coaching_management_training",
  );
  return jsonOk({
    slotDurationMinutes: s.slotDurationMinutes,
    totalSessions: s.totalSessions,
    timezone: s.timezone,
    availabilitySlotOptions: s.availabilitySlotOptions,
    slotEarliestHour: s.slotEarliestHour,
    slotLatestHour: s.slotLatestHour,
    allowWeekends: s.allowWeekends,
    effectiveCompanyId,
    effectiveCompanyName,
    overriddenFields,
    companyPlan,
    planFeatures,
  });
}
