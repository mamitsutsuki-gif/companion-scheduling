import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { resolveSkillCheckAccessForMatch } from "@/lib/skill-check-access";
import {
  getCompanySkillDefinitions,
  getSkillCheckProfile,
  upsertSkillCheckProfile,
} from "@/lib/repositories/skill-check-repository";
import { getUserById } from "@/lib/repositories/user-repository";
import {
  normalizeCompanySkillDefinitions,
  normalizeSkillCheckProfile,
  resolveEffectiveSkillDefinitions,
  SKILL_CHECK_AGREEMENT_TEXT_MAX,
  type SkillCheckPhase,
  type SkillScore,
} from "@/lib/skill-check";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ matchId: string }> };

const scoreSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.null()]);

const skillDefSchema = z.object({
  id: z.string().max(80),
  name: z.string().max(120),
  kind: z.enum(["common", "company"]).optional(),
  criteria: z
    .object({
      score1: z.string().max(500).optional(),
      score2: z.string().max(500).optional(),
      score3: z.string().max(500).optional(),
      score4: z.string().max(500).optional(),
      score5: z.string().max(500).optional(),
    })
    .optional(),
});

const agreementText = z.string().max(SKILL_CHECK_AGREEMENT_TEXT_MAX);

const putSchema = z.object({
  phase: z.enum(["baseline", "current"]),
  assessments: z
    .record(
      z.string().max(80),
      z.object({
        selfScore: scoreSchema.optional(),
        managerScore: scoreSchema.optional(),
      }),
    )
    .optional(),
  focusSkillIds: z.array(z.string().max(80)).max(8).optional(),
  skillDefinitions: z.array(skillDefSchema).max(32).optional(),
  clientValuesText: agreementText.optional(),
  clientSixMonthGoalText: agreementText.optional(),
  managerCurrentRoleText: agreementText.optional(),
  managerNextRoleText: agreementText.optional(),
});

export async function GET(_request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await context.params;
  const access = await resolveSkillCheckAccessForMatch(matchId, {
    id: session.sub,
    role: session.role,
  });
  if ("error" in access) {
    if (access.error === "not_found") return jsonError("マッチが見つかりません。", 404);
    if (access.error === "plan_disabled") return jsonError("このプランではスキルチェックは利用できません。", 403);
    return jsonError("権限がありません。", 403);
  }

  const [companySkills, profile, client] = await Promise.all([
    getCompanySkillDefinitions(access.companyId),
    getSkillCheckProfile(access.targetUserId),
    getUserById(access.targetUserId),
  ]);

  const normalizedProfile =
    profile ??
    normalizeSkillCheckProfile(access.targetUserId, access.companyId, {
      focusSkillIds: [],
      baseline: {},
      current: {},
    });

  return jsonOk({
    skills: resolveEffectiveSkillDefinitions(normalizedProfile, companySkills),
    profile: normalizedProfile,
    targetName: client?.displayName ?? "",
    permissions: {
      canEditSelf: access.canEditSelf,
      canEditManager: access.canEditManager,
      canEditFocusSkills: access.canEditFocusSkills,
      canEditSkillDefinitions: access.canEditSkillDefinitions,
    },
  });
}

export async function PUT(request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await context.params;
  const access = await resolveSkillCheckAccessForMatch(matchId, {
    id: session.sub,
    role: session.role,
  });
  if ("error" in access) {
    if (access.error === "not_found") return jsonError("マッチが見つかりません。", 404);
    if (access.error === "plan_disabled") return jsonError("このプランではスキルチェックは利用できません。", 403);
    return jsonError("権限がありません。", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return jsonError("入力内容を確認してください。", 400);

  const phase = parsed.data.phase as SkillCheckPhase;
  const assessments: Record<
    string,
    { selfScore?: SkillScore | null; managerScore?: SkillScore | null }
  > = {};
  if (parsed.data.assessments) {
    for (const [skillId, row] of Object.entries(parsed.data.assessments)) {
      const next: { selfScore?: SkillScore | null; managerScore?: SkillScore | null } = {};
      if (row.selfScore !== undefined) {
        if (!access.canEditSelf) return jsonError("本人評価の編集権限がありません。", 403);
        next.selfScore = row.selfScore;
      }
      if (row.managerScore !== undefined) {
        if (!access.canEditManager) return jsonError("上司評価の編集権限がありません。", 403);
        next.managerScore = row.managerScore;
      }
      assessments[skillId] = next;
    }
  }
  if (parsed.data.focusSkillIds !== undefined && !access.canEditFocusSkills) {
    return jsonError("重点スキルの編集権限がありません。", 403);
  }
  if (parsed.data.skillDefinitions !== undefined && !access.canEditSkillDefinitions) {
    return jsonError("スキル項目の編集権限がありません。", 403);
  }
  if (
    (parsed.data.clientValuesText !== undefined || parsed.data.clientSixMonthGoalText !== undefined) &&
    !access.canEditSelf
  ) {
    return jsonError("本人の成長・挑戦合意の編集権限がありません。", 403);
  }
  if (
    (parsed.data.managerCurrentRoleText !== undefined ||
      parsed.data.managerNextRoleText !== undefined) &&
    !access.canEditManager
  ) {
    return jsonError("上司の成長・挑戦合意の編集権限がありません。", 403);
  }

  const skillDefinitions =
    parsed.data.skillDefinitions !== undefined
      ? normalizeCompanySkillDefinitions(parsed.data.skillDefinitions)
      : undefined;
  if (parsed.data.skillDefinitions !== undefined && (!skillDefinitions || skillDefinitions.length === 0)) {
    return jsonError("スキル項目を1つ以上入力してください。", 400);
  }

  const profile = await upsertSkillCheckProfile({
    userId: access.targetUserId,
    companyId: access.companyId,
    phase,
    assessments,
    focusSkillIds: parsed.data.focusSkillIds,
    skillDefinitions,
    clientValuesText: parsed.data.clientValuesText,
    clientSixMonthGoalText: parsed.data.clientSixMonthGoalText,
    managerCurrentRoleText: parsed.data.managerCurrentRoleText,
    managerNextRoleText: parsed.data.managerNextRoleText,
  });

  return jsonOk({ profile });
}
