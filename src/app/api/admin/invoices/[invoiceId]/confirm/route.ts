import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import {
  adminConfirmPartnerInvoice,
  getPartnerInvoiceById,
} from "@/lib/repositories/partner-invoice-repository";
import { appendMemberNotification } from "@/lib/repositories/member-notification-repository";

type RouteContext = { params: Promise<{ invoiceId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "ADMIN") return jsonError("管理者のみ操作できます。", 403);

  const { invoiceId } = await context.params;
  const before = await getPartnerInvoiceById(invoiceId);
  if (!before) return jsonError("請求書が見つかりません。", 404);

  try {
    const saved = await adminConfirmPartnerInvoice(invoiceId);
    await appendMemberNotification({
      recipientUserId: saved.partnerId,
      type: "INVOICE_CONFIRMED",
      summary: `${saved.year}年${saved.month}月 の請求書が確定しました。お振込をお待ちください。`,
      actorUserId: session.sub,
      actorRole: "ADMIN",
      link: `/partner/invoices?year=${saved.year}&month=${saved.month}`,
    });
    return jsonOk({ invoice: saved });
  } catch (err) {
    const e = err as Error & { http?: number };
    return jsonError(e.message ?? "確定に失敗しました。", e.http ?? 500);
  }
}
