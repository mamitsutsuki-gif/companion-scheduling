function trim(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function clampScore(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  if (r < 1 || r > 7) return null;
  return r;
}

export type RoleplayCategoryId = "listening" | "questioning" | "mindset" | "condition";

export type RoleplayItemDef = { id: string; label: string };

export type RoleplayCategoryDef = {
  id: RoleplayCategoryId;
  label: string;
  items: RoleplayItemDef[];
};

export const ROLEPLAY_CATEGORIES: RoleplayCategoryDef[] = [
  {
    id: "listening",
    label: "傾聴力",
    items: [
      { id: "ease", label: "話しやすさ" },
      { id: "expression", label: "表情" },
      { id: "backchannel", label: "相槌" },
      { id: "natural_reaction", label: "反応の自然さ" },
      { id: "no_interrupt", label: "相手の話を遮らない" },
      { id: "space", label: "相手が話しきれる余白をつくれている" },
    ],
  },
  {
    id: "questioning",
    label: "質問力",
    items: [
      { id: "interest", label: "相手に興味を持って質問している" },
      { id: "depth", label: "掘り下げ力がある" },
      { id: "wording", label: "質問の言葉選びに違和感がない" },
      { id: "unknown_answer", label: "クライアント自身も答えを知らないような質問があった" },
      { id: "perspective", label: "相手の視点を変える質問があった" },
      { id: "insight", label: "相手に気づきが生まれた" },
    ],
  },
  {
    id: "mindset",
    label: "マインド",
    items: [
      { id: "no_judge", label: "ジャッジしない姿勢がある" },
      { id: "no_fix", label: "相手を変えようとしすぎていない" },
      { id: "no_advice", label: "アドバイスに偏りすぎていない" },
      { id: "belief", label: "相手の可能性を信じて関わっている" },
    ],
  },
  {
    id: "condition",
    label: "コンディション",
    items: [
      { id: "good_state", label: "当日、良いコンディションで1on1に臨めた" },
      { id: "focus", label: "集中して相手に向き合えていた" },
      { id: "calm", label: "落ち着いて対話できていた" },
      { id: "self_aware", label: "自分の状態を客観視できていた" },
    ],
  },
];

export const ROLEPLAY_ITEM_IDS = ROLEPLAY_CATEGORIES.flatMap((c) => c.items.map((i) => i.id));

export type RoleplayItemScore = { score: number | null; comment: string };

export type RoleplaySession = {
  round: 1 | 2 | 3;
  conductedAt: string;
  clientRole: string;
  partnerRole: string;
  theme: string;
  selfScores: Record<string, RoleplayItemScore>;
  partnerScores: Record<string, RoleplayItemScore>;
  clientReflection: { good: string; improve: string; nextFocus: string };
  partnerFeedback: { good: string; improve: string; advice: string };
  updatedAt: string;
};

export type RoleplayStore = {
  matchId: string;
  sessions: RoleplaySession[];
  updatedAt: string;
};

function emptyScores(): Record<string, RoleplayItemScore> {
  const out: Record<string, RoleplayItemScore> = {};
  for (const id of ROLEPLAY_ITEM_IDS) {
    out[id] = { score: null, comment: "" };
  }
  return out;
}

export function normalizeRoleplaySession(input: unknown, round: 1 | 2 | 3): RoleplaySession {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const parseScores = (src: unknown) => {
    const base = emptyScores();
    if (!src || typeof src !== "object") return base;
    const o = src as Record<string, unknown>;
    for (const id of ROLEPLAY_ITEM_IDS) {
      const row = o[id];
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      base[id] = {
        score: clampScore(r.score),
        comment: trim(r.comment, 2000),
      };
    }
    return base;
  };
  const parseTriple = (src: unknown, keys: [string, string, string]) => {
    const o = src && typeof src === "object" ? (src as Record<string, unknown>) : {};
    return {
      [keys[0]]: trim(o[keys[0]], 4000),
      [keys[1]]: trim(o[keys[1]], 4000),
      [keys[2]]: trim(o[keys[2]], 4000),
    } as RoleplaySession["clientReflection"];
  };
  const cr = parseTriple(raw.clientReflection, ["good", "improve", "nextFocus"]);
  const pfRaw = raw.partnerFeedback && typeof raw.partnerFeedback === "object"
    ? (raw.partnerFeedback as Record<string, unknown>)
    : {};
  return {
    round,
    conductedAt: typeof raw.conductedAt === "string" ? raw.conductedAt.slice(0, 10) : "",
    clientRole: trim(raw.clientRole, 200),
    partnerRole: trim(raw.partnerRole, 200),
    theme: trim(raw.theme, 500),
    selfScores: parseScores(raw.selfScores),
    partnerScores: parseScores(raw.partnerScores),
    clientReflection: cr,
    partnerFeedback: {
      good: trim(pfRaw.good, 4000),
      improve: trim(pfRaw.improve, 4000),
      advice: trim(pfRaw.advice, 4000),
    },
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export function normalizeRoleplayStore(matchId: string, input: unknown): RoleplayStore {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const sessions: RoleplaySession[] = [];
  const rawSessions = Array.isArray(raw.sessions) ? raw.sessions : [];
  for (let i = 0; i < Math.min(3, rawSessions.length); i++) {
    const round = (i + 1) as 1 | 2 | 3;
    sessions.push(normalizeRoleplaySession(rawSessions[i], round));
  }
  while (sessions.length < 3) {
    const round = (sessions.length + 1) as 1 | 2 | 3;
    sessions.push(normalizeRoleplaySession({}, round));
  }
  return {
    matchId,
    sessions: sessions.slice(0, 3),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export function categoryAverages(
  scores: Record<string, RoleplayItemScore>,
): Record<RoleplayCategoryId, number | null> {
  const out: Record<RoleplayCategoryId, number | null> = {
    listening: null,
    questioning: null,
    mindset: null,
    condition: null,
  };
  for (const cat of ROLEPLAY_CATEGORIES) {
    const vals = cat.items
      .map((i) => scores[i.id]?.score)
      .filter((v): v is number => v !== null && v !== undefined);
    out[cat.id] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  return out;
}

export const SCORE_LABELS: Record<number, string> = {
  1: "ほとんどできていない",
  2: "一部できているが、実践には大きな課題がある",
  3: "意識はできているが、実践は不安定",
  4: "基本的にはできている",
  5: "安定して実践できている",
  6: "相手に良い影響を与えるレベルで実践できている",
  7: "非常に高いレベルで自然に実践できている",
};
