import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { resolveCoachingAccessForMatch } from "@/lib/coaching-access";
import {
  newIcebreakerId,
  normalizeIcebreakerEntry,
  reorderIcebreakerEntries,
} from "@/lib/coaching-icebreaker";
import { getIcebreakerStore, saveIcebreakerStore } from "@/lib/repositories/coaching-repository";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ matchId: string }> };

const entrySchema = z.object({
  id: z.string().max(80).optional(),
  question: z.string().max(500).optional(),
  title: z.string().max(500).optional(),
});

const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1).max(80)).max(200),
});

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCoachingAccessForMatch(matchId, { id: session.sub, role: session.role }, "icebreaker");
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
  const access = await resolveCoachingAccessForMatch(matchId, { id: session.sub, role: session.role }, "icebreaker");
  if ("error" in access || !access.canEditClient) return jsonError("編集権限がありません。", 403);

  const body = await request.json().catch(() => null);

  const reorderParsed = reorderSchema.safeParse(body);
  if (reorderParsed.success) {
    const store = await getIcebreakerStore(access.targetUserId, access.companyId);
    const saved = await saveIcebreakerStore({
      ...store,
      entries: reorderIcebreakerEntries(store.entries, reorderParsed.data.orderedIds),
    });
    return jsonOk({ store: saved });
  }

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
      updatedAt: new Date().toISOString(),
    },
    id,
  );
  if (!merged) return jsonError("質問を入力してください。", 400);

  let nextEntries: typeof store.entries;
  if (prev) {
    nextEntries = store.entries.map((e) => (e.id === id ? merged : e));
  } else {
    nextEntries = [...store.entries, merged];
  }

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
  const access = await resolveCoachingAccessForMatch(matchId, { id: session.sub, role: session.role }, "icebreaker");
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
