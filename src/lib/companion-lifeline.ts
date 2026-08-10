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
  /** エネルギーの源泉（まとめ） */
  energySourcesText: string;
  /** 大切にしている価値観（まとめ） */
  coreValuesText: string;
  updatedAt: string;
};

/** まとめテキストの最大文字数 */
export const LIFELINE_SUMMARY_TEXT_MAX = 2000;

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
    energySourcesText: trim(raw.energySourcesText, LIFELINE_SUMMARY_TEXT_MAX),
    coreValuesText: trim(raw.coreValuesText, LIFELINE_SUMMARY_TEXT_MAX),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

/**
 * 閲覧者ごとの公開範囲。
 * - self / full: 全項目
 * - manager（上司・パートナー）:
 *   - エピソード詳細（時期・タイトル・本文・理由）は常に非公開
 *   - 鍵なし: グラフ（感情スコア）＋価値観の気づき（insights）
 *   - 鍵あり: グラフのみ（insights も非公開）
 *   - まとめ（エネルギーの源泉／大切にしている価値観）は常に表示
 */
export function filterLifelineForViewer(
  chart: LifelineChart,
  mode: "full" | "manager" | "self" | "none",
): LifelineChart {
  if (mode === "none") {
    return { ...chart, events: [], energySourcesText: "", coreValuesText: "" };
  }
  if (mode === "full" || mode === "self") return chart;
  return {
    ...chart,
    events: chart.events.map((e) => ({
      ...e,
      ageOrPeriod: "",
      title: "",
      detail: "",
      emotionReason: "",
      // 感情スコアは鍵の有無に関わらずグラフ用に残す
      emotionScore: e.emotionScore,
      insights: e.locked ? "" : e.insights,
    })),
  };
}
