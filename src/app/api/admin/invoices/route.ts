import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import {
  computeTransferDate,
  listPartnerInvoicesByMonth,
} from "@/lib/repositories/partner-invoice-repository";
import {
  getPartnerDisplayNames,
  listPartnersWithReportsForMonth,
  buildInvoiceCandidatesForPartner,
  enrichInvoiceItemsClientCompanyNames,
} from "@/lib/invoice-candidates";

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
  // 提出済 (DRAFT 含む) の請求書 + その月にレポートを提出したパートナーの集合 ⇒ 全員分（未提出含む）を可視化
  const [invoices, candidatePartnerIds] = await Promise.all([
    listPartnerInvoicesByMonth(year, month),
    listPartnersWithReportsForMonth(year, month),
  ]);
  const haveInvoice = new Set(invoices.map((i) => i.partnerId));
  const missingPartnerIds = candidatePartnerIds.filter((pid) => !haveInvoice.has(pid));

  const allIds = [...new Set([...invoices.map((i) => i.partnerId), ...missingPartnerIds])];
  const partnerNames = await getPartnerDisplayNames(allIds);

  // 未作成パートナーの候補プレビュー（明細のみ並列で構築）
  const missingPreviews = await Promise.all(
    missingPartnerIds.map(async (partnerId) => {
      const items = await buildInvoiceCandidatesForPartner(partnerId, year, month);
      return { partnerId, items: await enrichInvoiceItemsClientCompanyNames(items) };
    }),
  );

  const enrichedInvoices = await Promise.all(
    invoices.map(async (inv) => ({
      ...inv,
      partnerDisplayName: partnerNames.get(inv.partnerId) ?? inv.partnerName ?? "",
      items: await enrichInvoiceItemsClientCompanyNames(inv.items),
    })),
  );

  return jsonOk({
    invoices: enrichedInvoices,
    missing: missingPreviews.map((m) => ({
      partnerId: m.partnerId,
      partnerDisplayName: partnerNames.get(m.partnerId) ?? "",
      items: m.items,
      transferDate: computeTransferDate(year, month),
    })),
  });
}
