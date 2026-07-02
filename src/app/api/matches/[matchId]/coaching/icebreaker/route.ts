import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { resolveCoachingAccessForMatch } from "@/lib/coaching-access";
import {
  deleteIcebreakerCategory,
  newIcebreakerId,
  normalizeIcebreakerCategories,
  normalizeIcebreakerEntry,
  reorderIcebreakerEntries,
  reorderIcebreakerEntriesInCategory,
  upsertIcebreakerCategory,
} from "@/lib/coaching-icebreaker";
import { getIcebreakerStore, saveIcebreakerStore } from "@/lib/repositories/coaching-repository";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ matchId: string }> };

const entrySchema = z.object({
  id: z.string().max(80).optional(),
  question: z.string().max(500).optional(),
  title: z.string().max(500).optional(),
  categoryId: z.string().max(80).optional(),
});

const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1).max(80)).max(200),
});

const reorderInCategorySchema = z.object({
  categoryId: z.string().min(1).max(80),
  orderedIds: z.array(z.string().min(1).max(80)).max(200),
});

const categorySchema = z.object({
  id: z.string().max(80).optional(),
  label: z.string().max(100),
});

const categoriesSchema = z.object({
  categories: z.array(categorySchema).min(1).max(32),
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

  const reorderInCategoryParsed = reorderInCategorySchema.safeParse(body);
  if (reorderInCategoryParsed.success) {
    const store = await getIcebreakerStore(access.targetUserId, access.companyId);
    const saved = await saveIcebreakerStore({
      ...store,
      entries: reorderIcebreakerEntriesInCategory(
        store,
        reorderInCategoryParsed.data.categoryId,
        reorderInCategoryParsed.data.orderedIds,
      ),
    });
    return jsonOk({ store: saved });
  }

  const categoriesParsed = categoriesSchema.safeParse(body);
  if (categoriesParsed.success) {
    const store = await getIcebreakerStore(access.targetUserId, access.companyId);
    const categories = normalizeIcebreakerCategories(categoriesParsed.data.categories);
    const validIds = new Set(categories.map((c) => c.id));
    const fallbackId = categories[0]!.id;
    const entries = store.entries.map((e) =>
      validIds.has(e.categoryId) ? e : { ...e, categoryId: fallbackId },
    );
    const saved = await saveIcebreakerStore({
      ...store,
      categories,
      entries,
    });
    return jsonOk({ store: saved });
  }

  const categoryParsed = categorySchema.safeParse(body?.category ?? body);
  if (categoryParsed.success && body?.category !== undefined) {
    const store = await getIcebreakerStore(access.targetUserId, access.companyId);
    const categories = upsertIcebreakerCategory(store.categories, categoryParsed.data);
    const saved = await saveIcebreakerStore({ ...store, categories });
    return jsonOk({ store: saved });
  }

  const reorderParsed = reorderSchema.safeParse(body);
  if (reorderParsed.success && body?.categoryId === undefined) {
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
  const defaultCategoryId = store.categories[0]!.id;
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
    defaultCategoryId,
  );
  if (!merged) return jsonError("質問を入力してください。", 400);
  if (!store.categories.some((c) => c.id === merged.categoryId)) {
    merged.categoryId = defaultCategoryId;
  }

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

  const url = new URL(request.url);
  const categoryId = url.searchParams.get("categoryId") ?? "";
  const entryId = url.searchParams.get("id") ?? "";

  const store = await getIcebreakerStore(access.targetUserId, access.companyId);

  if (categoryId) {
    if (!store.categories.some((c) => c.id === categoryId)) {
      return jsonError("カテゴリが見つかりません。", 404);
    }
    const saved = await saveIcebreakerStore(deleteIcebreakerCategory(store, categoryId));
    return jsonOk({ store: saved });
  }

  if (!entryId) return jsonError("id または categoryId が必要です。", 400);

  const saved = await saveIcebreakerStore({
    ...store,
    entries: store.entries.filter((e) => e.id !== entryId),
  });
  return jsonOk({ store: saved });
}
