import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getAppSettingsRow, upsertAppSettingsRow } from "@/lib/repositories/app-settings-repository";

const patchSchema = z.object({
  slotDurationMinutes: z.number().int().min(15).max(240),
  totalSessions: z.number().int().min(1).max(24),
  timezone: z.string().min(1).max(80),
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
  if (!parsed.success) return jsonError("枠時間(15〜240分)、回数(1〜24回)、タイムゾーンを正しく入力してください。");

  const row = await upsertAppSettingsRow({
    slotDurationMinutes: parsed.data.slotDurationMinutes,
    totalSessions: parsed.data.totalSessions,
    timezone: parsed.data.timezone,
  });

  return jsonOk({ ok: true, settings: row });
}
