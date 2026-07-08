import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getUserById, isDeletedUser } from "@/lib/repositories/user-repository";
import {
  isEligibleMonthlyPartner,
  resolveMonthlyProgramForClient,
} from "@/lib/repositories/monthly-session-repository";

export const dynamic = "force-dynamic";

/** ダッシュボードの入り口表示判定のみ返す（既存 Match には影響しない） */
export async function GET() {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const me = await getUserById(session.sub);
  if (!me || isDeletedUser(me)) return jsonError("ユーザーが見つかりません。", 404);

  if (me.role === "PARTNER") {
    const eligible = await isEligibleMonthlyPartner(me.id);
    return jsonOk({ show: eligible, role: "PARTNER" });
  }
  if (me.role === "CLIENT" || me.role === "CLIENT_ADMIN" || me.role === "CLIENT_HR") {
    const enrollment = await resolveMonthlyProgramForClient(me.id);
    return jsonOk({
      show: Boolean(enrollment),
      role: "CLIENT",
      enrollment,
    });
  }
  if (me.role === "ADMIN" || me.role === "ADMIN_ASSISTANT") {
    return jsonOk({ show: true, role: "ADMIN" });
  }
  return jsonOk({ show: false, role: me.role });
}
