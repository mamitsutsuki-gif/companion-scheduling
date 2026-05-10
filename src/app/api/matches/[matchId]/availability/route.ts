import { getMatchIfAllowed } from "@/lib/match-access";
import { jsonError, jsonOk } from "@/lib/json";
import { getMatchById } from "@/lib/repositories/match-repository";
import { getUserById } from "@/lib/repositories/user-repository";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";
import { labelsForSlotIds } from "@/lib/availability";
import { readSession } from "@/lib/session";

type RouteContext = { params: Promise<{ matchId: string }> };
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await context.params;
  const gate = await getMatchIfAllowed(matchId, { id: session.sub, role: session.role });
  if ("error" in gate) return jsonError("閲覧できません。", gate.error === "not_found" ? 404 : 403);

  const match = await getMatchById(matchId);
  if (!match) return jsonError("見つかりません。", 404);

  const [settings, partner, client] = await Promise.all([
    getAppSettingsRow(),
    getUserById(match.partnerId),
    getUserById(match.clientId),
  ]);
  const options = settings.availabilitySlotOptions;

  return jsonOk({
    partner: {
      displayName: partner?.displayName ?? "—",
      slotIds: partner?.availabilitySlotIds ?? [],
      labels: labelsForSlotIds(partner?.availabilitySlotIds ?? [], options),
    },
    client: {
      displayName: client?.displayName ?? "—",
      slotIds: client?.availabilitySlotIds ?? [],
      labels: labelsForSlotIds(client?.availabilitySlotIds ?? [], options),
    },
  });
}
