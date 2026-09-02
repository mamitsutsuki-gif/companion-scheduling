import {
  getPartnerInvoice,
  upsertPartnerInvoice,
  type PartnerInvoiceItem,
} from "@/lib/repositories/partner-invoice-repository";

export type InvoiceReconcileAfterScheduleReleaseResult = {
  /** 下書き／差し戻し請求書から当該行を自動削除した */
  draftLineRemoved: boolean;
  /** 提出済み・確定済み請求書に当該行が残っている（管理者の手動対応が必要） */
  lockedInvoiceNeedsReview: boolean;
};

function invoiceHasLine(
  items: PartnerInvoiceItem[],
  matchId: string,
  sessionNumber: number,
): boolean {
  return items.some((i) => i.matchId === matchId && i.sessionNumber === sessionNumber);
}

/**
 * 管理者による確定解除後、パートナー請求書の当該明細行を整合させる。
 * DRAFT / RETURNED は自動削除。SUBMITTED / CONFIRMED は触らず警告フラグのみ。
 */
export async function reconcilePartnerInvoiceAfterScheduleRelease(input: {
  partnerId: string;
  matchId: string;
  sessionNumber: number;
  previousStartAt: string;
}): Promise<InvoiceReconcileAfterScheduleReleaseResult> {
  const d = new Date(input.previousStartAt);
  if (Number.isNaN(d.getTime())) {
    return { draftLineRemoved: false, lockedInvoiceNeedsReview: false };
  }
  const year = d.getFullYear();
  const month = d.getMonth() + 1;

  const invoice = await getPartnerInvoice(input.partnerId, year, month);
  if (!invoice) {
    return { draftLineRemoved: false, lockedInvoiceNeedsReview: false };
  }
  if (!invoiceHasLine(invoice.items, input.matchId, input.sessionNumber)) {
    return { draftLineRemoved: false, lockedInvoiceNeedsReview: false };
  }

  if (invoice.status === "DRAFT" || invoice.status === "RETURNED") {
    const items = invoice.items.filter(
      (i) => !(i.matchId === input.matchId && i.sessionNumber === input.sessionNumber),
    );
    await upsertPartnerInvoice({
      partnerId: invoice.partnerId,
      year: invoice.year,
      month: invoice.month,
      partnerName: invoice.partnerName,
      address: invoice.address,
      phone: invoice.phone,
      bankAccount: invoice.bankAccount,
      items,
    });
    return { draftLineRemoved: true, lockedInvoiceNeedsReview: false };
  }

  return { draftLineRemoved: false, lockedInvoiceNeedsReview: true };
}
