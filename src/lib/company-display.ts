import type { CompanyOption } from "@/lib/repositories/app-settings-repository";

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
