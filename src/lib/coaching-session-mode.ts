import type { CompanyPlan } from "@/lib/company-plan";

/** コーチング研修の各回 1on1 で使うフォーム種別 */
export type CoachingSessionMode = "standard" | "roleplay";

/** { [sessionNumber: string]: CoachingSessionMode } */
export type CoachingSessionModesByRound = Record<string, CoachingSessionMode>;

/**
 * ロールプレイ評価を設定できる最大セッション番号。
 * ストアが 1〜3 回分のみ保持する前提と揃え、4 回目以降は設定・実行とも不可。
 */
export const MAX_COACHING_ROLEPLAY_SESSION = 3;

export type CoachingSessionModeContext = {
  companyPlan: CompanyPlan;
  totalSessions: number;
  coachingSessionModesByRound?: CoachingSessionModesByRound | null;
};

/** 当該回にロールプレイ評価を割り当ててよいか（管理者設定・実行判定の共通上限） */
export function canAssignCoachingRoleplaySession(sessionNumber: number): boolean {
  const n = Math.round(Number(sessionNumber));
  return Number.isFinite(n) && n >= 1 && n <= MAX_COACHING_ROLEPLAY_SESSION;
}

export function normalizeCoachingSessionModesByRound(input: unknown): CoachingSessionModesByRound {
  if (!input || typeof input !== "object") return {};
  const out: CoachingSessionModesByRound = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const roundNum = Number(k);
    const round = String(roundNum);
    if (round === "NaN" || roundNum <= 0 || roundNum > 60) continue;
    if (v === "standard") {
      out[round] = "standard";
      continue;
    }
    if (v === "roleplay") {
      // 4 回目以降の roleplay はデータ不整合の原因になるため standard に正規化する
      out[round] = canAssignCoachingRoleplaySession(roundNum) ? "roleplay" : "standard";
    }
  }
  return out;
}

/** 設定未指定時の既定（後方互換: 1〜3回目 = ロールプレイ） */
export function defaultCoachingSessionMode(sessionNumber: number): CoachingSessionMode {
  return canAssignCoachingRoleplaySession(sessionNumber) ? "roleplay" : "standard";
}

export function buildDefaultCoachingSessionModes(totalSessions: number): CoachingSessionModesByRound {
  const out: CoachingSessionModesByRound = {};
  for (let i = 1; i <= Math.max(1, totalSessions); i++) {
    out[String(i)] = defaultCoachingSessionMode(i);
  }
  return out;
}

export function resolveCoachingSessionMode(
  ctx: CoachingSessionModeContext,
  sessionNumber: number,
): CoachingSessionMode {
  if (ctx.companyPlan !== "coaching_management_training") return "standard";
  // 旧データに 4 回目以降 roleplay が残っていても実行時は通常フォームに固定する
  if (!canAssignCoachingRoleplaySession(sessionNumber)) return "standard";
  const key = String(sessionNumber);
  const configured = ctx.coachingSessionModesByRound?.[key];
  if (configured === "standard" || configured === "roleplay") return configured;
  return defaultCoachingSessionMode(sessionNumber);
}

export function isCoachingRoleplaySession(
  ctx: CoachingSessionModeContext,
  sessionNumber: number,
): boolean {
  return resolveCoachingSessionMode(ctx, sessionNumber) === "roleplay";
}

export function coachingSessionModeContextFromEffective(input: {
  companyPlan: CompanyPlan;
  totalSessions: number;
  coachingSessionModesByRound?: CoachingSessionModesByRound | null;
}): CoachingSessionModeContext {
  return {
    companyPlan: input.companyPlan,
    totalSessions: input.totalSessions,
    coachingSessionModesByRound: input.coachingSessionModesByRound ?? null,
  };
}
