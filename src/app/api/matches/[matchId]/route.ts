import { readSession } from "@/lib/session";
import { getMatchIfAllowed } from "@/lib/match-access";
import { jsonError, jsonOk } from "@/lib/json";
import { isPartnerPendingMatch } from "@/lib/match-partner-pending";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ matchId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);

  const { matchId } = await context.params;
  const gate = await getMatchIfAllowed(matchId, { id: session.sub, role: session.role });
  if ("error" in gate) {
    const status = gate.error === "not_found" ? 404 : 403;
    return jsonError(status === 404 ? "見つかりません。" : "閲覧できません。", status);
  }

  const { match } = gate;
  const partnerPending = isPartnerPendingMatch(match);
  const sheetsOnly = gate.supervisorViewer === true;

  return jsonOk({
    matchId: match.id,
    partnerPending,
    /** 上司紐づけによるシート専用ビュー（チャット・日程・1on1 は非表示） */
    supervisorViewer: sheetsOnly,
    partner: {
      id: sheetsOnly ? "" : (match.partner?.id ?? ""),
      // 上司・人事のシート閲覧ではパートナー名を出さない
      displayName: sheetsOnly ? "" : (match.partner?.displayName ?? "未決定"),
    },
    client: {
      id: match.client.id,
      displayName: match.client.displayName,
    },
  });
}
