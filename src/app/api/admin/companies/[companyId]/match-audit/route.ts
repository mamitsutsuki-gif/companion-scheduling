import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { auditCompanyMatches } from "@/lib/admin-company-match-audit";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ companyId: string }> };

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "ADMIN_ASSISTANT")) {
    return jsonError("権限がありません。", 403);
  }
  const { companyId } = await ctx.params;
  const cid = (companyId ?? "").trim();
  if (!cid) return jsonError("企業IDが指定されていません。", 400);
  const audit = await auditCompanyMatches(cid);
  return jsonOk(audit);
}
