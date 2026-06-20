import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { resolveCoachingAccessForMatch } from "@/lib/coaching-access";
import {
  ROLEPLAY_CATEGORIES,
  SCORE_LABELS,
  categoryAverages,
  normalizeRoleplaySession,
  redactRoleplayStoreForViewer,
} from "@/lib/coaching-roleplay";
import { getRoleplayStore, saveRoleplayStore } from "@/lib/repositories/coaching-repository";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ matchId: string }> };

const scoreSchema = z.object({
  score: z.number().int().min(1).max(7).nullable().optional(),
  comment: z.string().max(2000).optional(),
});

const sessionSchema = z.object({
  round: z.number().int().min(1).max(3),
  conductedAt: z.string().max(20).optional(),
  clientRole: z.string().max(200).optional(),
  partnerRole: z.string().max(200).optional(),
  theme: z.string().max(500).optional(),
  selfScores: z.record(z.string(), scoreSchema).optional(),
  partnerScores: z.record(z.string(), scoreSchema).optional(),
  clientReflection: z
    .object({
      good: z.string().max(4000).optional(),
      improve: z.string().max(4000).optional(),
      nextFocus: z.string().max(4000).optional(),
    })
    .optional(),
  partnerFeedback: z
    .object({
      good: z.string().max(4000).optional(),
      improve: z.string().max(4000).optional(),
      advice: z.string().max(4000).optional(),
    })
    .optional(),
  sessionFeedback: z
    .object({
      satisfactionScore: z.number().int().min(1).max(10).nullable().optional(),
      satisfactionReason: z.string().max(4000).optional(),
    })
    .optional(),
});

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCoachingAccessForMatch(matchId, { id: session.sub, role: session.role });
  if ("error" in access) {
    if (access.error === "not_found") return jsonError("マッチが見つかりません。", 404);
    if (access.error === "plan_disabled") return jsonError("このプランでは利用できません。", 403);
    return jsonError("権限がありません。", 403);
  }
  const store = await getRoleplayStore(matchId);
  const rounds = store.sessions.map((s) => ({
    round: s.round,
    selfCategoryAvg: categoryAverages(s.selfScores),
    partnerCategoryAvg: categoryAverages(s.partnerScores),
  }));
  const viewerStore = redactRoleplayStoreForViewer(store, session.role);
  return jsonOk({
    store: viewerStore,
    categories: ROLEPLAY_CATEGORIES,
    scoreLabels: SCORE_LABELS,
    roundSummaries: rounds,
    permissions: {
      canEditClient: access.canEditClient,
      canEditPartner: access.canEditPartner,
    },
  });
}

export async function PUT(request: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCoachingAccessForMatch(matchId, { id: session.sub, role: session.role });
  if ("error" in access) return jsonError("権限がありません。", 403);

  const body = await request.json().catch(() => null);
  const parsed = sessionSchema.safeParse(body?.session ?? body);
  if (!parsed.success) return jsonError("入力内容を確認してください。", 400);

  const store = await getRoleplayStore(matchId);
  const round = parsed.data.round as 1 | 2 | 3;
  const idx = round - 1;
  const prev = store.sessions[idx] ?? normalizeRoleplaySession({}, round);

  const merged = normalizeRoleplaySession(
    {
      ...prev,
      ...parsed.data,
      selfScores:
        parsed.data.selfScores !== undefined
          ? access.canEditClient
            ? { ...prev.selfScores, ...parsed.data.selfScores }
            : prev.selfScores
          : prev.selfScores,
      partnerScores:
        parsed.data.partnerScores !== undefined
          ? access.canEditPartner
            ? { ...prev.partnerScores, ...parsed.data.partnerScores }
            : prev.partnerScores
          : prev.partnerScores,
      clientReflection:
        parsed.data.clientReflection !== undefined
          ? access.canEditClient
            ? { ...prev.clientReflection, ...parsed.data.clientReflection }
            : prev.clientReflection
          : prev.clientReflection,
      partnerFeedback:
        parsed.data.partnerFeedback !== undefined
          ? access.canEditPartner
            ? { ...prev.partnerFeedback, ...parsed.data.partnerFeedback }
            : prev.partnerFeedback
          : prev.partnerFeedback,
      sessionFeedback:
        parsed.data.sessionFeedback !== undefined
          ? access.canEditClient
            ? {
                satisfactionScore:
                  parsed.data.sessionFeedback.satisfactionScore !== undefined
                    ? parsed.data.sessionFeedback.satisfactionScore
                    : prev.sessionFeedback.satisfactionScore,
                satisfactionReason:
                  parsed.data.sessionFeedback.satisfactionReason !== undefined
                    ? parsed.data.sessionFeedback.satisfactionReason
                    : prev.sessionFeedback.satisfactionReason,
              }
            : prev.sessionFeedback
          : prev.sessionFeedback,
      clientRole:
        parsed.data.clientRole !== undefined && access.canEditClient
          ? parsed.data.clientRole
          : prev.clientRole,
      partnerRole:
        parsed.data.partnerRole !== undefined && access.canEditPartner
          ? parsed.data.partnerRole
          : prev.partnerRole,
      theme:
        parsed.data.theme !== undefined && (access.canEditClient || access.canEditPartner)
          ? parsed.data.theme
          : prev.theme,
      conductedAt:
        parsed.data.conductedAt !== undefined && (access.canEditClient || access.canEditPartner)
          ? parsed.data.conductedAt
          : prev.conductedAt,
    },
    round,
  );

  const nextSessions = store.sessions.slice();
  nextSessions[idx] = merged;
  const saved = await saveRoleplayStore({ ...store, matchId, sessions: nextSessions });
  return jsonOk({ store: redactRoleplayStoreForViewer(saved, session.role) });
}
