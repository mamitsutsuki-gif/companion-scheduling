import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";
import { listMatchesForRole } from "@/lib/repositories/match-repository";

export const dynamic = "force-dynamic";

/**
 * 管理者用：登録済み企業の一覧と、その企業に割り当てられているクライアントの
 * ペア数のサマリを返す。Tier2（企業ハブ）の入口に使う。
 */
export async function GET() {
  const session = await readSession();
  if (!session || session.role !== "ADMIN") return jsonError("権限がありません。", 403);

  const [settings, matches] = await Promise.all([
    getAppSettingsRow(),
    listMatchesForRole({ role: "ADMIN", userId: session.sub }),
  ]);

  const pairCountByCompany = new Map<string, number>();
  let pairsWithoutCompany = 0;
  for (const m of matches as Array<{ client: { companyId?: string | null } }>) {
    const cid = (m.client.companyId ?? "").trim();
    if (cid) {
      pairCountByCompany.set(cid, (pairCountByCompany.get(cid) ?? 0) + 1);
    } else {
      pairsWithoutCompany += 1;
    }
  }

  const companies = settings.companies.map((c) => ({
    id: c.id,
    name: c.name,
    pairCount: pairCountByCompany.get(c.id) ?? 0,
  }));

  // 登録に無い companyId が付いているマッチ（=企業が消されたか未登録）を救済表示用にまとめる
  const knownIds = new Set(settings.companies.map((c) => c.id));
  const orphanCompanies: Array<{ id: string; pairCount: number }> = [];
  for (const [cid, count] of pairCountByCompany) {
    if (!knownIds.has(cid)) orphanCompanies.push({ id: cid, pairCount: count });
  }

  return jsonOk({
    companies,
    pairsWithoutCompany,
    orphanCompanies,
  });
}
