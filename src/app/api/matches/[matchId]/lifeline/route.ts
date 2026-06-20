import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { resolveCompanionAccessForMatch } from "@/lib/companion-access";
import { getLifelineChart, upsertLifelineChart } from "@/lib/repositories/companion-repository";
import { filterLifelineForViewer, normalizeLifelineEvent } from "@/lib/companion-lifeline";
import { nanoid } from "nanoid";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ matchId: string }> };

const eventSchema = z.object({
  id: z.string().max(80).optional(),
  ageOrPeriod: z.string().max(80).optional(),
  title: z.string().max(200).optional(),
  detail: z.string().max(4000).optional(),
  emotionScore: z.number().int().min(-5).max(5).optional(),
  emotionReason: z.string().max(2000).optional(),
  insights: z.string().max(2000).optional(),
  locked: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(200).optional(),
});

const putSchema = z.object({
  events: z.array(eventSchema).max(80),
});

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCompanionAccessForMatch(matchId, { id: session.sub, role: session.role });
  if ("error" in access) return jsonError("権限がありません。", 403);
  const raw = await getLifelineChart(access.targetUserId, access.companyId);
  const chart = filterLifelineForViewer(raw, access.lifelineViewMode);
  return jsonOk({
    chart,
    rawEventCount: raw.events.length,
    permissions: {
      canEditClient: access.canEditClient,
      lifelineViewMode: access.lifelineViewMode,
    },
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
  const events = parsed.data.events
    .map((e, i) => normalizeLifelineEvent({ ...e, id: e.id ?? `life-${nanoid(8)}` }, `life-${i}`, i))
    .filter((e): e is NonNullable<typeof e> => e !== null);
  const chart = await upsertLifelineChart(access.targetUserId, access.companyId, events);
  return jsonOk({ chart });
}
