import type { CompanyOption } from "@/lib/repositories/app-settings-repository";
import { companyPlanLabel, normalizeCompanyPlan } from "@/lib/company-plan";

/** アプリ設定に登録された企業一覧から、表示用ラベル（企業名（ID））を返す。 */
export function companyLabelFromRegistry(
  companyId: string | null | undefined,
  companies: CompanyOption[],
): string | null {
  const id = (companyId ?? "").trim();
  if (!id) return null;
  const c = companies.find((x) => x.id === id);
  if (c) return `${c.name}（${c.id}）`;
  return `（未登録ID: ${id}）`;
}

/** 企業の導入プラン表示ラベル */
export function companyPlanLabelFromRegistry(
  companyId: string | null | undefined,
  companies: CompanyOption[],
): string {
  const id = (companyId ?? "").trim();
  if (!id) return companyPlanLabel(normalizeCompanyPlan(undefined));
  const c = companies.find((x) => x.id === id);
  return companyPlanLabel(normalizeCompanyPlan(c?.plan));
}
