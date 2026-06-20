function trim(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function clampEmotion(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-5, Math.min(5, Math.round(n)));
}

export type LifelineEvent = {
  id: string;
  ageOrPeriod: string;
  title: string;
  detail: string;
  emotionScore: number;
  emotionReason: string;
  insights: string;
  locked: boolean;
  sortOrder: number;
};

export type LifelineChart = {
  userId: string;
  companyId: string;
  events: LifelineEvent[];
  updatedAt: string;
};

export function normalizeLifelineEvent(input: unknown, fallbackId: string, sortOrder: number): LifelineEvent | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const id = trim(o.id, 80) || fallbackId;
  return {
    id,
    ageOrPeriod: trim(o.ageOrPeriod, 80),
    title: trim(o.title, 200),
    detail: trim(o.detail, 4000),
    emotionScore: clampEmotion(o.emotionScore),
    emotionReason: trim(o.emotionReason, 2000),
    insights: trim(o.insights, 2000),
    locked: Boolean(o.locked),
    sortOrder: Number.isFinite(Number(o.sortOrder)) ? Number(o.sortOrder) : sortOrder,
  };
}

export function normalizeLifelineChart(userId: string, companyId: string, input: unknown): LifelineChart {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const eventsRaw = Array.isArray(raw.events) ? raw.events : [];
  const events: LifelineEvent[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < eventsRaw.length && events.length < 80; i++) {
    const row = normalizeLifelineEvent(eventsRaw[i], `life-${i + 1}`, i);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    events.push(row);
  }
  events.sort((a, b) => a.sortOrder - b.sortOrder || a.ageOrPeriod.localeCompare(b.ageOrPeriod, "ja"));
  return {
    userId,
    companyId,
    events,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export function filterLifelineForViewer(
  chart: LifelineChart,
  mode: "full" | "manager" | "self" | "none",
): LifelineChart {
  if (mode === "none") return { ...chart, events: [] };
  if (mode === "full" || mode === "self") return chart;
  return {
    ...chart,
    events: chart.events
      .filter((e) => !e.locked || e.insights.trim().length > 0)
      .map((e) =>
        e.locked
          ? {
              ...e,
              title: "（非公開の出来事）",
              detail: "",
              emotionReason: "",
              emotionScore: 0,
            }
          : e,
      ),
  };
}
