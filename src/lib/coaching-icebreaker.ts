import { nanoid } from "nanoid";

function trim(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export type IcebreakerCategory = {
  id: string;
  label: string;
};

export const DEFAULT_ICEBREAKER_CATEGORIES: IcebreakerCategory[] = [
  { id: "cat-recent", label: "最近のこと" },
  { id: "cat-season", label: "季節・時事ネタ" },
  { id: "cat-work", label: "仕事の様子" },
  { id: "cat-private", label: "プライベートな話題" },
];

export type IcebreakerEntry = {
  id: string;
  /** 1行の質問・ネタ文 */
  question: string;
  categoryId: string;
  updatedAt: string;
};

export type IcebreakerStore = {
  userId: string;
  companyId: string;
  categories: IcebreakerCategory[];
  /** カテゴリ順 → 各カテゴリ内の優先度順 */
  entries: IcebreakerEntry[];
  updatedAt: string;
};

export function normalizeIcebreakerCategory(input: unknown, fallbackId: string): IcebreakerCategory | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const label = trim(raw.label ?? raw.name, 100);
  if (!label) return null;
  const id = trim(raw.id, 80) || fallbackId;
  return { id, label };
}

export function normalizeIcebreakerCategories(input: unknown): IcebreakerCategory[] {
  if (!Array.isArray(input) || input.length === 0) {
    return DEFAULT_ICEBREAKER_CATEGORIES.map((c) => ({ ...c }));
  }
  const out: IcebreakerCategory[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < input.length && out.length < 32; i++) {
    const c = normalizeIcebreakerCategory(input[i], `cat-${i + 1}`);
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out.length > 0 ? out : DEFAULT_ICEBREAKER_CATEGORIES.map((c) => ({ ...c }));
}

export function normalizeIcebreakerEntry(
  input: unknown,
  fallbackId: string,
  defaultCategoryId: string,
): IcebreakerEntry | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const question = trim(raw.question ?? raw.title ?? raw.content, 500);
  if (!question) return null;
  const id = trim(raw.id, 80) || fallbackId;
  const categoryId = trim(raw.categoryId, 80) || defaultCategoryId;
  return {
    id,
    question,
    categoryId,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export function normalizeIcebreakerStore(userId: string, companyId: string, input: unknown): IcebreakerStore {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const categories = normalizeIcebreakerCategories(raw.categories);
  const defaultCategoryId = categories[0]!.id;
  const validCategoryIds = new Set(categories.map((c) => c.id));

  const entries: IcebreakerEntry[] = [];
  const arr = Array.isArray(raw.entries) ? raw.entries : [];
  const seen = new Set<string>();
  for (let i = 0; i < arr.length && entries.length < 200; i++) {
    const e = normalizeIcebreakerEntry(arr[i], `ice-${i + 1}`, defaultCategoryId);
    if (!e || seen.has(e.id)) continue;
    if (!validCategoryIds.has(e.categoryId)) {
      e.categoryId = defaultCategoryId;
    }
    seen.add(e.id);
    entries.push(e);
  }

  return {
    userId,
    companyId,
    categories,
    entries: sortIcebreakerEntriesByCategories(entries, categories),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export function sortIcebreakerEntriesByCategories(
  entries: IcebreakerEntry[],
  categories: IcebreakerCategory[],
): IcebreakerEntry[] {
  const byCategory = new Map<string, IcebreakerEntry[]>();
  for (const cat of categories) byCategory.set(cat.id, []);
  const orphan: IcebreakerEntry[] = [];
  for (const e of entries) {
    const bucket = byCategory.get(e.categoryId);
    if (bucket) bucket.push(e);
    else orphan.push(e);
  }
  const out: IcebreakerEntry[] = [];
  for (const cat of categories) out.push(...(byCategory.get(cat.id) ?? []));
  out.push(...orphan);
  return out;
}

export function entriesForCategory(store: IcebreakerStore, categoryId: string): IcebreakerEntry[] {
  return store.entries.filter((e) => e.categoryId === categoryId);
}

export function reorderIcebreakerEntries(
  entries: IcebreakerEntry[],
  orderedIds: string[],
): IcebreakerEntry[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const out: IcebreakerEntry[] = [];
  for (const id of orderedIds) {
    const hit = byId.get(id);
    if (hit) {
      out.push(hit);
      byId.delete(id);
    }
  }
  for (const rest of byId.values()) out.push(rest);
  return out;
}

export function reorderIcebreakerEntriesInCategory(
  store: IcebreakerStore,
  categoryId: string,
  orderedIds: string[],
): IcebreakerEntry[] {
  const inCategory = entriesForCategory(store, categoryId);
  const reordered = reorderIcebreakerEntries(inCategory, orderedIds);
  const byCategory = new Map<string, IcebreakerEntry[]>();
  for (const cat of store.categories) byCategory.set(cat.id, []);
  byCategory.set(categoryId, reordered);
  for (const e of store.entries) {
    if (e.categoryId === categoryId) continue;
    const bucket = byCategory.get(e.categoryId);
    if (bucket) bucket.push(e);
  }
  const out: IcebreakerEntry[] = [];
  for (const cat of store.categories) out.push(...(byCategory.get(cat.id) ?? []));
  return out;
}

export function upsertIcebreakerCategory(
  categories: IcebreakerCategory[],
  input: { id?: string; label: string },
): IcebreakerCategory[] {
  const label = trim(input.label, 100);
  if (!label) return categories;
  const existingId = trim(input.id, 80);
  if (existingId && categories.some((c) => c.id === existingId)) {
    return categories.map((c) => (c.id === existingId ? { ...c, label } : c));
  }
  return [...categories, { id: newIcebreakerCategoryId(), label }];
}

export function deleteIcebreakerCategory(store: IcebreakerStore, categoryId: string): IcebreakerStore {
  if (store.categories.length <= 1) return store;
  const fallbackId = store.categories.find((c) => c.id !== categoryId)?.id ?? store.categories[0]!.id;
  const categories = store.categories.filter((c) => c.id !== categoryId);
  const entries = store.entries.map((e) =>
    e.categoryId === categoryId ? { ...e, categoryId: fallbackId } : e,
  );
  return {
    ...store,
    categories,
    entries: sortIcebreakerEntriesByCategories(entries, categories),
  };
}

export function newIcebreakerId() {
  return `ice-${nanoid(10)}`;
}

export function newIcebreakerCategoryId() {
  return `cat-${nanoid(8)}`;
}
