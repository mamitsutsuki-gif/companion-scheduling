import { z } from "zod";
import { shouldUseClientFta } from "@/lib/company-plan";
import { getEffectiveAppSettingsForUser } from "@/lib/effective-app-settings";
import { jsonError, jsonOk } from "@/lib/json";
import { normalizeFtaChart } from "@/lib/fta";
import { getFtaByUserId, upsertFtaByUserId } from "@/lib/repositories/fta-repository";
import { getUserById } from "@/lib/repositories/user-repository";
import { readSession } from "@/lib/session";

const putSchema = z.object({
  chart: z.unknown(),
});
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const chart = await getFtaByUserId(session.sub);
  return jsonOk({ chart });
}

export async function PUT(request: Request) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const me = await getUserById(session.sub);
  if (!me) return jsonError("ユーザーが見つかりません。", 404);

  // 受講者のみプラン機能フラグを確認（FTA が無いプランでは保存不可）
  if (me.role === "CLIENT") {
    const effective = await getEffectiveAppSettingsForUser(session.sub);
    if (!shouldUseClientFta(effective.companyPlan, effective.planFeatureOverrides)) {
      return jsonError("このプランでは自分FTAを編集できません。", 403);
    }
  }

  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");
  const chart = normalizeFtaChart(parsed.data.chart);
  const saved = await upsertFtaByUserId(session.sub, chart);
  return jsonOk({ ok: true, chart: saved });
}
