import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getUserById, isDeletedUser, listClientsInCompany } from "@/lib/repositories/user-repository";
import {
  findPartnerRoomMatchForClient,
  listSupervisorLinksForSupervisor,
} from "@/lib/repositories/supervisor-links-repository";
import { getSkillCheckProfile } from "@/lib/repositories/skill-check-repository";
import { isPairedIndividualCompanionSupervisor } from "@/lib/skill-check-access";

export const dynamic = "force-dynamic";

/**
 * 上司向け: 紐づけ済み部下の伴走シート（パートナールーム）とスキルチェックの一覧。
 * 上司の入り口はこの 1 つに集約する（スキルチェックも同じ画面から入力する）。
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
  const clientIds = new Map<string, string | null>();
  for (const link of links) clientIds.set(link.clientId, link.id);

  // 紐づけ未登録でも、レガシーの上司マッチでペアになっている部下は同じ一覧に出す。
  const companyId = ((me as { companyId?: string | null }).companyId ?? "").trim();
  if (companyId) {
    const members = (await listClientsInCompany(companyId)).filter((u) => u.role === "CLIENT");
    const pending = members.filter((u) => !clientIds.has(u.id));
    const paired = await Promise.all(
      pending.map((u) => isPairedIndividualCompanionSupervisor(session.sub, u.id)),
    );
    pending.forEach((u, i) => {
      if (paired[i]) clientIds.set(u.id, null);
    });
  }

  const rows = await Promise.all(
    [...clientIds.entries()].map(async ([clientId, linkId]) => {
      const [client, room, profile] = await Promise.all([
        getUserById(clientId),
        findPartnerRoomMatchForClient(clientId),
        getSkillCheckProfile(clientId),
      ]);
      return {
        linkId,
        clientId,
        clientName: client?.displayName ?? "不明",
        matchId: room?.id ?? null,
        partnerName: room?.partnerName ?? null,
        programId: room?.programId ?? null,
        managerBaselineFilled: profile
          ? Object.values(profile.baseline).filter((v) => v.managerScore !== null).length
          : 0,
        managerCurrentFilled: profile
          ? Object.values(profile.current).filter((v) => v.managerScore !== null).length
          : 0,
      };
    }),
  );
  rows.sort((a, b) => a.clientName.localeCompare(b.clientName, "ja"));

  return jsonOk({
    clients: rows,
    message:
      rows.length === 0
        ? "紐づけられた部下がいません。管理者に上司割当を依頼してください。"
        : null,
  });
}
