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
import {
  ensureDefaultProgramForCompany,
  getProgramAppSettingsOverride,
} from "@/lib/repositories/program-repository";
import { resolveCompanyPlan } from "@/lib/company-plan";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ companyId: string }> };

/**
 * 管理者用：特定企業の詳細を返す。
 * 実効設定は「企業レジストリの代表プランのプログラム」上書きを優先して表示する
 * （設定画面の保存先がプログラム単位のため）。
 */
export async function GET(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "ADMIN_ASSISTANT"))
    return jsonError("権限がありません。", 403);

  const { companyId: companyIdRaw } = await ctx.params;
  const companyId = (companyIdRaw ?? "").trim();
  if (!companyId) return jsonError("企業IDが指定されていません。", 400);

  const [settings, matches, companyOverride] = await Promise.all([
    getAppSettingsRow(),
    listMatchesForRole({ role: "ADMIN", userId: session.sub }),
    getCompanyAppSettingsOverride(companyId),
  ]);

  const registered = settings.companies.find((c) => c.id === companyId) ?? null;
  const preferredProgram = registered ? await ensureDefaultProgramForCompany(companyId) : null;
  const programOverride = preferredProgram
    ? await getProgramAppSettingsOverride(preferredProgram.id)
    : null;

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
    programId: preferredProgram?.id ?? null,
    global: settings,
    override: companyOverride,
    programOverride,
  });

  const nowMs = Date.now();
  const pairIds = new Set(pairs.map((p) => p.id));
  const partnerIds = [...new Set(pairs.map((p) => p.partner.id))];

  const allConfirmed = await listEffectiveConfirmedSessionsForAdmin();
  const pastSessionsForCompany = allConfirmed.filter((c) => {
    if (!pairIds.has(c.matchId)) return false;
    const endMs = Date.parse(c.endAt);
    return Number.isFinite(endMs) && endMs <= nowMs;
  });
  const submittedReportSet = new Set<string>();
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

  const displayOverride = programOverride ?? companyOverride;
  const registryPlan = registered
    ? resolveCompanyPlan(companyId, settings.companies)
    : null;

  return jsonOk({
    company: registered ? { id: registered.id, name: registered.name } : null,
    isRegistered: Boolean(registered),
    preferredProgram: preferredProgram
      ? {
          id: preferredProgram.id,
          name: preferredProgram.name,
          plan: preferredProgram.plan,
        }
      : null,
    registryPlan,
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
      effectiveProgramId: effective.effectiveProgramId,
    },
    override: displayOverride
      ? {
          slotDurationMinutes: displayOverride.slotDurationMinutes,
          totalSessions: displayOverride.totalSessions,
          timezone: displayOverride.timezone,
          availabilitySlotOptions: displayOverride.availabilitySlotOptions,
          partnerExtraQuestionsByRound: displayOverride.partnerExtraQuestionsByRound,
          sessionGuidelinesByRound: displayOverride.sessionGuidelinesByRound,
          slotEarliestHour: displayOverride.slotEarliestHour,
          slotLatestHour: displayOverride.slotLatestHour,
          allowWeekends: displayOverride.allowWeekends,
          updatedAt: displayOverride.updatedAt,
          source: programOverride ? "program" : "company",
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
