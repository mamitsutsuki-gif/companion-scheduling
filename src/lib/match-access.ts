import type { Role } from "@prisma/client";
import { getMatchById } from "@/lib/repositories/match-repository";
import { getProgramById } from "@/lib/repositories/program-repository";
import { isIndividualCompanionSupervisorMatch } from "@/lib/individual-companion-match";
import { isPairedIndividualCompanionSupervisor } from "@/lib/skill-check-access";
import { isClientAdminLike } from "@/lib/role-aliases";
import { isIndividualCompanionPlan } from "@/lib/company-plan";
import { resolveActorRole } from "@/lib/actor-role";
import { getUserById } from "@/lib/repositories/user-repository";

export type MatchAccessOk = {
  match: NonNullable<Awaited<ReturnType<typeof getMatchById>>>;
  /**
   * 上司紐づけによるシート専用アクセス（partnerId ではない）。
   * チャット・日程・1on1 等は不可。レガシー上司マッチ（partnerId = 上司）では false。
   */
  supervisorViewer?: boolean;
};

export async function getMatchIfAllowed(
  matchId: string,
  rawActor: { id: string; role: Role },
): Promise<{ error: "not_found" | "forbidden" } | MatchAccessOk> {
  const match = await getMatchById(matchId);

  if (!match) return { error: "not_found" as const };

  const actor = { id: rawActor.id, role: await resolveActorRole(rawActor) };

  // ADMIN_ASSISTANT は閲覧と「チャットへのコメント」だけ ADMIN と同等。
  // 個別エンドポイントの write 操作は requireAdminWriter 側で別途弾く。
  if (actor.role === "ADMIN" || actor.role === "ADMIN_ASSISTANT") return { match };

  if (actor.role === "PARTNER" && match.partnerId === actor.id) return { match };

  // 個別伴走のみ: CLIENT_ADMIN が上司として partnerId に入っている場合（レガシー）
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

  // 上司紐づけ: 部下の個別伴走パートナールームへシート専用アクセス
  if (isClientAdminLike(actor.role) && match.clientId !== actor.id) {
    const paired = await isPairedIndividualCompanionSupervisor(actor.id, match.clientId);
    if (paired) {
      const program = match.programId ? await getProgramById(match.programId) : null;
      if (!program || isIndividualCompanionPlan(program.plan)) {
        return { match, supervisorViewer: true };
      }
    }
  }

  // クライアント人事: 同企業の個別伴走パートナールームをシート専用で閲覧可（編集は各 API で拒否）
  if (actor.role === "CLIENT_HR" && match.clientId !== actor.id) {
    const [actorUser, clientUser, partnerUser] = await Promise.all([
      getUserById(actor.id),
      getUserById(match.clientId),
      getUserById(match.partnerId),
    ]);
    const actorCompanyId = ((actorUser as { companyId?: string | null } | null)?.companyId ?? "").trim();
    const clientCompanyId = ((clientUser as { companyId?: string | null } | null)?.companyId ?? "").trim();
    if (actorCompanyId && clientCompanyId && actorCompanyId === clientCompanyId) {
      const program = match.programId ? await getProgramById(match.programId) : null;
      const isIc =
        (program && isIndividualCompanionPlan(program.plan)) ||
        (!program && partnerUser?.role === "PARTNER");
      if (isIc) {
        return { match, supervisorViewer: true };
      }
    }
  }

  return { error: "forbidden" as const };
}

/** シート専用上司ビューではルーム機能（チャット・日程等）を拒否する */
export function isSupervisorSheetsOnly(
  gate: MatchAccessOk | { error: string },
): boolean {
  return !("error" in gate) && gate.supervisorViewer === true;
}
