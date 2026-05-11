import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import {
  getAppSettingsRow,
  getCompanyAppSettingsOverride,
} from "@/lib/repositories/app-settings-repository";
import { listMatchesForRole } from "@/lib/repositories/match-repository";

export const dynamic = "force-dynamic";

/**
 * 管理者用：登録済み企業の一覧と、その企業に割り当てられているクライアントの
 * ペア数のサマリを返す。Tier2（企業ハブ）の入口に使う。
 *
 * 各企業について `overriddenCount` も返す。値が 0 なら全体設定そのまま、
 * 1 以上ならその企業に固有の上書きが入っていることを意味する。
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
  const pairsWithoutCompanyClientIds: string[] = [];
  for (const m of matches as Array<{
    client: { id?: string; companyId?: string | null; displayName?: string };
  }>) {
    const cid = (m.client.companyId ?? "").trim();
    if (cid) {
      pairCountByCompany.set(cid, (pairCountByCompany.get(cid) ?? 0) + 1);
    } else {
      pairsWithoutCompany += 1;
      const id = String(m.client.id ?? "").trim();
      if (id) pairsWithoutCompanyClientIds.push(id);
    }
  }

  // 各企業の override 取得。少数想定だが過剰呼び出しを避けるため Promise.all。
  const overridesByCompany = new Map<string, number>();
  await Promise.all(
    settings.companies.map(async (c) => {
      const ov = await getCompanyAppSettingsOverride(c.id).catch(() => null);
      if (!ov) {
        overridesByCompany.set(c.id, 0);
        return;
      }
      // companyId / updatedAt 以外で値が立っているフィールド数
      const ignore = new Set(["companyId", "updatedAt"]);
      let count = 0;
      for (const [k, v] of Object.entries(ov as Record<string, unknown>)) {
        if (ignore.has(k)) continue;
        if (v !== undefined && v !== null) count += 1;
      }
      overridesByCompany.set(c.id, count);
    }),
  );

  const companies = settings.companies.map((c) => ({
    id: c.id,
    name: c.name,
    pairCount: pairCountByCompany.get(c.id) ?? 0,
    overriddenCount: overridesByCompany.get(c.id) ?? 0,
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
    pairsWithoutCompanyClientIds,
    orphanCompanies,
  });
}
