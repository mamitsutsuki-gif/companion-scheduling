import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { resolveCompanionAccessForMatch } from "@/lib/companion-access";
import {
  getLifelineChart,
  getPdcaStore,
  getReflectionSheet,
  getSummaryReportDoc,
  upsertSummaryReportDoc,
} from "@/lib/repositories/companion-repository";
import { getSkillCheckProfile, getCompanySkillDefinitions } from "@/lib/repositories/skill-check-repository";
import { getFtaByUserId } from "@/lib/repositories/fta-repository";
import { getUserById } from "@/lib/repositories/user-repository";
import { filterLifelineForViewer } from "@/lib/companion-lifeline";
import { pdcaSkillCounts } from "@/lib/companion-pdca";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ matchId: string }> };

const putSchema = z.object({
  coachComment: z.string().max(8000).optional(),
  motiveSummary: z.string().max(8000).optional(),
  recommendations: z.string().max(8000).optional(),
});

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCompanionAccessForMatch(matchId, { id: session.sub, role: session.role });
  if ("error" in access) return jsonError("権限がありません。", 403);

  const [
    target,
    adminDoc,
    skillProfile,
    skills,
    pdca,
    reflection,
    lifelineRaw,
    fta,
  ] = await Promise.all([
    getUserById(access.targetUserId),
    getSummaryReportDoc(access.targetUserId, access.companyId),
    getSkillCheckProfile(access.targetUserId),
    getCompanySkillDefinitions(access.companyId),
    getPdcaStore(access.targetUserId, access.companyId),
    getReflectionSheet(access.targetUserId, access.companyId),
    getLifelineChart(access.targetUserId, access.companyId),
    getFtaByUserId(access.targetUserId),
  ]);

  const lifeline = filterLifelineForViewer(lifelineRaw, access.lifelineViewMode);
  const skillName = new Map(skills.map((s) => [s.id, s.name]));

  return jsonOk({
    targetName: target?.displayName ?? "",
    adminDoc,
    skillProfile,
    skills,
    pdca: {
      entries: pdca.entries,
      skillCounts: pdcaSkillCounts(pdca.entries).map((r) => ({
        ...r,
        skillName: skillName.get(r.skillId) ?? r.skillId,
      })),
    },
    reflection,
    lifeline,
    fta,
    focusSkillNames: (skillProfile?.focusSkillIds ?? []).map((id) => skillName.get(id) ?? id),
    permissions: {
      canEditAdminSummary: access.canEditAdminSummary,
      canEditCoach: access.canEditCoach,
    },
  });
}

export async function PUT(request: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCompanionAccessForMatch(matchId, { id: session.sub, role: session.role });
  if ("error" in access) return jsonError("権限がありません。", 403);
  if (!access.canEditAdminSummary && !access.canEditCoach) {
    return jsonError("編集権限がありません。", 403);
  }
  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容を確認してください。", 400);
  const patch: Record<string, string> = {};
  if (parsed.data.coachComment !== undefined && access.canEditCoach) patch.coachComment = parsed.data.coachComment;
  if (parsed.data.motiveSummary !== undefined && access.canEditAdminSummary) {
    patch.motiveSummary = parsed.data.motiveSummary;
  }
  if (parsed.data.recommendations !== undefined && access.canEditAdminSummary) {
    patch.recommendations = parsed.data.recommendations;
  }
  const adminDoc = await upsertSummaryReportDoc(
    access.targetUserId,
    access.companyId,
    patch,
    session.sub,
  );
  return jsonOk({ adminDoc });
}
