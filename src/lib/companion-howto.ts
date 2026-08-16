import type { Role } from "@prisma/client";
import { isIndividualCompanionPlan, type CompanyPlan } from "@/lib/company-plan";

export const COMPANION_HOWTO_AUDIENCES = ["client", "supervisor", "partner"] as const;
export type CompanionHowtoAudience = (typeof COMPANION_HOWTO_AUDIENCES)[number];

export function companionHowtoEnabled(plan: CompanyPlan): boolean {
  return isIndividualCompanionPlan(plan);
}

/** マッチルームに出す操作ガイド。運営（モチベイジ）向けは出さない。 */
export function companionHowtoAudiencesForViewer(input: {
  role: Role;
  supervisorViewer: boolean;
}): CompanionHowtoAudience[] {
  if (input.role === "ADMIN" || input.role === "ADMIN_ASSISTANT") {
    return [...COMPANION_HOWTO_AUDIENCES];
  }
  if (input.supervisorViewer) return ["supervisor"];
  if (input.role === "PARTNER") return ["partner"];
  return ["client"];
}

export function companionHowtoLabel(input: {
  audience: CompanionHowtoAudience;
  showAudienceInLabel: boolean;
}): string {
  if (!input.showAudienceInLabel) return "操作ガイド";
  if (input.audience === "client") return "操作ガイド（受講者）";
  if (input.audience === "supervisor") return "操作ガイド（上司）";
  return "操作ガイド（パートナー）";
}

export function companionHowtoSrc(audience: CompanionHowtoAudience): string {
  return `/howto-companion/index.html#${audience}`;
}
