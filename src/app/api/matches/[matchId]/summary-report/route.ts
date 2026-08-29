import { z } from "zod";
import type { Role } from "@prisma/client";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { resolveCompanionAccessForMatch, canUseSummaryReport } from "@/lib/companion-access";
import {
  getLifelineChart,
  getPdcaStore,
  getReflectionSheet,
  getSummaryReportDoc,
  publishSummaryReportDoc,
  upsertSummaryReportDoc,
} from "@/lib/repositories/companion-repository";
import {
  getSkillCheckProfile,
  getCompanySkillDefinitions,
} from "@/lib/repositories/skill-check-repository";
import {
  normalizeSkillCheckProfile,
  redactSkillCheckProfileForViewer,
  resolveEffectiveSkillDefinitions,
} from "@/lib/skill-check";
import { getFtaByUserId } from "@/lib/repositories/fta-repository";
import { getUserById } from "@/lib/repositories/user-repository";
import { filterLifelineForViewer } from "@/lib/companion-lifeline";
import { pdcaSkillCounts } from "@/lib/companion-pdca";
import {
  isSummaryCommentsPublished,
  redactSummaryCommentsForSupervisor,
} from "@/lib/companion-summary";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ matchId: string }> };

const putSchema = z.object({
  coachComment: z.string().max(8000).optional(),
  motiveSummary: z.string().max(8000).optional(),
  recommendations: z.string().max(8000).optional(),
});

/** コメント3項目の提出ゲート対象（上司・人事のみ） */
function shouldGateSummaryCommentsForRole(role: Role): boolean {
  return role === "CLIENT_ADMIN" || role === "CLIENT_HR";
}

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCompanionAccessForMatch(matchId, { id: session.sub, role: session.role }, { feature: "summaryReport" });
  if ("error" in access) return jsonError("権限がありません。", 403);
  if (!canUseSummaryReport(access, session.role)) return jsonError("権限がありません。", 403);

  const [
    target,
    adminDocRaw,
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

  const commentsPublished = isSummaryCommentsPublished(adminDocRaw);
  const gateComments = shouldGateSummaryCommentsForRole(session.role);
  const adminDoc =
    gateComments && !commentsPublished ? redactSummaryCommentsForSupervisor(adminDocRaw) : adminDocRaw;

  const lifeline = filterLifelineForViewer(lifelineRaw, access.lifelineViewMode);
  const normalizedSkillProfile =
    skillProfile ??
    normalizeSkillCheckProfile(access.targetUserId, access.companyId, {
      focusSkillIds: [],
      baseline: {},
      current: {},
    });
  const effectiveSkills = resolveEffectiveSkillDefinitions(normalizedSkillProfile, skills);
  const { profile: redactedSkillProfile } = redactSkillCheckProfileForViewer({
    profile: normalizedSkillProfile,
    skills: effectiveSkills,
    viewerRole: session.role,
    viewerUserId: session.sub,
  });
  const skillName = new Map(effectiveSkills.map((s) => [s.id, s.name]));

  return jsonOk({
    targetName: target?.displayName ?? "",
    adminDoc,
    skillProfile: redactedSkillProfile,
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
    focusSkillNames: (normalizedSkillProfile?.focusSkillIds ?? []).map((id) => skillName.get(id) ?? id),
    permissions: {
      canEditAdminSummary: access.canEditAdminSummary,
      canEditPartnerComment:
        session.role === "ADMIN" ||
        (session.role === "PARTNER" && access.canEditCoach),
      commentsPublished,
      canViewComments: !gateComments || commentsPublished,
      canPublishComments: session.role === "ADMIN" && access.canEditAdminSummary,
    },
  });
}

export async function PUT(request: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCompanionAccessForMatch(matchId, { id: session.sub, role: session.role }, { feature: "summaryReport" });
  if ("error" in access) return jsonError("権限がありません。", 403);
  if (!canUseSummaryReport(access, session.role)) return jsonError("権限がありません。", 403);
  const canEditPartnerComment =
    session.role === "ADMIN" || (session.role === "PARTNER" && access.canEditCoach);
  if (!access.canEditAdminSummary && !canEditPartnerComment) {
    return jsonError("編集権限がありません。", 403);
  }
  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容を確認してください。", 400);
  const patch: Record<string, string> = {};
  if (parsed.data.coachComment !== undefined && canEditPartnerComment) {
    patch.coachComment = parsed.data.coachComment;
  }
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
  const commentsPublished = isSummaryCommentsPublished(adminDoc);
  const gateComments = shouldGateSummaryCommentsForRole(session.role);
  return jsonOk({
    adminDoc:
      gateComments && !commentsPublished ? redactSummaryCommentsForSupervisor(adminDoc) : adminDoc,
    permissions: {
      canEditAdminSummary: access.canEditAdminSummary,
      canEditPartnerComment:
        session.role === "ADMIN" ||
        (session.role === "PARTNER" && access.canEditCoach),
      commentsPublished,
      canViewComments: !gateComments || commentsPublished,
      canPublishComments: session.role === "ADMIN" && access.canEditAdminSummary,
    },
  });
}

/** ADMIN がコメント3項目を上司・人事に公開する */
export async function POST(_request: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "ADMIN") return jsonError("権限がありません。", 403);

  const { matchId } = await ctx.params;
  const access = await resolveCompanionAccessForMatch(matchId, { id: session.sub, role: session.role }, { feature: "summaryReport" });
  if ("error" in access) return jsonError("権限がありません。", 403);
  if (!access.canEditAdminSummary) return jsonError("権限がありません。", 403);

  const adminDoc = await publishSummaryReportDoc(access.targetUserId, access.companyId, session.sub);

  return jsonOk({
    adminDoc,
    permissions: {
      canEditAdminSummary: true,
      canEditPartnerComment: true,
      commentsPublished: true,
      canViewComments: true,
      canPublishComments: true,
    },
  });
}
