export type SkillScore = 1 | 2 | 3 | 4 | 5;

export type SkillCriteria = {
  score1: string;
  score2: string;
  score3: string;
  score4: string;
  score5: string;
};

export type SkillDefinition = {
  id: string;
  name: string;
  kind: "common" | "company";
  criteria: SkillCriteria;
};

export type SkillAssessmentEntry = {
  selfScore: SkillScore | null;
  managerScore: SkillScore | null;
  /** 本人評価の理由・エビデンス */
  selfReason: string;
  /** 上司評価の理由・エビデンス */
  managerReason: string;
};

export type SkillCheckPhase = "baseline" | "current";

export type SkillCheckProfile = {
  userId: string;
  companyId: string;
  baseline: Record<string, SkillAssessmentEntry>;
  current: Record<string, SkillAssessmentEntry>;
  focusSkillIds: string[];
  /** 手入力で編集したスキル項目。未設定時は企業共通定義を使う */
  skillDefinitions: SkillDefinition[] | null;
  /** 成長・挑戦合意: 本人が大切にしたいこと */
  clientValuesText: string;
  /** 成長・挑戦合意: 本人の6か月後の目指す状態 */
  clientSixMonthGoalText: string;
  /** 成長・挑戦合意: 上司が書く現在期待される役割 */
  managerCurrentRoleText: string;
  /** 成長・挑戦合意: 上司が書く次に期待される役割 */
  managerNextRoleText: string;
  updatedAt: string;
};

/** 成長・挑戦合意テキストの最大文字数 */
export const SKILL_CHECK_AGREEMENT_TEXT_MAX = 2000;

/** 評価理由テキストの最大文字数 */
export const SKILL_CHECK_REASON_TEXT_MAX = 1000;

/** 4点以上を付ける場合に理由を必須とする閾値 */
export const SKILL_CHECK_REASON_REQUIRED_MIN_SCORE = 4 as SkillScore;

/** 重点育成スキルの上限（1〜3項目） */
export const SKILL_CHECK_FOCUS_MAX = 3;

const DEFAULT_CRITERIA: SkillCriteria = {
  score1: "これから伸ばしたい段階",
  score2: "一部で発揮できている",
  score3: "日常業務で発揮できている",
  score4: "周囲から認識されている",
  score5: "組織の模範として発揮できている",
};

function skill(
  id: string,
  name: string,
  criteria?: Partial<SkillCriteria>,
): SkillDefinition {
  return {
    id,
    name,
    kind: "common",
    criteria: { ...DEFAULT_CRITERIA, ...criteria },
  };
}

/** 管理職育成向けの共通スキル（個別伴走プラン） */
export const DEFAULT_COMMON_SKILLS: SkillDefinition[] = [
  skill("initiative", "主体性"),
  skill("issue-setting", "課題設定力"),
  skill("issue-solving", "課題解決力"),
  skill("engagement", "巻き込み力", {
    score1: "指示された相手とだけ関わる",
    score2: "必要な相手に相談できる",
    score3: "関係者を巻き込みながら進められる",
    score4: "複数部署を横断して調整できる",
    score5: "組織全体を動かす推進力がある",
  }),
  skill("dialogue", "対話力"),
  skill("coaching", "育成力"),
  skill("leadership", "リーダーシップ"),
  skill("goal-setting", "目標設定力"),
  skill("execution", "実行力"),
  skill("reflection", "振り返り力"),
];

function trimText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function normalizeSkillScore(v: unknown): SkillScore | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  if (r < 1 || r > 5) return null;
  return r as SkillScore;
}

export function normalizeSkillCriteria(input: unknown): SkillCriteria {
  if (!input || typeof input !== "object") return { ...DEFAULT_CRITERIA };
  const o = input as Record<string, unknown>;
  return {
    score1: trimText(o.score1, 500) || DEFAULT_CRITERIA.score1,
    score2: trimText(o.score2, 500) || DEFAULT_CRITERIA.score2,
    score3: trimText(o.score3, 500) || DEFAULT_CRITERIA.score3,
    score4: trimText(o.score4, 500) || DEFAULT_CRITERIA.score4,
    score5: trimText(o.score5, 500) || DEFAULT_CRITERIA.score5,
  };
}

export function normalizeSkillDefinition(input: unknown, kind: "common" | "company"): SkillDefinition | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const id = trimText(o.id, 80).replace(/[^a-zA-Z0-9_-]/g, "");
  const name = trimText(o.name, 120);
  if (!id || !name) return null;
  return {
    id,
    name,
    kind,
    criteria: normalizeSkillCriteria(o.criteria),
  };
}

export function normalizeCompanySkillDefinitions(input: unknown): SkillDefinition[] {
  if (!Array.isArray(input)) return [];
  const out: SkillDefinition[] = [];
  const seen = new Set<string>();
  for (const row of input) {
    const skillDef = normalizeSkillDefinition(row, "company");
    if (!skillDef || seen.has(skillDef.id)) continue;
    seen.add(skillDef.id);
    out.push(skillDef);
    if (out.length >= 32) break;
  }
  return out;
}

export function mergeSkillDefinitions(companySkills: SkillDefinition[]): SkillDefinition[] {
  return [...DEFAULT_COMMON_SKILLS, ...companySkills];
}

function normalizeAssessmentMap(input: unknown): Record<string, SkillAssessmentEntry> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, SkillAssessmentEntry> = {};
  for (const [skillId, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    out[skillId] = {
      selfScore: normalizeSkillScore(row.selfScore),
      managerScore: normalizeSkillScore(row.managerScore),
      selfReason: trimText(row.selfReason, SKILL_CHECK_REASON_TEXT_MAX),
      managerReason: trimText(row.managerReason, SKILL_CHECK_REASON_TEXT_MAX),
    };
  }
  return out;
}

export function normalizeSkillCheckProfile(userId: string, companyId: string, input: unknown): SkillCheckProfile {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const focusRaw = Array.isArray(raw.focusSkillIds) ? raw.focusSkillIds : [];
  const focusSkillIds = focusRaw
    .map((v) => trimText(v, 80))
    .filter((v) => v.length > 0)
    .slice(0, SKILL_CHECK_FOCUS_MAX);
  const custom = normalizeCompanySkillDefinitions(raw.skillDefinitions);
  return {
    userId,
    companyId,
    baseline: normalizeAssessmentMap(raw.baseline),
    current: normalizeAssessmentMap(raw.current),
    focusSkillIds,
    skillDefinitions: custom.length > 0 ? custom.map((s) => ({ ...s, kind: "company" as const })) : null,
    clientValuesText: trimText(raw.clientValuesText, SKILL_CHECK_AGREEMENT_TEXT_MAX),
    clientSixMonthGoalText: trimText(raw.clientSixMonthGoalText, SKILL_CHECK_AGREEMENT_TEXT_MAX),
    managerCurrentRoleText: trimText(raw.managerCurrentRoleText, SKILL_CHECK_AGREEMENT_TEXT_MAX),
    managerNextRoleText: trimText(raw.managerNextRoleText, SKILL_CHECK_AGREEMENT_TEXT_MAX),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

/** プロフィール固有の項目があればそれを優先、なければ企業共通定義 */
export function resolveEffectiveSkillDefinitions(
  profile: SkillCheckProfile | null | undefined,
  companySkills: SkillDefinition[],
): SkillDefinition[] {
  if (profile?.skillDefinitions && profile.skillDefinitions.length > 0) {
    return profile.skillDefinitions;
  }
  return companySkills;
}

export function criteriaLabel(criteria: SkillCriteria, score: SkillScore): string {
  if (score === 1) return criteria.score1;
  if (score === 2) return criteria.score2;
  if (score === 3) return criteria.score3;
  if (score === 4) return criteria.score4;
  return criteria.score5;
}

export function scoreGap(selfScore: SkillScore | null, managerScore: SkillScore | null): number | null {
  if (selfScore === null || managerScore === null) return null;
  return managerScore - selfScore;
}

export function emptySkillAssessment(): SkillAssessmentEntry {
  return { selfScore: null, managerScore: null, selfReason: "", managerReason: "" };
}

/** 4点以上の評価には理由が必要か */
export function needsScoreReason(score: SkillScore | null | undefined): boolean {
  return score != null && score >= SKILL_CHECK_REASON_REQUIRED_MIN_SCORE;
}
