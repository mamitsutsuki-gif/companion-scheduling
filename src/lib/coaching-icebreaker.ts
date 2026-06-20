import { nanoid } from "nanoid";

function trim(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export type IcebreakerEntry = {
  id: string;
  title: string;
  content: string;
  useCase: string;
  targetAudience: string;
  memo: string;
  registeredAt: string;
  updatedAt: string;
};

export type IcebreakerStore = {
  userId: string;
  companyId: string;
  entries: IcebreakerEntry[];
  updatedAt: string;
};

export function normalizeIcebreakerEntry(input: unknown, fallbackId: string): IcebreakerEntry | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const title = trim(raw.title, 200);
  if (!title) return null;
  const id = trim(raw.id, 80) || fallbackId;
  return {
    id,
    title,
    content: trim(raw.content, 4000),
    useCase: trim(raw.useCase, 1000),
    targetAudience: trim(raw.targetAudience, 500),
    memo: trim(raw.memo, 2000),
    registeredAt:
      typeof raw.registeredAt === "string" ? raw.registeredAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
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
  entries.sort((a, b) => (b.registeredAt > a.registeredAt ? 1 : -1));
  return {
    userId,
    companyId,
    entries,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export function newIcebreakerId() {
  return `ice-${nanoid(10)}`;
}
