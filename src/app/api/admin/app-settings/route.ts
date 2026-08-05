import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getAppSettingsRow, upsertAppSettingsRow } from "@/lib/repositories/app-settings-repository";
import {
  createProgram,
  listProgramsForCompany,
} from "@/lib/repositories/program-repository";
import {
  getUserById,
  listClientsInCompany,
  setUserEnrolledProgramIds,
} from "@/lib/repositories/user-repository";

const companyPlanSchema = z.enum([
  "workplace_activation",
  "individual_companion",
  "individual_companion_exec",
  "individual_companion_pro",
  "coaching_management_training",
  "monthly_session",
]);

const availabilityOptionSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9_-]+$/, "IDは半角英数・ハイフン・アンダースコアのみ"),
  label: z.string().min(1).max(120),
});

const companySchema = z.object({
  id: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-zA-Z0-9_-]+$/, "企業IDは半角英数・ハイフン・アンダースコアのみ"),
  name: z.string().min(1).max(80),
  plan: companyPlanSchema.optional(),
});

const patchSchema = z
  .object({
    slotDurationMinutes: z.number().int().min(15).max(240),
    totalSessions: z.number().int().min(1).max(24),
    timezone: z.string().min(1).max(80),
    availabilitySlotOptions: z.array(availabilityOptionSchema).max(32).optional(),
    partnerExtraQuestionsByRound: z
      .record(z.string(), z.array(z.string().min(1).max(500)).max(8))
      .optional(),
    clientExtraQuestionsByRound: z
      .record(z.string(), z.array(z.string().min(1).max(500)).max(8))
      .optional(),
    sessionGuidelinesByRound: z
      .record(
        z.string(),
        z.object({
          client: z.string().max(4000).optional(),
          partner: z.string().max(4000).optional(),
        }),
      )
      .optional(),
    slotEarliestHour: z.number().int().min(0).max(24).optional(),
    slotLatestHour: z.number().int().min(0).max(24).optional(),
    allowWeekends: z.boolean().optional(),
    companies: z.array(companySchema).max(64).optional(),
  })
  .refine(
    (v) =>
      v.slotEarliestHour === undefined ||
      v.slotLatestHour === undefined ||
      v.slotEarliestHour < v.slotLatestHour,
    "開始時刻は終了時刻より前にしてください。",
  );

export async function GET() {
  const session = await readSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "ADMIN_ASSISTANT"))
    return jsonError("権限がありません。", 403);

  const row = await getAppSettingsRow();
  if (!row) return jsonError("設定が見つかりません。", 500);

  return jsonOk({ settings: row });
}

export async function PATCH(request: Request) {
  const session = await readSession();
  if (!session || session.role !== "ADMIN") return jsonError("権限がありません。", 403);

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("枠時間(15〜240分)、回数(1〜24回)、タイムゾーン、対応可能時間の選択肢を確認してください。");

  const normalizedGuidelines = parsed.data.sessionGuidelinesByRound
    ? Object.fromEntries(
        Object.entries(parsed.data.sessionGuidelinesByRound).map(([k, v]) => [
          k,
          { client: v.client ?? "", partner: v.partner ?? "" },
        ]),
      )
    : undefined;

  // 重複 id を弾く（zod では unique 制約まで書けないため最終チェックをここで）
  if (parsed.data.companies) {
    const ids = parsed.data.companies.map((c) => c.id);
    if (new Set(ids).size !== ids.length) {
      return jsonError("企業IDが重複しています。重複しない英数IDを入力してください。", 400);
    }
  }

  const row = await upsertAppSettingsRow({
    slotDurationMinutes: parsed.data.slotDurationMinutes,
    totalSessions: parsed.data.totalSessions,
    timezone: parsed.data.timezone,
    availabilitySlotOptions: parsed.data.availabilitySlotOptions,
    partnerExtraQuestionsByRound: parsed.data.partnerExtraQuestionsByRound,
    clientExtraQuestionsByRound: parsed.data.clientExtraQuestionsByRound,
    sessionGuidelinesByRound: normalizedGuidelines,
    slotEarliestHour: parsed.data.slotEarliestHour,
    slotLatestHour: parsed.data.slotLatestHour,
    allowWeekends: parsed.data.allowWeekends,
    companies: parsed.data.companies,
  });

  // アプリ設定で月額プランを選んだ企業に、月額プログラムが無ければ作成する
  // （既存プログラムがある企業では ensureDefault が何もしないため）
  if (parsed.data.companies) {
    for (const company of parsed.data.companies) {
      if (company.plan !== "monthly_session") continue;
      try {
        const programs = await listProgramsForCompany(company.id);
        let monthly = programs.find((p) => p.plan === "monthly_session") ?? null;
        if (!monthly) {
          const created = await createProgram({
            companyId: company.id,
            plan: "monthly_session",
          });
          monthly = created.ok ? created.program : null;
        }
        if (!monthly) continue;
        const clients = await listClientsInCompany(company.id);
        await Promise.all(
          clients.map(async (c) => {
            const u = await getUserById(c.id);
            const current = Array.isArray(
              (u as { enrolledProgramIds?: string[] } | null)?.enrolledProgramIds,
            )
              ? ((u as { enrolledProgramIds?: string[] }).enrolledProgramIds ?? [])
              : [];
            if (current.includes(monthly!.id)) return;
            if (current.length === 0) {
              const all = await listProgramsForCompany(company.id);
              await setUserEnrolledProgramIds(
                c.id,
                all.map((p) => p.id),
              );
              return;
            }
            await setUserEnrolledProgramIds(c.id, [...current, monthly!.id]);
          }),
        );
      } catch {
        // プログラム作成・参加登録の失敗は設定保存自体は成功とする
      }
    }
  }

  return jsonOk({ ok: true, settings: row });
}
