import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import {
  type AppSettingsOverridableFields,
  getAppSettingsRow,
  getEffectiveAppSettings,
} from "@/lib/repositories/app-settings-repository";
import {
  deleteProgramAppSettingsOverride,
  getProgramAppSettingsOverride,
  getProgramById,
  upsertProgramAppSettingsOverride,
} from "@/lib/repositories/program-repository";
import { normalizePlanFeatureOverrides, normalizeCoachingPlanSettingsOverrides, resolveCompanyPlan } from "@/lib/company-plan";
import { normalizeCoachingSessionModesByRound } from "@/lib/coaching-session-mode";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ programId: string }> };

const extraQuestionsSchema = z.record(z.string(), z.array(z.string().max(500)).max(8));
const guidelineEntrySchema = z.object({
  client: z.string().max(4000),
  partner: z.string().max(4000),
});
const sessionGuidelinesSchema = z.record(z.string(), guidelineEntrySchema);
const overviewTextField = z.string().max(8000);

const patchSchema = z.object({
  slotDurationMinutes: z.number().int().min(5).max(240).optional(),
  totalSessions: z.number().int().min(1).max(60).optional(),
  timezone: z.string().min(1).max(64).optional(),
  partnerExtraQuestionsByRound: extraQuestionsSchema.optional(),
  clientExtraQuestionsByRound: extraQuestionsSchema.optional(),
  sessionGuidelinesByRound: sessionGuidelinesSchema.optional(),
  slotEarliestHour: z.number().int().min(0).max(24).optional(),
  slotLatestHour: z.number().int().min(0).max(24).optional(),
  allowWeekends: z.boolean().optional(),
  clearFields: z
    .array(
      z.enum([
        "slotDurationMinutes",
        "totalSessions",
        "timezone",
        "partnerExtraQuestionsByRound",
        "clientExtraQuestionsByRound",
        "sessionGuidelinesByRound",
        "slotEarliestHour",
        "slotLatestHour",
        "allowWeekends",
      ] as const satisfies readonly (keyof AppSettingsOverridableFields)[]),
    )
    .optional(),
  partnerProjectOverview: z
    .object({
      companyName: overviewTextField,
      sessionPeriod: overviewTextField,
      sessionFrequency: overviewTextField,
      background: overviewTextField,
      sessionFocus: overviewTextField,
      expectations: overviewTextField,
      other: overviewTextField,
    })
    .optional(),
  clientProjectOverview: z
    .object({
      sessionPeriod: overviewTextField,
      sessionFrequency: overviewTextField,
      background: overviewTextField,
      sessionFocus: overviewTextField,
      expectations: overviewTextField,
      other: overviewTextField,
    })
    .optional(),
  clearPartnerProjectOverview: z.boolean().optional(),
  clearClientProjectOverview: z.boolean().optional(),
  shareFtaWithinCompany: z.boolean().optional(),
  planFeatureOverrides: z
    .object({
      fta: z.boolean().optional(),
      skillCheck: z.boolean().optional(),
      pdca: z.boolean().optional(),
      reflection: z.boolean().optional(),
      lifelineChart: z.boolean().optional(),
      summaryReport: z.boolean().optional(),
      developmentOpportunity: z.boolean().optional(),
      businessProblem: z.boolean().optional(),
      actionBrakeAnalysis: z.boolean().optional(),
    })
    .optional(),
  clearPlanFeatureOverrides: z.boolean().optional(),
  meetingProvider: z.enum(["zoom", "google_meet"]).optional(),
  clearMeetingProvider: z.boolean().optional(),
  coachingSessionModesByRound: z.record(z.string(), z.enum(["standard", "roleplay"])).optional(),
  clearCoachingSessionModes: z.boolean().optional(),
  coachingPlanSettings: z
    .object({
      publishQuestions: z.boolean().optional(),
      publishOneOnOneFormat: z.boolean().optional(),
      shareIcebreakerWithPartner: z.boolean().optional(),
      shareQuestionsWithPartner: z.boolean().optional(),
      shareOneOnOneFormatWithPartner: z.boolean().optional(),
    })
    .optional(),
  clearCoachingPlanSettings: z.boolean().optional(),
});

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "ADMIN_ASSISTANT")) {
    return jsonError("権限がありません。", 403);
  }
  const { programId } = await ctx.params;
  const program = await getProgramById(programId);
  if (!program) return jsonError("プログラムが見つかりません。", 404);

  const [settings, override] = await Promise.all([
    getAppSettingsRow(),
    getProgramAppSettingsOverride(programId),
  ]);
  const effective = await getEffectiveAppSettings({
    companyId: program.companyId,
    programId,
    global: settings,
    programOverride: override,
  });

  return jsonOk({
    program,
    override: override ?? null,
    global: settings,
    effective,
  });
}

export async function PATCH(request: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session || session.role !== "ADMIN") return jsonError("権限がありません。", 403);
  const { programId } = await ctx.params;
  const program = await getProgramById(programId);
  if (!program) return jsonError("プログラムが見つかりません。", 404);

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  const {
    clearFields,
    clearPartnerProjectOverview,
    clearClientProjectOverview,
    clearPlanFeatureOverrides,
    clearMeetingProvider,
    clearCoachingSessionModes,
    clearCoachingPlanSettings,
    ...rest
  } = parsed.data;

  if (
    typeof rest.slotEarliestHour === "number" &&
    typeof rest.slotLatestHour === "number" &&
    rest.slotEarliestHour >= rest.slotLatestHour
  ) {
    return jsonError("候補の制約：開始時刻は終了時刻より前にしてください。");
  }

  const final = await upsertProgramAppSettingsOverride(programId, {
    ...rest,
    meetingProvider: rest.meetingProvider,
    planFeatureOverrides: rest.planFeatureOverrides
      ? normalizePlanFeatureOverrides(rest.planFeatureOverrides)
      : undefined,
    clearFields,
    clearPartnerProjectOverview: clearPartnerProjectOverview === true,
    clearClientProjectOverview: clearClientProjectOverview === true,
    clearPlanFeatureOverrides: clearPlanFeatureOverrides === true,
    clearMeetingProvider: clearMeetingProvider === true,
    clearCoachingSessionModes: clearCoachingSessionModes === true,
    coachingSessionModesByRound: rest.coachingSessionModesByRound
      ? normalizeCoachingSessionModesByRound(rest.coachingSessionModesByRound)
      : undefined,
    clearCoachingPlanSettings: clearCoachingPlanSettings === true,
    coachingPlanSettings: rest.coachingPlanSettings
      ? normalizeCoachingPlanSettingsOverrides(rest.coachingPlanSettings)
      : undefined,
  });

  // 代表プランのプログラムへ保存したときは企業上書きにもミラーし、
  // 企業詳細（programId 無し）の実効値表示と整合させる
  const settings = await getAppSettingsRow();
  const registryPlan = resolveCompanyPlan(program.companyId, settings.companies);
  if (program.plan === registryPlan) {
    const { upsertCompanyAppSettingsOverride } = await import(
      "@/lib/repositories/app-settings-repository"
    );
    await upsertCompanyAppSettingsOverride(program.companyId, {
      ...rest,
      meetingProvider: rest.meetingProvider,
      planFeatureOverrides: rest.planFeatureOverrides
        ? normalizePlanFeatureOverrides(rest.planFeatureOverrides)
        : undefined,
      clearFields,
      clearPartnerProjectOverview: clearPartnerProjectOverview === true,
      clearClientProjectOverview: clearClientProjectOverview === true,
      clearPlanFeatureOverrides: clearPlanFeatureOverrides === true,
      clearMeetingProvider: clearMeetingProvider === true,
      clearCoachingSessionModes: clearCoachingSessionModes === true,
      coachingSessionModesByRound: rest.coachingSessionModesByRound
        ? normalizeCoachingSessionModesByRound(rest.coachingSessionModesByRound)
        : undefined,
      clearCoachingPlanSettings: clearCoachingPlanSettings === true,
      coachingPlanSettings: rest.coachingPlanSettings
        ? normalizeCoachingPlanSettingsOverrides(rest.coachingPlanSettings)
        : undefined,
    }).catch(() => null);
  }

  const effective = await getEffectiveAppSettings({
    companyId: program.companyId,
    programId,
    global: settings,
    programOverride: final,
  });
  return jsonOk({ ok: true, override: final, effective });
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session || session.role !== "ADMIN") return jsonError("権限がありません。", 403);
  const { programId } = await ctx.params;
  const program = await getProgramById(programId);
  if (!program) return jsonError("プログラムが見つかりません。", 404);
  await deleteProgramAppSettingsOverride(programId);
  return jsonOk({ ok: true });
}
