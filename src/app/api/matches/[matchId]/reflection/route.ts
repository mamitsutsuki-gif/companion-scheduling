import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { resolveCompanionAccessForMatch } from "@/lib/companion-access";
import { getReflectionSheet, upsertReflectionSheet } from "@/lib/repositories/companion-repository";
import { getSkillCheckProfile } from "@/lib/repositories/skill-check-repository";
import { getCompanySkillDefinitions } from "@/lib/repositories/skill-check-repository";
import { getPdcaStore } from "@/lib/repositories/companion-repository";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ matchId: string }> };

const putSchema = z.object({
  changedThrough: z.string().max(4000).optional(),
  becameAbleTo: z.string().max(4000).optional(),
  behaviorChanged: z.string().max(4000).optional(),
  relationshipChanged: z.string().max(4000).optional(),
  continueDoing: z.string().max(4000).optional(),
  growFurther: z.string().max(4000).optional(),
  memorablePdca: z.string().max(4000).optional(),
  meaningfulSession: z.string().max(4000).optional(),
});

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCompanionAccessForMatch(matchId, { id: session.sub, role: session.role });
  if ("error" in access) {
    if (access.error === "plan_disabled") return jsonError("このプランでは利用できません。", 403);
    return jsonError("権限がありません。", 403);
  }
  const [sheet, skillProfile, skills, pdca] = await Promise.all([
    getReflectionSheet(access.targetUserId, access.companyId),
    getSkillCheckProfile(access.targetUserId),
    getCompanySkillDefinitions(access.companyId),
    getPdcaStore(access.targetUserId, access.companyId),
  ]);
  return jsonOk({
    sheet,
    skillProfile,
    skills,
    pdcaEntries: pdca.entries.slice(0, 20),
    permissions: { canEditClient: access.canEditClient },
  });
}

export async function PUT(request: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCompanionAccessForMatch(matchId, { id: session.sub, role: session.role });
  if ("error" in access || !access.canEditClient) return jsonError("編集権限がありません。", 403);
  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容を確認してください。", 400);
  const sheet = await upsertReflectionSheet(access.targetUserId, access.companyId, parsed.data);
  return jsonOk({ sheet });
}
