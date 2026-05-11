import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import {
  getAppSettingsRow,
  getCompanyAppSettingsOverride,
  getEffectiveAppSettings,
} from "@/lib/repositories/app-settings-repository";
import { listMatchesForRole } from "@/lib/repositories/match-repository";
import { listEffectiveConfirmedSessionsForAdmin } from "@/lib/repositories/confirmed-sessions-admin-repository";
import { listSessionReportsForMatch } from "@/lib/repositories/session-report-repository";
import { listPartnerInvoicesByPartner } from "@/lib/repositories/partner-invoice-repository";

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
  if (!session || (session.role !== "ADMIN" && session.role !== "ADMIN_ASSISTANT"))
    return jsonError("権限がありません。", 403);

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

  // ── サマリ集計 ──────────────────────────────────────────────────────────
  // 1. 終了済みセッション（startAt が既に過ぎたもの）×（この企業のペア）に対し、
  //    パートナーレポートが提出されているかをチェック。
  // 2. 同じペアのパートナーが提出した請求書のうち、未承認（SUBMITTED）または
  //    差戻し対応中（RETURNED）のものをカウント。
  const nowMs = Date.now();
  const pairIds = new Set(pairs.map((p) => p.id));
  const partnerIds = [...new Set(pairs.map((p) => p.partner.id))];

  const allConfirmed = await listEffectiveConfirmedSessionsForAdmin();
  const pastSessionsForCompany = allConfirmed.filter((c) => {
    if (!pairIds.has(c.matchId)) return false;
    const endMs = Date.parse(c.endAt);
    return Number.isFinite(endMs) && endMs <= nowMs;
  });
  const submittedReportSet = new Set<string>(); // `${matchId}:${sessionNumber}`
  await Promise.all(
    [...pairIds].map(async (mid) => {
      const reports = await listSessionReportsForMatch(mid);
      for (const r of reports) submittedReportSet.add(`${mid}:${r.sessionNumber}`);
    }),
  );
  let submittedReports = 0;
  let missingReports = 0;
  for (const c of pastSessionsForCompany) {
    if (submittedReportSet.has(`${c.matchId}:${c.sessionNumber}`)) submittedReports += 1;
    else missingReports += 1;
  }

  let invoicesSubmitted = 0;
  let invoicesReturned = 0;
  let invoicesConfirmed = 0;
  await Promise.all(
    partnerIds.map(async (pid) => {
      const invs = await listPartnerInvoicesByPartner(pid);
      for (const inv of invs) {
        if (inv.status === "SUBMITTED") invoicesSubmitted += 1;
        else if (inv.status === "RETURNED") invoicesReturned += 1;
        else if (inv.status === "CONFIRMED") invoicesConfirmed += 1;
      }
    }),
  );

  return jsonOk({
    company: registered ? { id: registered.id, name: registered.name } : null,
    isRegistered: Boolean(registered),
    pairs,
    pairCount: pairs.length,
    summary: {
      partnerCount: partnerIds.length,
      pastSessions: pastSessionsForCompany.length,
      submittedReports,
      missingReports,
      invoices: {
        submitted: invoicesSubmitted,
        returned: invoicesReturned,
        confirmed: invoicesConfirmed,
      },
    },
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
