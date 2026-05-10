import type { Role } from "@prisma/client";
import { getMatchById } from "@/lib/repositories/match-repository";

export async function getMatchIfAllowed(matchId: string, actor: { id: string; role: Role }) {
  const match = await getMatchById(matchId);

  if (!match) return { error: "not_found" as const };

  if (actor.role === "ADMIN") return { match };

  if (actor.role === "PARTNER" && match.partnerId === actor.id) return { match };
  if (
    (actor.role === "CLIENT" || actor.role === "CLIENT_ADMIN") &&
    match.clientId === actor.id
  ) {
    return { match };
  }

  return { error: "forbidden" as const };
}
