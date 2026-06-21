import type { CompanyPlan } from "@/lib/company-plan";

/** コーチング研修の各回 1on1 で使うフォーム種別 */
export type CoachingSessionMode = "standard" | "roleplay";

/** { [sessionNumber: string]: CoachingSessionMode } */
export type CoachingSessionModesByRound = Record<string, CoachingSessionMode>;

export type CoachingSessionModeContext = {
  companyPlan: CompanyPlan;
  totalSessions: number;
  coachingSessionModesByRound?: CoachingSessionModesByRound | null;
};

export function normalizeCoachingSessionModesByRound(input: unknown): CoachingSessionModesByRound {
  if (!input || typeof input !== "object") return {};
  const out: CoachingSessionModesByRound = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const round = String(Number(k));
    if (round === "NaN" || Number(round) <= 0 || Number(round) > 60) continue;
    if (v === "standard" || v === "roleplay") out[round] = v;
  }
  return out;
}

/** 設定未指定時の既定（後方互換: 1〜3回目 = ロールプレイ） */
export function defaultCoachingSessionMode(sessionNumber: number): CoachingSessionMode {
  return sessionNumber >= 1 && sessionNumber <= 3 ? "roleplay" : "standard";
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
  const key = String(sessionNumber);
  const configured = ctx.coachingSessionModesByRound?.[key];
  if (configured) return configured;
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
