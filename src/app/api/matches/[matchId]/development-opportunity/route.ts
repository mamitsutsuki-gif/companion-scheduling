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

function payload(sheet: DevelopmentOpportunitySheet, canEditManager: boolean) {
  return {
    sheet,
    templates: DEVELOPMENT_OPPORTUNITY_TEMPLATES,
    conditionReady: isDevelopmentOpportunityConditionReady(sheet),
    permissions: { canEditManager },
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
  const sheet = await getDevelopmentOpportunitySheet(access.targetUserId, access.companyId);
  return jsonOk(payload(sheet, access.canEditCoach));
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
