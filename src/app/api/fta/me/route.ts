import { z } from "zod";
import { shouldUseClientFta } from "@/lib/company-plan";
import {
  getEffectiveAppSettingsForMatch,
  getEffectiveAppSettingsForUser,
} from "@/lib/effective-app-settings";
import { jsonError, jsonOk } from "@/lib/json";
import { normalizeFtaChart } from "@/lib/fta";
import { getMatchIfAllowed } from "@/lib/match-access";
import { listMatchIdsForClient } from "@/lib/repositories/match-repository";
import { getFtaByUserId, upsertFtaByUserId } from "@/lib/repositories/fta-repository";
import { getUserById } from "@/lib/repositories/user-repository";
import { readSession } from "@/lib/session";

const putSchema = z.object({
  chart: z.unknown(),
  matchId: z.string().min(1).max(80).optional(),
});
export const dynamic = "force-dynamic";

/** マッチ文脈または参加中のマッチのいずれかで FTA が有効なら保存可 */
async function clientMayEditFta(
  userId: string,
  role: string,
  matchId?: string | null,
): Promise<boolean> {
  if (matchId) {
    const gate = await getMatchIfAllowed(matchId, { id: userId, role: role as never });
    if (!("error" in gate)) {
      const effective = await getEffectiveAppSettingsForMatch(matchId);
      if (shouldUseClientFta(effective.companyPlan, effective.planFeatureOverrides)) {
        return true;
      }
    }
  }

  const userEffective = await getEffectiveAppSettingsForUser(userId);
  if (shouldUseClientFta(userEffective.companyPlan, userEffective.planFeatureOverrides)) {
    return true;
  }

  const matchIds = await listMatchIdsForClient(userId);
  for (const mid of matchIds.slice(0, 20)) {
    const effective = await getEffectiveAppSettingsForMatch(mid);
    if (shouldUseClientFta(effective.companyPlan, effective.planFeatureOverrides)) {
      return true;
    }
  }
  return false;
}

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

  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  // 受講者のみプラン機能フラグを確認（マッチのプランを優先。企業代表プランだけで弾かない）
  if (me.role === "CLIENT") {
    const allowed = await clientMayEditFta(session.sub, me.role, parsed.data.matchId ?? null);
    if (!allowed) {
      return jsonError("このプランでは自分FTAを編集できません。", 403);
    }
  }

  const chart = normalizeFtaChart(parsed.data.chart);
  const saved = await upsertFtaByUserId(session.sub, chart);
  return jsonOk({ ok: true, chart: saved });
}
