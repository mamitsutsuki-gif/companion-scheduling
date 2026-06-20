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

export type RoleplayItemDef = { id: string; label: string; sevenPointHint: string; onePointHint: string };

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
      {
        id: "ease",
        label: "話しやすさ",
        sevenPointHint: "相手が安心して本音を話せていることが伝わる。それが安定的にできている。",
        onePointHint: "相手が話しにくそうにしており、本音や考えを十分に話せていない。",
      },
      {
        id: "expression",
        label: "表情",
        sevenPointHint: "表情が自然で柔らかく、相手が安心して話せる雰囲気をつくれている。",
        onePointHint: "表情が硬い、無表情、または不自然で、相手が話しにくい印象を与えている。",
      },
      {
        id: "backchannel",
        label: "相槌",
        sevenPointHint: "相手の話に合わせて自然で適切な相槌ができており、話を促進している。",
        onePointHint: "相槌が少ない、または不自然で、相手が話しづらそうにしている。",
      },
      {
        id: "natural_reaction",
        label: "反応の自然さ",
        sevenPointHint: "相手の話に対する反応が自然で、対話がスムーズに流れている。",
        onePointHint: "反応に違和感があり、対話の流れを妨げている。",
      },
      {
        id: "no_interrupt",
        label: "相手の話を遮らない",
        sevenPointHint: "相手の話を最後まで尊重して聴き、途中で遮ることがほとんどない。",
        onePointHint: "相手の話を途中で遮る場面が多い。",
      },
      {
        id: "space",
        label: "相手が話しきれる余白をつくれている",
        sevenPointHint: "沈黙や間を適切に活用し、相手が十分に考えながら話せている。",
        onePointHint: "間を待てず、相手が話しきる前に介入してしまう。",
      },
    ],
  },
  {
    id: "questioning",
    label: "質問力",
    items: [
      {
        id: "interest",
        label: "相手に興味を持って質問している",
        sevenPointHint: "相手への純粋な関心が伝わり、質問に自然な一貫性がある。",
        onePointHint: "質問が形式的で、相手への関心が感じられない。",
      },
      {
        id: "depth",
        label: "掘り下げ力がある",
        sevenPointHint: "表面的な話で終わらず、背景や価値観まで自然に掘り下げられている。",
        onePointHint: "話題の深掘りがほとんどなく、表面的な会話に留まっている。",
      },
      {
        id: "wording",
        label: "質問の言葉選びに違和感がない",
        sevenPointHint: "相手にとって受け取りやすく、考えやすい言葉で質問できている。",
        onePointHint: "質問の表現に違和感があり、相手を戸惑わせている。",
      },
      {
        id: "unknown_answer",
        label: "クライアント自身も答えを知らないような質問があった",
        sevenPointHint: "相手の新たな気づきや内省を促す問いが複数見られる。",
        onePointHint: "既知の事実確認に終始し、新たな視点を生む問いがほとんどない。",
      },
      {
        id: "perspective",
        label: "相手の視点を変える質問があった",
        sevenPointHint: "相手の見方や捉え方に変化をもたらす問いができている。",
        onePointHint: "視点の変化につながる問いが見られない。",
      },
      {
        id: "insight",
        label: "相手に気づきが生まれた",
        sevenPointHint: "対話の中で相手自身の気づきや発見が明確に生まれている。",
        onePointHint: "新たな気づきにつながる場面が見られない。",
      },
    ],
  },
  {
    id: "mindset",
    label: "マインド",
    items: [
      {
        id: "no_judge",
        label: "ジャッジしない姿勢がある",
        sevenPointHint: "良い悪いを評価せず、相手を理解しようとする姿勢が一貫している。",
        onePointHint: "評価や決めつけが目立ち、相手が自由に話しにくい。",
      },
      {
        id: "no_fix",
        label: "相手を変えようとしすぎていない",
        sevenPointHint: "相手の主体性を尊重し、変化を押し付けていない。",
        onePointHint: "相手を変えようとする意図が強く表れている。",
      },
      {
        id: "no_advice",
        label: "アドバイスに偏りすぎていない",
        sevenPointHint: "相手の思考を促すことを優先し、必要な時だけ助言している。",
        onePointHint: "アドバイスが中心となり、相手が考える機会を奪っている。",
      },
      {
        id: "belief",
        label: "相手の可能性を信じて関わっている",
        sevenPointHint: "相手の力や可能性を信頼した関わりが一貫して見られる。",
        onePointHint: "相手への不信や過度な誘導が感じられる。",
      },
    ],
  },
  {
    id: "condition",
    label: "コンディション",
    items: [
      {
        id: "good_state",
        label: "当日、良いコンディションで1on1に臨めた",
        sevenPointHint: "十分な準備と心身の状態でセッションに臨めている。",
        onePointHint: "準備不足やコンディション不良が目立つ。",
      },
      {
        id: "focus",
        label: "集中して相手に向き合えていた",
        sevenPointHint: "相手に意識を向け続け、高い集中状態を維持できている。",
        onePointHint: "注意が散漫で、相手への集中が不足している。",
      },
      {
        id: "calm",
        label: "落ち着いて対話できていた",
        sevenPointHint: "終始落ち着いており、安心感のある場をつくれている。",
        onePointHint: "焦りや緊張が対話に表れている。",
      },
      {
        id: "self_aware",
        label: "自分の状態を客観視できていた",
        sevenPointHint: "自身の感情や反応を認識しながら対話できている。",
        onePointHint: "自分の感情や状態に無自覚なまま対話している。",
      },
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

const SCORE_TIER_HINTS: Record<2 | 3 | 4 | 5 | 6, string> = {
  6: "良い状態で実践できていることが多く、相手にも良い影響を与えている。",
  5: "基本的にはできているが、場面によってばらつきがある。",
  4: "できている場面とできていない場面が同程度ある。",
  3: "意識は見られるが、実践できていない場面が目立つ。",
  2: "十分に実践できていない。",
};

export const SCORE_LABELS: Record<number, string> = {
  1: "1点の目安",
  2: SCORE_TIER_HINTS[2],
  3: SCORE_TIER_HINTS[3],
  4: SCORE_TIER_HINTS[4],
  5: SCORE_TIER_HINTS[5],
  6: SCORE_TIER_HINTS[6],
  7: "7点の目安",
};

/** 各項目の1〜7点の目安（プルダウン表示用）。7点・1点は項目固有、2〜6点は共通。 */
export function scoreHintsForItem(item: RoleplayItemDef): Record<1 | 2 | 3 | 4 | 5 | 6 | 7, string> {
  return {
    7: item.sevenPointHint,
    6: SCORE_TIER_HINTS[6],
    5: SCORE_TIER_HINTS[5],
    4: SCORE_TIER_HINTS[4],
    3: SCORE_TIER_HINTS[3],
    2: SCORE_TIER_HINTS[2],
    1: item.onePointHint,
  };
}

export function scoreOptionLabel(item: RoleplayItemDef, score: number): string {
  const hints = scoreHintsForItem(item);
  const hint = hints[score as 1 | 2 | 3 | 4 | 5 | 6 | 7];
  return `${score}点：${hint}`;
}
