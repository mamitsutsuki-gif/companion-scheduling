import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import {
  getAppSettingsRow,
  getCompanyAppSettingsOverride,
  getEffectiveAppSettings,
} from "@/lib/repositories/app-settings-repository";
import { listMatchesForRole } from "@/lib/repositories/match-repository";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ companyId: string }> };

/**
 * 管理者用：特定企業の詳細を返す。
 * - 企業の登録情報（name 等）
 * - 当該企業の登録クライアントが含まれるペア一覧
 * - グローバル設定 + 企業上書きをマージした「実効設定」
 * - 上書きされているフィールドの一覧
 * - 上書き本体（書き込まれている生の値）
 *
 * Tier2（企業ページ）に表示するデータをまとめて返すので、ページ側はこれ 1 本で済む。
 */
export async function GET(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session || session.role !== "ADMIN") return jsonError("権限がありません。", 403);

  const { companyId: companyIdRaw } = await ctx.params;
  const companyId = (companyIdRaw ?? "").trim();
  if (!companyId) return jsonError("企業IDが指定されていません。", 400);

  const [settings, matches, override] = await Promise.all([
    getAppSettingsRow(),
    listMatchesForRole({ role: "ADMIN", userId: session.sub }),
    getCompanyAppSettingsOverride(companyId),
  ]);

  const registered = settings.companies.find((c) => c.id === companyId) ?? null;

  const pairs = (matches as Array<{
    id: string;
    createdAt: string;
    partner: { id: string; displayName: string };
    client: {
      id: string;
      displayName: string;
      companyId?: string | null;
      companyName?: string | null;
    };
  }>)
    .filter((m) => (m.client.companyId ?? "").trim() === companyId)
    .map((m) => ({
      id: m.id,
      createdAt: m.createdAt,
      partner: { id: m.partner.id, displayName: m.partner.displayName },
      client: { id: m.client.id, displayName: m.client.displayName },
    }));

  const effective = await getEffectiveAppSettings({
    companyId,
    global: settings,
    override,
  });

  return jsonOk({
    company: registered ? { id: registered.id, name: registered.name } : null,
    isRegistered: Boolean(registered),
    pairs,
    pairCount: pairs.length,
    effective: {
      slotDurationMinutes: effective.slotDurationMinutes,
      totalSessions: effective.totalSessions,
      timezone: effective.timezone,
      availabilitySlotOptions: effective.availabilitySlotOptions,
      partnerExtraQuestionsByRound: effective.partnerExtraQuestionsByRound,
      sessionGuidelinesByRound: effective.sessionGuidelinesByRound,
      slotEarliestHour: effective.slotEarliestHour,
      slotLatestHour: effective.slotLatestHour,
      allowWeekends: effective.allowWeekends,
      overriddenFields: effective.overriddenFields,
    },
    override: override
      ? {
          slotDurationMinutes: override.slotDurationMinutes,
          totalSessions: override.totalSessions,
          timezone: override.timezone,
          availabilitySlotOptions: override.availabilitySlotOptions,
          partnerExtraQuestionsByRound: override.partnerExtraQuestionsByRound,
          sessionGuidelinesByRound: override.sessionGuidelinesByRound,
          slotEarliestHour: override.slotEarliestHour,
          slotLatestHour: override.slotLatestHour,
          allowWeekends: override.allowWeekends,
          updatedAt: override.updatedAt,
        }
      : null,
    global: {
      slotDurationMinutes: settings.slotDurationMinutes,
      totalSessions: settings.totalSessions,
      timezone: settings.timezone,
      availabilitySlotOptions: settings.availabilitySlotOptions,
      partnerExtraQuestionsByRound: settings.partnerExtraQuestionsByRound,
      sessionGuidelinesByRound: settings.sessionGuidelinesByRound,
      slotEarliestHour: settings.slotEarliestHour,
      slotLatestHour: settings.slotLatestHour,
      allowWeekends: settings.allowWeekends,
    },
  });
}
