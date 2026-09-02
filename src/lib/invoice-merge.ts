import type { PartnerInvoiceItem } from "@/lib/repositories/partner-invoice-repository";

export function invoiceItemKey(item: { matchId: string; sessionNumber: number }): string {
  return `${item.matchId}|${item.sessionNumber}`;
}

/**
 * 既存の請求明細と候補をマージする。
 * pruneStale=true のとき、候補に無い行（運営リスケ後の確定解除など）は落とす。
 */
export function mergeInvoiceItems(
  existing: PartnerInvoiceItem[],
  candidates: PartnerInvoiceItem[],
  options?: { pruneStale?: boolean },
): PartnerInvoiceItem[] {
  const key = invoiceItemKey;
  const candByKey = new Map(candidates.map((c) => [key(c), c]));
  const candKeys = new Set(candidates.map(key));
  const base = options?.pruneStale ? existing.filter((ex) => candKeys.has(key(ex))) : existing;
  const seen = new Set(base.map(key));
  const out: PartnerInvoiceItem[] = base.map((ex) => {
    const c = candByKey.get(key(ex));
    const company =
      (ex.clientCompanyName ?? "").trim() || (c?.clientCompanyName ?? "").trim() || "";
    return { ...ex, clientCompanyName: company };
  });
  for (const c of candidates) {
    if (!seen.has(key(c))) {
      out.push({ ...c, clientCompanyName: c.clientCompanyName ?? "" });
      seen.add(key(c));
    }
  }
  return out;
}
