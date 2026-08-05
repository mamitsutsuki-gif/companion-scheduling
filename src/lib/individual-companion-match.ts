import type { CompanyPlan, IndividualCompanionPlan } from "@/lib/company-plan";
import { isIndividualCompanionPlan } from "@/lib/company-plan";

/**
 * 個別伴走プラン専用: クライアント管理者を「上司」として partnerId に置ける。
 * 他プランでは PARTNER のみ（従来どおり）。
 */
export function canBeMatchPartnerForPlan(
  role: string | null | undefined,
  plan: CompanyPlan | null | undefined,
): boolean {
  if (role === "PARTNER") return true;
  if (isIndividualCompanionPlan(plan) && role === "CLIENT_ADMIN") return true;
  return false;
}

export function isIndividualCompanionSupervisorRole(role: string | null | undefined): boolean {
  return role === "CLIENT_ADMIN";
}

/** 読み取り側: CLIENT_ADMIN が partnerId のマッチを上司ルームとして認めるか */
export function isIndividualCompanionSupervisorMatch(input: {
  actorRole: string | null | undefined;
  actorId: string;
  partnerId: string;
  programPlan: CompanyPlan | null | undefined;
}): boolean {
  if (input.actorRole !== "CLIENT_ADMIN") return false;
  if (!input.partnerId || input.partnerId !== input.actorId) return false;
  // CLIENT_ADMIN を partner に置けるのは個別伴走のみ。programId 欠落のレガシーも許可する。
  if (input.programPlan != null && !isIndividualCompanionPlan(input.programPlan)) return false;
  return true;
}

export type { IndividualCompanionPlan };
