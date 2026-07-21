import type { CompanyPlan } from "@/lib/company-plan";

/**
 * 個別伴走プラン専用: クライアント管理者を「上司」として partnerId に置ける。
 * 他プランでは PARTNER のみ（従来どおり）。
 */
export function canBeMatchPartnerForPlan(
  role: string | null | undefined,
  plan: CompanyPlan | null | undefined,
): boolean {
  if (role === "PARTNER") return true;
  if (plan === "individual_companion" && role === "CLIENT_ADMIN") return true;
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
  return input.programPlan === "individual_companion";
}
