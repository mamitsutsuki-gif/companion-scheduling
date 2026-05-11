import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { submitPartnerInvoice } from "@/lib/repositories/partner-invoice-repository";
import { appendAdminNotification } from "@/lib/repositories/admin-notification-repository";
import { getUserById } from "@/lib/repositories/user-repository";

const bodySchema = z.object({
  year: z.number().int().min(2024).max(2099),
  month: z.number().int().min(1).max(12),
});

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "PARTNER") {
    return jsonError("パートナー専用です。", 403);
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");
  try {
    const saved = await submitPartnerInvoice(session.sub, parsed.data.year, parsed.data.month);
    const me = await getUserById(session.sub);
    await appendAdminNotification({
      type: "INVOICE_SUBMITTED",
      summary: `${me?.displayName ?? "パートナー"}さんが ${saved.year}年${saved.month}月 の請求書を提出しました。`,
      actorUserId: session.sub,
      actorRole: "PARTNER",
      link: `/admin/invoices?year=${saved.year}&month=${saved.month}`,
    });
    return jsonOk({ invoice: saved });
  } catch (err) {
    const e = err as Error & { http?: number };
    return jsonError(e.message ?? "提出に失敗しました。", e.http ?? 500);
  }
}
