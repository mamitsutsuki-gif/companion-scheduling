import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { resolveCoachingAccessForMatch } from "@/lib/coaching-access";
import { newIcebreakerId, normalizeIcebreakerEntry } from "@/lib/coaching-icebreaker";
import { getIcebreakerStore, saveIcebreakerStore } from "@/lib/repositories/coaching-repository";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ matchId: string }> };

const entrySchema = z.object({
  id: z.string().max(80).optional(),
  title: z.string().max(200).optional(),
  content: z.string().max(4000).optional(),
  useCase: z.string().max(1000).optional(),
  targetAudience: z.string().max(500).optional(),
  memo: z.string().max(2000).optional(),
  registeredAt: z.string().max(20).optional(),
});

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCoachingAccessForMatch(matchId, { id: session.sub, role: session.role });
  if ("error" in access) {
    if (access.error === "plan_disabled") return jsonError("このプランでは利用できません。", 403);
    return jsonError("権限がありません。", 403);
  }
  const store = await getIcebreakerStore(access.targetUserId, access.companyId);
  return jsonOk({
    store,
    permissions: { canEditClient: access.canEditClient },
  });
}

export async function PUT(request: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCoachingAccessForMatch(matchId, { id: session.sub, role: session.role });
  if ("error" in access || !access.canEditClient) return jsonError("編集権限がありません。", 403);

  const body = await request.json().catch(() => null);
  const parsed = entrySchema.safeParse(body?.entry ?? body);
  if (!parsed.success) return jsonError("入力内容を確認してください。", 400);

  const store = await getIcebreakerStore(access.targetUserId, access.companyId);
  const id = parsed.data.id ?? newIcebreakerId();
  const prev = store.entries.find((e) => e.id === id);
  const merged = normalizeIcebreakerEntry(
    {
      ...prev,
      ...parsed.data,
      id,
      registeredAt: parsed.data.registeredAt ?? prev?.registeredAt ?? new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString(),
    },
    id,
  );
  if (!merged) return jsonError("タイトルを入力してください。", 400);

  const nextEntries = store.entries.filter((e) => e.id !== id);
  nextEntries.unshift(merged);
  const saved = await saveIcebreakerStore({
    ...store,
    userId: access.targetUserId,
    companyId: access.companyId,
    entries: nextEntries,
  });
  return jsonOk({ store: saved });
}

export async function DELETE(request: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCoachingAccessForMatch(matchId, { id: session.sub, role: session.role });
  if ("error" in access || !access.canEditClient) return jsonError("削除権限がありません。", 403);

  const entryId = new URL(request.url).searchParams.get("id") ?? "";
  if (!entryId) return jsonError("id が必要です。", 400);

  const store = await getIcebreakerStore(access.targetUserId, access.companyId);
  const saved = await saveIcebreakerStore({
    ...store,
    entries: store.entries.filter((e) => e.id !== entryId),
  });
  return jsonOk({ store: saved });
}
