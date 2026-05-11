import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import {
  adminReturnPartnerInvoice,
  getPartnerInvoiceById,
} from "@/lib/repositories/partner-invoice-repository";
import { appendMemberNotification } from "@/lib/repositories/member-notification-repository";

const bodySchema = z.object({
  comment: z.string().max(2000).optional(),
});

type RouteContext = { params: Promise<{ invoiceId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "ADMIN") return jsonError("管理者のみ操作できます。", 403);

  const { invoiceId } = await context.params;
  const before = await getPartnerInvoiceById(invoiceId);
  if (!before) return jsonError("請求書が見つかりません。", 404);

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  try {
    const saved = await adminReturnPartnerInvoice(invoiceId, parsed.data.comment ?? null);
    await appendMemberNotification({
      recipientUserId: saved.partnerId,
      type: "INVOICE_RETURNED",
      summary: `${saved.year}年${saved.month}月 の請求書が差し戻されました。再編集してください。`,
      actorUserId: session.sub,
      actorRole: "ADMIN",
      link: `/partner/invoices?year=${saved.year}&month=${saved.month}`,
    });
    return jsonOk({ invoice: saved });
  } catch (err) {
    const e = err as Error & { http?: number };
    return jsonError(e.message ?? "差し戻しに失敗しました。", e.http ?? 500);
  }
}
