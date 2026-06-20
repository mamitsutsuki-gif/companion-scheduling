import { nanoid } from "nanoid";

function trim(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export type IcebreakerEntry = {
  id: string;
  /** 1行の質問・ネタ文 */
  question: string;
  updatedAt: string;
};

export type IcebreakerStore = {
  userId: string;
  companyId: string;
  /** 先頭ほど優先度が高い */
  entries: IcebreakerEntry[];
  updatedAt: string;
};

export function normalizeIcebreakerEntry(input: unknown, fallbackId: string): IcebreakerEntry | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const question = trim(raw.question ?? raw.title ?? raw.content, 500);
  if (!question) return null;
  const id = trim(raw.id, 80) || fallbackId;
  return {
    id,
    question,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export function normalizeIcebreakerStore(userId: string, companyId: string, input: unknown): IcebreakerStore {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const entries: IcebreakerEntry[] = [];
  const arr = Array.isArray(raw.entries) ? raw.entries : [];
  const seen = new Set<string>();
  for (let i = 0; i < arr.length && entries.length < 200; i++) {
    const e = normalizeIcebreakerEntry(arr[i], `ice-${i + 1}`);
    if (!e || seen.has(e.id)) continue;
    seen.add(e.id);
    entries.push(e);
  }
  return {
    userId,
    companyId,
    entries,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
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

export function newIcebreakerId() {
  return `ice-${nanoid(10)}`;
}
