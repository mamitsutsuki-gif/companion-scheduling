function trim(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export type PdcaEntry = {
  id: string;
  sessionNumber: number | null;
  periodLabel: string;
  focusTheme: string;
  focusSkillIds: string[];
  plan: string;
  doText: string;
  check: string;
  act: string;
  clientNotes: string;
  coachComment: string;
  createdAt: string;
  updatedAt: string;
};

export type PdcaStore = {
  userId: string;
  companyId: string;
  entries: PdcaEntry[];
  updatedAt: string;
};

export function normalizePdcaEntry(input: unknown, fallbackId: string): PdcaEntry | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const id = trim(o.id, 80) || fallbackId;
  const sessionRaw = o.sessionNumber;
  const sessionNumber =
    sessionRaw === null || sessionRaw === undefined
      ? null
      : Number.isFinite(Number(sessionRaw))
        ? Math.max(1, Math.min(60, Math.round(Number(sessionRaw))))
        : null;
  const focusSkillIds = Array.isArray(o.focusSkillIds)
    ? o.focusSkillIds.map((v) => trim(v, 80)).filter(Boolean).slice(0, 5)
    : [];
  const now = new Date().toISOString();
  return {
    id,
    sessionNumber,
    periodLabel: trim(o.periodLabel, 120),
    focusTheme: trim(o.focusTheme, 500),
    focusSkillIds,
    plan: trim(o.plan, 4000),
    doText: trim(o.doText, 4000),
    check: trim(o.check, 4000),
    act: trim(o.act, 4000),
    clientNotes: trim(o.clientNotes, 4000),
    coachComment: trim(o.coachComment, 4000),
    createdAt: typeof o.createdAt === "string" ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : now,
  };
}

export function normalizePdcaStore(userId: string, companyId: string, input: unknown): PdcaStore {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const entriesRaw = Array.isArray(raw.entries) ? raw.entries : [];
  const entries: PdcaEntry[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < entriesRaw.length && entries.length < 120; i++) {
    const row = normalizePdcaEntry(entriesRaw[i], `pdca-${i + 1}`);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    entries.push(row);
  }
  entries.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  return {
    userId,
    companyId,
    entries,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export function pdcaSkillCounts(entries: PdcaEntry[]): Array<{ skillId: string; count: number }> {
  const map = new Map<string, number>();
  for (const e of entries) {
    for (const sid of e.focusSkillIds) {
      map.set(sid, (map.get(sid) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([skillId, count]) => ({ skillId, count }))
    .sort((a, b) => b.count - a.count);
}
