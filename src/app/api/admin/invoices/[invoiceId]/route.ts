import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getPartnerInvoiceById } from "@/lib/repositories/partner-invoice-repository";
import { getPartnerDisplayNames } from "@/lib/invoice-candidates";

type RouteContext = { params: Promise<{ invoiceId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "ADMIN" && session.role !== "ADMIN_ASSISTANT")
    return jsonError("管理者のみ閲覧できます。", 403);

  const { invoiceId } = await context.params;
  const inv = await getPartnerInvoiceById(invoiceId);
  if (!inv) return jsonError("請求書が見つかりません。", 404);
  const names = await getPartnerDisplayNames([inv.partnerId]);
  return jsonOk({
    invoice: { ...inv, partnerDisplayName: names.get(inv.partnerId) ?? inv.partnerName },
  });
}
