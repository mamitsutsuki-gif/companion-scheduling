import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getUserById, isDeletedUser } from "@/lib/repositories/user-repository";
import {
  findPartnerRoomMatchForClient,
  listSupervisorLinksForSupervisor,
} from "@/lib/repositories/supervisor-links-repository";

export const dynamic = "force-dynamic";

/**
 * 上司向け: 紐づけ済み部下の伴走シート（パートナールーム）一覧。
 */
export async function GET() {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);

  const me = await getUserById(session.sub);
  if (!me || isDeletedUser(me)) return jsonError("ユーザーが見つかりません。", 404);
  if (me.role !== "CLIENT_ADMIN" && me.role !== "CLIENT_HR") {
    return jsonError("権限がありません。", 403);
  }

  const links = await listSupervisorLinksForSupervisor(session.sub);
  const rows = await Promise.all(
    links.map(async (link) => {
      const client = await getUserById(link.clientId);
      const room = await findPartnerRoomMatchForClient(link.clientId);
      return {
        linkId: link.id,
        clientId: link.clientId,
        clientName: client?.displayName ?? "不明",
        matchId: room?.id ?? null,
        partnerName: room?.partnerName ?? null,
        programId: room?.programId ?? link.programId,
      };
    }),
  );

  return jsonOk({
    clients: rows,
    message:
      rows.length === 0
        ? "紐づけられた部下がいません。管理者に上司割当を依頼してください。"
        : null,
  });
}
