import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { resolveSkillCheckAccessForUser } from "@/lib/skill-check-access";
import {
  getCompanySkillDefinitions,
  getSkillCheckProfile,
  upsertSkillCheckProfile,
} from "@/lib/repositories/skill-check-repository";
import { getUserById } from "@/lib/repositories/user-repository";
import { normalizeSkillCheckProfile, type SkillCheckPhase, type SkillScore } from "@/lib/skill-check";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ userId: string }> };

const scoreSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.null()]);

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
});

export async function GET(_request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { userId } = await context.params;
  const access = await resolveSkillCheckAccessForUser(userId, {
    id: session.sub,
    role: session.role,
  });
  if ("error" in access) {
    if (access.error === "not_found") return jsonError("ユーザーが見つかりません。", 404);
    if (access.error === "plan_disabled") return jsonError("このプランではスキルチェックは利用できません。", 403);
    return jsonError("権限がありません。", 403);
  }

  const [skills, profile, client] = await Promise.all([
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
    skills,
    profile: normalizedProfile,
    targetName: client?.displayName ?? "",
    permissions: {
      canEditSelf: access.canEditSelf,
      canEditManager: access.canEditManager,
      canEditFocusSkills: access.canEditFocusSkills,
    },
  });
}

export async function PUT(request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { userId } = await context.params;
  const access = await resolveSkillCheckAccessForUser(userId, {
    id: session.sub,
    role: session.role,
  });
  if ("error" in access) {
    if (access.error === "not_found") return jsonError("ユーザーが見つかりません。", 404);
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

  const profile = await upsertSkillCheckProfile({
    userId: access.targetUserId,
    companyId: access.companyId,
    phase,
    assessments,
    focusSkillIds: parsed.data.focusSkillIds,
  });

  return jsonOk({ profile });
}
