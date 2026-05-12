import type { Role } from "@prisma/client";
import { getMatchById } from "@/lib/repositories/match-repository";

export async function getMatchIfAllowed(matchId: string, actor: { id: string; role: Role }) {
  const match = await getMatchById(matchId);

  if (!match) return { error: "not_found" as const };

  // ADMIN_ASSISTANT は閲覧と「チャットへのコメント」だけ ADMIN と同等。
  // 個別エンドポイントの write 操作は requireAdminWriter 側で別途弾く。
  if (actor.role === "ADMIN" || actor.role === "ADMIN_ASSISTANT") return { match };

  if (actor.role === "PARTNER" && match.partnerId === actor.id) return { match };
  if (
    (actor.role === "CLIENT" ||
      actor.role === "CLIENT_ADMIN" ||
      actor.role === "CLIENT_HR") &&
    match.clientId === actor.id
  ) {
    return { match };
  }

  return { error: "forbidden" as const };
}
