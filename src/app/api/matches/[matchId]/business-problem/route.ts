import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { resolveCompanionAccessForMatch } from "@/lib/companion-access";
import {
  getBusinessProblemSheet,
  upsertBusinessProblemSheet,
} from "@/lib/repositories/companion-repository";
import {
  BUSINESS_PROBLEM_STEPS,
  BUSINESS_PROBLEM_TEXT_MAX,
  businessProblemStepFillCounts,
  businessProblemTheme,
} from "@/lib/companion-business-problem";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ matchId: string }> };

const putSchema = z.object({
  stepValues: z.record(z.string(), z.record(z.string(), z.string().max(BUSINESS_PROBLEM_TEXT_MAX))).optional(),
  coachComment: z.string().max(BUSINESS_PROBLEM_TEXT_MAX).optional(),
});

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCompanionAccessForMatch(
    matchId,
    { id: session.sub, role: session.role },
    { feature: "businessProblem" },
  );
  if ("error" in access) {
    if (access.error === "not_found") return jsonError("マッチが見つかりません。", 404);
    if (access.error === "plan_disabled") return jsonError("このプランでは利用できません。", 403);
    return jsonError("権限がありません。", 403);
  }
  const sheet = await getBusinessProblemSheet(access.targetUserId, access.companyId);
  return jsonOk({
    sheet,
    steps: BUSINESS_PROBLEM_STEPS,
    theme: businessProblemTheme(sheet),
    fillCounts: businessProblemStepFillCounts(sheet),
    permissions: {
      canEditClient: access.canEditClient,
      canEditCoach: access.canEditCoach,
    },
  });
}

export async function PUT(request: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCompanionAccessForMatch(
    matchId,
    { id: session.sub, role: session.role },
    { feature: "businessProblem" },
  );
  if ("error" in access) {
    if (access.error === "not_found") return jsonError("マッチが見つかりません。", 404);
    if (access.error === "plan_disabled") return jsonError("このプランでは利用できません。", 403);
    return jsonError("権限がありません。", 403);
  }

  const canEditFields = access.canEditClient || access.canEditCoach;
  if (!canEditFields) return jsonError("編集権限がありません。", 403);

  const body = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(body?.sheet ?? body);
  if (!parsed.success) return jsonError("入力内容を確認してください。", 400);

  const current = await getBusinessProblemSheet(access.targetUserId, access.companyId);
  const patch: {
    stepValues?: typeof parsed.data.stepValues;
    coachComment?: string;
  } = {};

  if (parsed.data.stepValues !== undefined) {
    if (!canEditFields) return jsonError("編集権限がありません。", 403);
    patch.stepValues = parsed.data.stepValues;
  }
  if (parsed.data.coachComment !== undefined) {
    if (!access.canEditCoach) {
      return jsonError("コーチコメントの編集権限がありません。", 403);
    }
    patch.coachComment = parsed.data.coachComment;
  } else {
    patch.coachComment = current.coachComment;
  }

  const sheet = await upsertBusinessProblemSheet(access.targetUserId, access.companyId, patch);
  return jsonOk({
    sheet,
    steps: BUSINESS_PROBLEM_STEPS,
    theme: businessProblemTheme(sheet),
    fillCounts: businessProblemStepFillCounts(sheet),
    permissions: {
      canEditClient: access.canEditClient,
      canEditCoach: access.canEditCoach,
    },
  });
}
