import type { Role } from "@prisma/client";
import { getMatchById } from "@/lib/repositories/match-repository";
import { getProgramById } from "@/lib/repositories/program-repository";
import { isIndividualCompanionSupervisorMatch } from "@/lib/individual-companion-match";

export async function getMatchIfAllowed(matchId: string, actor: { id: string; role: Role }) {
  const match = await getMatchById(matchId);

  if (!match) return { error: "not_found" as const };

  // ADMIN_ASSISTANT は閲覧と「チャットへのコメント」だけ ADMIN と同等。
  // 個別エンドポイントの write 操作は requireAdminWriter 側で別途弾く。
  if (actor.role === "ADMIN" || actor.role === "ADMIN_ASSISTANT") return { match };

  if (actor.role === "PARTNER" && match.partnerId === actor.id) return { match };

  // 個別伴走のみ: CLIENT_ADMIN が上司として partnerId に入っている場合
  // programId 欠落のレガシーも許可（CLIENT_ADMIN を partner に置けるのは IC のみ）
  if (actor.role === "CLIENT_ADMIN" && match.partnerId === actor.id) {
    const program = match.programId ? await getProgramById(match.programId) : null;
    if (
      isIndividualCompanionSupervisorMatch({
        actorRole: actor.role,
        actorId: actor.id,
        partnerId: match.partnerId,
        programPlan: program?.plan ?? null,
      })
    ) {
      return { match };
    }
    return { error: "forbidden" as const };
  }

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
