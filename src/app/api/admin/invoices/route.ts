import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { listPartnerInvoicesByMonth } from "@/lib/repositories/partner-invoice-repository";
import { getPartnerDisplayNames } from "@/lib/invoice-candidates";

export async function GET(request: Request) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "ADMIN") return jsonError("管理者のみ閲覧できます。", 403);

  const url = new URL(request.url);
  const yearStr = url.searchParams.get("year");
  const monthStr = url.searchParams.get("month");
  if (!yearStr || !monthStr) {
    return jsonError("対象月（year, month）を指定してください。");
  }
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isInteger(year) || !Number.isInteger(month) || year < 2024 || year > 2099 || month < 1 || month > 12) {
    return jsonError("対象月の指定が不正です。");
  }
  const invoices = await listPartnerInvoicesByMonth(year, month);
  const partnerNames = await getPartnerDisplayNames(invoices.map((i) => i.partnerId));

  return jsonOk({
    invoices: invoices.map((inv) => ({
      ...inv,
      partnerDisplayName: partnerNames.get(inv.partnerId) ?? inv.partnerName ?? "",
    })),
  });
}
