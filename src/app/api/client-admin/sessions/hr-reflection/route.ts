import {
  getRoleplaySessionForNumber,
  validateRoleplayClientSaveFields,
} from "@/lib/coaching-roleplay";
import { getEffectiveAppSettingsForMatch } from "@/lib/effective-app-settings";
import { jsonError, jsonOk } from "@/lib/json";
import { getRoleplayStore } from "@/lib/repositories/coaching-repository";
import { getMatchById } from "@/lib/repositories/match-repository";
import { getSessionHrPublish } from "@/lib/repositories/session-hr-publish-repository";
import { getUserById, isDeletedUser } from "@/lib/repositories/user-repository";
import { readSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * 企業人事向け：公開済みクライアント振り返りのホワイトリスト読取専用 API。
 * 既存の roleplay GET/PUT は緩めない。公開ゲート＋同一企業＋コーチング研修のみ。
 *
 * 返却フィールドは固定:
 * - good（良かったところ）
 * - improve（もっと良くなるところ）
 * - satisfactionScore（満足度）
 * - satisfactionReason（理由）
 */
export async function GET(request: Request) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);

  const me = await getUserById(session.sub);
  if (!me || isDeletedUser(me)) return jsonError("ユーザーが見つかりません。", 404);

  if (
    me.role !== "CLIENT_HR" &&
    me.role !== "CLIENT_ADMIN" &&
    me.role !== "ADMIN" &&
    me.role !== "ADMIN_ASSISTANT"
  ) {
    return jsonError("権限がありません。", 403);
  }

  const url = new URL(request.url);
  const matchId = (url.searchParams.get("matchId") ?? "").trim();
  const sessionNumberRaw = url.searchParams.get("sessionNumber") ?? "";
  const sessionNumber = Number(sessionNumberRaw);
  if (!matchId || !Number.isInteger(sessionNumber) || sessionNumber <= 0) {
    return jsonError("matchId と sessionNumber を指定してください。", 400);
  }

  const companyId = ((me as { companyId?: string | null }).companyId ?? "").trim();
  if (me.role === "CLIENT_HR" || me.role === "CLIENT_ADMIN") {
    if (!companyId) return jsonError("所属企業が設定されていません。", 403);
  }

  const match = await getMatchById(matchId);
  if (!match) return jsonError("マッチが見つかりません。", 404);

  const client = await getUserById(match.clientId);
  if (!client || isDeletedUser(client)) return jsonError("クライアントが見つかりません。", 404);
  const clientCompanyId = ((client as { companyId?: string | null }).companyId ?? "").trim();

  if (me.role === "CLIENT_HR" || me.role === "CLIENT_ADMIN") {
    if (!clientCompanyId || clientCompanyId !== companyId) {
      return jsonError("権限がありません。", 403);
    }
  }

  const settings = await getEffectiveAppSettingsForMatch(matchId);
  if (settings.companyPlan !== "coaching_management_training") {
    return jsonError("このプランでは振り返り公開を利用できません。", 403);
  }

  const published = await getSessionHrPublish(matchId, sessionNumber);
  if (!published) {
    return jsonError("この振り返りはまだ人事向けに公開されていません。", 404);
  }

  const store = await getRoleplayStore(matchId);
  const roleplaySession = getRoleplaySessionForNumber(store, sessionNumber);
  if (
    !roleplaySession.clientSubmittedAt ||
    validateRoleplayClientSaveFields(roleplaySession) !== null
  ) {
    return jsonError("公開可能なクライアント振り返りがありません。", 409);
  }

  return jsonOk({
    matchId,
    sessionNumber,
    publishedAt: published.publishedAt,
    clientDisplayName: client.displayName ?? "クライアント",
    reflection: {
      good: roleplaySession.clientReflection.good,
      improve: roleplaySession.clientReflection.improve,
      satisfactionScore: roleplaySession.sessionFeedback.satisfactionScore,
      satisfactionReason: roleplaySession.sessionFeedback.satisfactionReason,
    },
  });
}
