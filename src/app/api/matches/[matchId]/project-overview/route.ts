import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getMatchIfAllowed } from "@/lib/match-access";
import { getEffectiveAppSettingsForMatch } from "@/lib/effective-app-settings";
import type { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ matchId: string }> };

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const allowed = await getMatchIfAllowed(matchId, {
    id: session.sub,
    role: session.role as Role,
  });
  if ("error" in allowed) return jsonError("権限がありません。", 403);

  const eff = await getEffectiveAppSettingsForMatch(matchId);
  const role = session.role;

  if (role === "PARTNER") {
    return jsonOk({ viewer: "partner" as const, overview: eff.partnerProjectOverview });
  }
  if (role === "CLIENT" || role === "CLIENT_ADMIN") {
    return jsonOk({ viewer: "client" as const, overview: eff.clientProjectOverview });
  }
  if (role === "ADMIN" || role === "ADMIN_ASSISTANT") {
    return jsonOk({
      viewer: "admin" as const,
      partnerOverview: eff.partnerProjectOverview,
      clientOverview: eff.clientProjectOverview,
    });
  }
  return jsonError("権限がありません。", 403);
}
