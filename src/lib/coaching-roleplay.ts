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

export type RoleplayItemDef = { id: string; label: string; sevenPointHint: string };

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
      { id: "ease", label: "話しやすさ", sevenPointHint: "相手が安心して本音を話せていると感じる" },
      { id: "expression", label: "表情", sevenPointHint: "相手の話に自然にうなずき、共感が伝わる表情だった" },
      { id: "backchannel", label: "相槌", sevenPointHint: "相手のペースに合った相槌で会話が途切れなかった" },
      { id: "natural_reaction", label: "反応の自然さ", sevenPointHint: "作為なく、相手の言葉に自然に反応できていた" },
      { id: "no_interrupt", label: "相手の話を遮らない", sevenPointHint: "相手が話し終えるまで待ち、遮ることなく聴けていた" },
      {
        id: "space",
        label: "相手が話しきれる余白をつくれている",
        sevenPointHint: "沈黙も含め、相手が考えて話せる余白をつくれていた",
      },
    ],
  },
  {
    id: "questioning",
    label: "質問力",
    items: [
      { id: "interest", label: "相手に興味を持って質問している", sevenPointHint: "相手の世界に本当に入り込んで質問できていた" },
      { id: "depth", label: "掘り下げ力がある", sevenPointHint: "表面的な話の奥にある本質に届く質問ができていた" },
      { id: "wording", label: "質問の言葉選びに違和感がない", sevenPointHint: "相手が答えやすい言葉で、自然な質問ができていた" },
      {
        id: "unknown_answer",
        label: "クライアント自身も答えを知らないような質問があった",
        sevenPointHint: "答えのない問いで、相手の思考が動いた",
      },
      { id: "perspective", label: "相手の視点を変える質問があった", sevenPointHint: "相手が新しい視点に気づく質問ができていた" },
      { id: "insight", label: "相手に気づきが生まれた", sevenPointHint: "相手が「そうか」と自分ごととして気づいた" },
    ],
  },
  {
    id: "mindset",
    label: "マインド",
    items: [
      { id: "no_judge", label: "ジャッジしない姿勢がある", sevenPointHint: "評価や正解を押し付けず、相手を受け止めていた" },
      { id: "no_fix", label: "相手を変えようとしすぎていない", sevenPointHint: "相手のペースを尊重し、変えようとしすぎなかった" },
      { id: "no_advice", label: "アドバイスに偏りすぎていない", sevenPointHint: "答えを与えるより、相手の中から引き出せていた" },
      { id: "belief", label: "相手の可能性を信じて関わっている", sevenPointHint: "相手の力を信じ、可能性を引き出す関わりができていた" },
    ],
  },
  {
    id: "condition",
    label: "コンディション",
    items: [
      { id: "good_state", label: "当日、良いコンディションで1on1に臨めた", sevenPointHint: "体調・メンタルともに万全で臨めた" },
      {
        id: "focus",
        label: "集中して相手に向き合えていた",
        sevenPointHint: "他のことを考える時間はないくらい相手の話に集中した",
      },
      { id: "calm", label: "落ち着いて対話できていた", sevenPointHint: "焦らず、落ち着いて対話の場をつくれていた" },
      { id: "self_aware", label: "自分の状態を客観視できていた", sevenPointHint: "自分の感情や偏りに気づき、対話に活かせていた" },
    ],
  },
];

export const ROLEPLAY_ITEM_IDS = ROLEPLAY_CATEGORIES.flatMap((c) => c.items.map((i) => i.id));

export const ROLEPLAY_ITEM_BY_ID = Object.fromEntries(
  ROLEPLAY_CATEGORIES.flatMap((c) => c.items.map((i) => [i.id, i])),
) as Record<string, RoleplayItemDef>;

export type RoleplayItemScore = { score: number | null; comment: string };

export type RoleplaySessionFeedback = {
  /** 1〜10。セッション全体の満足度（クライアント入力）。 */
  satisfactionScore: number | null;
  /** 満足度の理由（必須想定）。パートナーにも開示。 */
  satisfactionReason: string;
};

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
  sessionFeedback: RoleplaySessionFeedback;
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
  const crRaw = raw.clientReflection && typeof raw.clientReflection === "object"
    ? (raw.clientReflection as Record<string, unknown>)
    : {};
  const pfRaw = raw.partnerFeedback && typeof raw.partnerFeedback === "object"
    ? (raw.partnerFeedback as Record<string, unknown>)
    : {};
  const sfRaw =
    raw.sessionFeedback && typeof raw.sessionFeedback === "object"
      ? (raw.sessionFeedback as Record<string, unknown>)
      : {};
  const satRaw = sfRaw.satisfactionScore ?? raw.satisfactionScore;
  let satisfactionScore: number | null = null;
  if (typeof satRaw === "number" && Number.isFinite(satRaw)) {
    const n = Math.round(satRaw);
    if (n >= 1 && n <= 10) satisfactionScore = n;
  }

  return {
    round,
    conductedAt: typeof raw.conductedAt === "string" ? raw.conductedAt.slice(0, 10) : "",
    clientRole: trim(raw.clientRole, 200),
    partnerRole: trim(raw.partnerRole, 200),
    theme: trim(raw.theme, 500),
    selfScores: parseScores(raw.selfScores),
    partnerScores: parseScores(raw.partnerScores),
    clientReflection: {
      good: trim(crRaw.good, 4000),
      improve: trim(crRaw.improve, 4000),
      nextFocus: trim(crRaw.nextFocus, 4000),
    },
    partnerFeedback: {
      good: trim(pfRaw.good, 4000),
      improve: trim(pfRaw.improve, 4000),
      advice: trim(pfRaw.advice, 4000),
    },
    sessionFeedback: {
      satisfactionScore,
      satisfactionReason: trim(sfRaw.satisfactionReason ?? raw.satisfactionReason, 4000),
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

export function categoryRadarValues(
  scores: Record<string, RoleplayItemScore>,
): Array<number | null> {
  const avg = categoryAverages(scores);
  return ROLEPLAY_CATEGORIES.map((c) => avg[c.id]);
}

export function roleplaySideComplete(
  session: RoleplaySession,
  side: "client" | "partner",
): boolean {
  const scores = side === "client" ? session.selfScores : session.partnerScores;
  return ROLEPLAY_ITEM_IDS.some((id) => scores[id]?.score != null);
}

/**
 * 閲覧ロールに応じて伏せるフィールドがあれば加工する。
 * クライアント・パートナー・クライアント管理者は点数・自由記述を相互に閲覧可能。
 */
export function redactRoleplayStoreForViewer(
  store: RoleplayStore,
  role: string,
): RoleplayStore {
  if (
    role === "ADMIN" ||
    role === "ADMIN_ASSISTANT" ||
    role === "PARTNER" ||
    role === "CLIENT" ||
    role === "CLIENT_ADMIN" ||
    role === "CLIENT_HR"
  ) {
    return store;
  }
  return {
    ...store,
    sessions: store.sessions.map((s) => ({
      ...s,
      clientReflection: { good: "", improve: "", nextFocus: "" },
      partnerFeedback: { good: "", improve: "", advice: "" },
      sessionFeedback: { satisfactionScore: null, satisfactionReason: "" },
    })),
  };
}

export const SCORE_LABELS: Record<number, string> = {
  1: "ほとんどできていない",
  2: "一部はできているが、実践には大きな課題がある",
  3: "意識はできているが、実践はまだ不安定",
  4: "おおむねできているが、安定感には欠ける",
  5: "安定して実践できている",
  6: "7点に近いが、まだ伸び代はある",
  7: "非常に高いレベルで自然に実践できている",
};

const SCORE_TIER_HINTS: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: SCORE_LABELS[1]!,
  2: SCORE_LABELS[2]!,
  3: SCORE_LABELS[3]!,
  4: SCORE_LABELS[4]!,
  5: SCORE_LABELS[5]!,
  6: SCORE_LABELS[6]!,
};

/** 各項目の1〜7点の目安（プルダウン表示用）。7点は項目固有、1〜6点は共通の段階目安。 */
export function scoreHintsForItem(item: RoleplayItemDef): Record<1 | 2 | 3 | 4 | 5 | 6 | 7, string> {
  const { sevenPointHint } = item;
  return {
    7: sevenPointHint,
    6: SCORE_TIER_HINTS[6],
    5: SCORE_TIER_HINTS[5],
    4: SCORE_TIER_HINTS[4],
    3: SCORE_TIER_HINTS[3],
    2: SCORE_TIER_HINTS[2],
    1: SCORE_TIER_HINTS[1],
  };
}

export function scoreOptionLabel(item: RoleplayItemDef, score: number): string {
  const hints = scoreHintsForItem(item);
  const hint = hints[score as 1 | 2 | 3 | 4 | 5 | 6 | 7];
  return `${score}点：${hint}`;
}
