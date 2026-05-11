import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getAppSettingsRow, upsertAppSettingsRow } from "@/lib/repositories/app-settings-repository";

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
    sessionGuidelinesByRound: normalizedGuidelines,
    slotEarliestHour: parsed.data.slotEarliestHour,
    slotLatestHour: parsed.data.slotLatestHour,
    allowWeekends: parsed.data.allowWeekends,
    companies: parsed.data.companies,
  });

  return jsonOk({ ok: true, settings: row });
}
