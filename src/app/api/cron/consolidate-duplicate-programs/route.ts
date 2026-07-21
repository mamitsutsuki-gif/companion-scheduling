import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/json";
import { consolidateDuplicateProgramsForCompany } from "@/lib/repositories/program-repository";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";

export const dynamic = "force-dynamic";

const schema = z.object({
  companyId: z.string().trim().min(1).max(60).optional(),
  /** true のとき書き込まずプレビューのみ */
  dryRun: z.boolean().optional(),
  /** true のとき全企業の重複だけ一覧（書き込みなし） */
  scanAll: z.boolean().optional(),
});

/**
 * 企業1件だけ、同一プランの重複プログラムを正本へ統合する。
 * Authorization: Bearer CRON_SECRET
 *
 * 例: { "companyId": "company-mr2y8ov7" }
 * プレビュー: { "companyId": "company-mr2y8ov7", "dryRun": true }
 * 全社スキャン: { "scanAll": true }
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return jsonError("CRON_SECRET が未設定です。", 503);

  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const q = new URL(request.url).searchParams.get("secret") ?? "";
  if (bearer !== secret && q !== secret) return jsonError("認証に失敗しました。", 401);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力が不正です。", 400);

  const settings = await getAppSettingsRow();

  if (parsed.data.scanAll) {
    const { listProgramsForCompany, getProgramUsageStats } = await import(
      "@/lib/repositories/program-repository"
    );
    const duplicates: Array<{
      companyId: string;
      companyName: string;
      plan: string;
      programs: Array<{
        id: string;
        name: string;
        createdAt: string;
        assignedMatchCount: number;
        pendingMatchCount: number;
      }>;
    }> = [];
    for (const company of settings.companies) {
      const programs = await listProgramsForCompany(company.id);
      const byPlan = new Map<string, typeof programs>();
      for (const p of programs) {
        const list = byPlan.get(p.plan) ?? [];
        list.push(p);
        byPlan.set(p.plan, list);
      }
      for (const [plan, list] of byPlan) {
        if (list.length <= 1) continue;
        const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const withUsage = await Promise.all(
          sorted.map(async (p) => {
            const usage = await getProgramUsageStats(p.id);
            return {
              id: p.id,
              name: p.name,
              createdAt: p.createdAt,
              assignedMatchCount: usage.assignedMatchCount,
              pendingMatchCount: usage.pendingMatchCount,
            };
          }),
        );
        duplicates.push({
          companyId: company.id,
          companyName: company.name,
          plan,
          programs: withUsage,
        });
      }
    }
    return jsonOk({ ok: true, scanAll: true, duplicateGroups: duplicates });
  }

  const cid = parsed.data.companyId?.trim() ?? "";
  if (!cid) return jsonError("companyId を指定してください（または scanAll: true）。", 400);

  const company = settings.companies.find((c) => c.id === cid);
  if (!company) return jsonError("登録されていない企業IDです。", 404);

  if (parsed.data.dryRun) {
    const { listProgramsForCompany, getProgramUsageStats } = await import(
      "@/lib/repositories/program-repository"
    );
    const programs = await listProgramsForCompany(cid);
    const withUsage = await Promise.all(
      programs.map(async (p) => {
        const usage = await getProgramUsageStats(p.id);
        return { ...p, ...usage };
      }),
    );
    const planCounts = new Map<string, number>();
    for (const p of programs) {
      planCounts.set(p.plan, (planCounts.get(p.plan) ?? 0) + 1);
    }
    return jsonOk({
      ok: true,
      dryRun: true,
      company: { id: company.id, name: company.name },
      programs: withUsage,
      hasDuplicatePlans: [...planCounts.values()].some((n) => n > 1),
    });
  }

  const result = await consolidateDuplicateProgramsForCompany(cid);
  if (!result.ok) {
    return jsonOk({
      ok: true,
      company: { id: company.id, name: company.name },
      consolidated: false,
      message: result.error,
    });
  }
  const { ok: _ok, ...rest } = result;
  void _ok;
  return jsonOk({
    ok: true,
    company: { id: company.id, name: company.name },
    consolidated: true,
    ...rest,
  });
}
