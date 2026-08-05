import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { resolveCompanionAccessForMatch } from "@/lib/companion-access";
import {
  getDevelopmentOpportunitySheet,
  upsertDevelopmentOpportunitySheet,
} from "@/lib/repositories/companion-repository";
import {
  DEVELOPMENT_OPPORTUNITY_TEMPLATES,
  DEVELOPMENT_OPPORTUNITY_TEXT_MAX,
  isDevelopmentOpportunityConditionReady,
  type DevelopmentOpportunitySheet,
} from "@/lib/companion-development-opportunity";
import { getFtaByUserId } from "@/lib/repositories/fta-repository";
import { getCompanySkillDefinitions, getSkillCheckProfile } from "@/lib/repositories/skill-check-repository";
import { resolveEffectiveSkillDefinitions } from "@/lib/skill-check";
import { maskedFtaChartForViewer } from "@/lib/fta";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ matchId: string }> };

const text = z.string().max(DEVELOPMENT_OPPORTUNITY_TEXT_MAX);
const putSchema = z.object({
  status: z.enum(["unset", "draft", "agreed", "active"]).optional(),
  workText: text.optional(),
  practiceStartDate: z
    .string()
    .max(10)
    .regex(/^\d{4}-\d{2}-\d{2}$|^$/)
    .optional(),
  reasonText: text.optional(),
  scopeText: text.optional(),
  authorityText: text.optional(),
  stakeholdersText: text.optional(),
  metricsText: text.optional(),
  toleranceText: text.optional(),
  supportText: text.optional(),
  actionItemsText: text.optional(),
  feedbackPointsText: text.optional(),
  requiredChecks: z
    .object({
      canGrantAuthority: z.boolean().optional(),
      canVerifyWithin6Months: z.boolean().optional(),
      canAvoidMajorLoss: z.boolean().optional(),
    })
    .optional(),
  recommendedChecks: z
    .object({
      needsHigherAction: z.boolean().optional(),
      hasThinkingRoom: z.boolean().optional(),
      needsCoordination: z.boolean().optional(),
      clearResponsibility: z.boolean().optional(),
      objectiveResults: z.boolean().optional(),
    })
    .optional(),
});

function payload(
  sheet: DevelopmentOpportunitySheet,
  canEditManager: boolean,
  extras?: { focusSkillNames?: string[]; ftaActionHints?: string[] },
) {
  return {
    sheet,
    templates: DEVELOPMENT_OPPORTUNITY_TEMPLATES,
    conditionReady: isDevelopmentOpportunityConditionReady(sheet),
    permissions: { canEditManager },
    focusSkillNames: extras?.focusSkillNames ?? [],
    ftaActionHints: extras?.ftaActionHints ?? [],
  };
}

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCompanionAccessForMatch(
    matchId,
    { id: session.sub, role: session.role },
    { feature: "developmentOpportunity" },
  );
  if ("error" in access) {
    if (access.error === "not_found") return jsonError("マッチが見つかりません。", 404);
    if (access.error === "plan_disabled") return jsonError("このプランでは利用できません。", 403);
    return jsonError("権限がありません。", 403);
  }
  const [sheet, companySkills, skillProfile, fta] = await Promise.all([
    getDevelopmentOpportunitySheet(access.targetUserId, access.companyId),
    getCompanySkillDefinitions(access.companyId),
    getSkillCheckProfile(access.targetUserId),
    getFtaByUserId(access.targetUserId),
  ]);
  const skills = resolveEffectiveSkillDefinitions(skillProfile, companySkills);
  const nameById = new Map(skills.map((s) => [s.id, s.name]));
  const focusSkillNames = (skillProfile?.focusSkillIds ?? [])
    .map((id) => nameById.get(id) ?? id)
    .filter(Boolean);
  const viewFta = maskedFtaChartForViewer(fta);
  const ftaActionHints = viewFta.elements
    .flatMap((el) => el.actions.map((a) => a.text.trim()))
    .filter(Boolean)
    .slice(0, 12);
  return jsonOk(payload(sheet, access.canEditCoach, { focusSkillNames, ftaActionHints }));
}

export async function PUT(request: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCompanionAccessForMatch(
    matchId,
    { id: session.sub, role: session.role },
    { feature: "developmentOpportunity" },
  );
  if ("error" in access) {
    if (access.error === "not_found") return jsonError("マッチが見つかりません。", 404);
    if (access.error === "plan_disabled") return jsonError("このプランでは利用できません。", 403);
    return jsonError("権限がありません。", 403);
  }
  if (!access.canEditCoach) {
    return jsonError("育成機会の編集権限がありません（上司・パートナー・管理者が編集できます）。", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(body?.sheet ?? body);
  if (!parsed.success) return jsonError("入力内容を確認してください。", 400);

  const current = await getDevelopmentOpportunitySheet(access.targetUserId, access.companyId);
  const sheet = await upsertDevelopmentOpportunitySheet(access.targetUserId, access.companyId, {
    ...parsed.data,
    requiredChecks: parsed.data.requiredChecks
      ? {
          canGrantAuthority:
            parsed.data.requiredChecks.canGrantAuthority ?? current.requiredChecks.canGrantAuthority,
          canVerifyWithin6Months:
            parsed.data.requiredChecks.canVerifyWithin6Months ??
            current.requiredChecks.canVerifyWithin6Months,
          canAvoidMajorLoss:
            parsed.data.requiredChecks.canAvoidMajorLoss ?? current.requiredChecks.canAvoidMajorLoss,
        }
      : undefined,
    recommendedChecks: parsed.data.recommendedChecks
      ? {
          needsHigherAction:
            parsed.data.recommendedChecks.needsHigherAction ??
            current.recommendedChecks.needsHigherAction,
          hasThinkingRoom:
            parsed.data.recommendedChecks.hasThinkingRoom ?? current.recommendedChecks.hasThinkingRoom,
          needsCoordination:
            parsed.data.recommendedChecks.needsCoordination ??
            current.recommendedChecks.needsCoordination,
          clearResponsibility:
            parsed.data.recommendedChecks.clearResponsibility ??
            current.recommendedChecks.clearResponsibility,
          objectiveResults:
            parsed.data.recommendedChecks.objectiveResults ??
            current.recommendedChecks.objectiveResults,
        }
      : undefined,
  });
  return jsonOk(payload(sheet, access.canEditCoach));
}
