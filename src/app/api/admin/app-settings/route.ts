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

const patchSchema = z.object({
  slotDurationMinutes: z.number().int().min(15).max(240),
  totalSessions: z.number().int().min(1).max(24),
  timezone: z.string().min(1).max(80),
  availabilitySlotOptions: z.array(availabilityOptionSchema).max(32).optional(),
  partnerExtraQuestionsByRound: z
    .record(z.string(), z.array(z.string().min(1).max(500)).max(8))
    .optional(),
});

export async function GET() {
  const session = await readSession();
  if (!session || session.role !== "ADMIN") return jsonError("権限がありません。", 403);

  const row = await getAppSettingsRow();
  if (!row) return jsonError("設定が見つかりません。", 500);

  return jsonOk({ settings: row });
}

export async function PATCH(request: Request) {
  const session = await readSession();
  if (!session || session.role !== "ADMIN") return jsonError("権限がありません。", 403);

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("枠時間(15〜240分)、回数(1〜24回)、タイムゾーン、対応可能時間の選択肢を確認してください。");

  const row = await upsertAppSettingsRow({
    slotDurationMinutes: parsed.data.slotDurationMinutes,
    totalSessions: parsed.data.totalSessions,
    timezone: parsed.data.timezone,
    availabilitySlotOptions: parsed.data.availabilitySlotOptions,
    partnerExtraQuestionsByRound: parsed.data.partnerExtraQuestionsByRound,
  });

  return jsonOk({ ok: true, settings: row });
}
