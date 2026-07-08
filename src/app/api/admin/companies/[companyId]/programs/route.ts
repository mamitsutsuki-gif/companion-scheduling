import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { normalizeCompanyPlan, type CompanyPlan } from "@/lib/company-plan";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";
import {
  createProgram,
  ensureDefaultProgramForCompany,
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
  return jsonOk({ programs });
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

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  const program = await createProgram({
    companyId: cid,
    plan: normalizeCompanyPlan(parsed.data.plan) as CompanyPlan,
    name: parsed.data.name,
  });
  if (!program) return jsonError("プログラムの作成に失敗しました。", 500);

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
        // enrolled 未設定 → 企業の全プログラム（新含む）をセット
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
