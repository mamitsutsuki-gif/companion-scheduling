import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { normalizeCompanyPlan, type CompanyPlan } from "@/lib/company-plan";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";
import {
  consolidateDuplicateProgramsForCompany,
  createProgram,
  ensureDefaultProgramForCompany,
  getProgramUsageStats,
  listProgramsForCompany,
} from "@/lib/repositories/program-repository";
import {
  listClientsInCompany,
  setUserEnrolledProgramIds,
  getUserById,
} from "@/lib/repositories/user-repository";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ companyId: string }> };

const postSchema = z.object({
  plan: z.enum([
    "workplace_activation",
    "individual_companion",
    "coaching_management_training",
    "monthly_session",
  ]),
  name: z.string().trim().min(1).max(80).optional(),
});

const actionSchema = z.object({
  action: z.literal("consolidate_duplicates"),
});

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "ADMIN_ASSISTANT")) {
    return jsonError("権限がありません。", 403);
  }
  const { companyId } = await ctx.params;
  const cid = (companyId ?? "").trim();
  if (!cid) return jsonError("企業IDが指定されていません。", 400);

  await ensureDefaultProgramForCompany(cid);
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
  const hasDuplicatePlans = [...planCounts.values()].some((n) => n > 1);
  return jsonOk({ programs: withUsage, hasDuplicatePlans });
}

export async function POST(request: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session || session.role !== "ADMIN") return jsonError("権限がありません。", 403);
  const { companyId } = await ctx.params;
  const cid = (companyId ?? "").trim();
  if (!cid) return jsonError("企業IDが指定されていません。", 400);

  const settings = await getAppSettingsRow();
  if (!settings.companies.some((c) => c.id === cid)) {
    return jsonError("登録されていない企業IDです。", 400);
  }

  const body = await request.json().catch(() => null);
  const asAction = actionSchema.safeParse(body);
  if (asAction.success) {
    const result = await consolidateDuplicateProgramsForCompany(cid);
    if (!result.ok) return jsonError(result.error, 400);
    const { ok: _ok, ...rest } = result;
    void _ok;
    return jsonOk({ ok: true, ...rest });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return jsonError("入力内容が不正です。");

  const created = await createProgram({
    companyId: cid,
    plan: normalizeCompanyPlan(parsed.data.plan) as CompanyPlan,
    name: parsed.data.name,
  });
  if (!created.ok) return jsonError(created.error, 409);
  const program = created.program;

  // 既存クライアントに新プログラムを参加対象として追加（特に monthly_session）
  try {
    const clients = await listClientsInCompany(cid);
    await Promise.all(
      clients.map(async (c) => {
        const u = await getUserById(c.id);
        const current = Array.isArray((u as { enrolledProgramIds?: string[] } | null)?.enrolledProgramIds)
          ? ((u as { enrolledProgramIds?: string[] }).enrolledProgramIds ?? [])
          : [];
        if (current.includes(program.id)) return;
        if (current.length === 0) {
          const all = await listProgramsForCompany(cid);
          await setUserEnrolledProgramIds(
            c.id,
            all.map((p) => p.id),
          );
          return;
        }
        await setUserEnrolledProgramIds(c.id, [...current, program.id]);
      }),
    );
  } catch {
    // enroll 失敗してもプログラム自体は作成済みとする
  }

  return jsonOk({ ok: true, program });
}
