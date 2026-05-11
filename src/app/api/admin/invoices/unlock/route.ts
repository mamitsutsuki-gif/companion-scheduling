import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import {
  clearPartnerInvoiceUnlock,
  setPartnerInvoiceUnlock,
} from "@/lib/repositories/partner-invoice-unlock-repository";
import { appendMemberNotification } from "@/lib/repositories/member-notification-repository";
import { getUserById } from "@/lib/repositories/user-repository";

const bodySchema = z.object({
  partnerId: z.string().min(1).max(120),
  year: z.number().int().min(2024).max(2099),
  month: z.number().int().min(1).max(12),
});

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "ADMIN") return jsonError("管理者のみ操作できます。", 403);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");
  const row = await setPartnerInvoiceUnlock({
    partnerId: parsed.data.partnerId,
    year: parsed.data.year,
    month: parsed.data.month,
    unlockedBy: session.sub,
  });
  // 対象パートナーへの通知（差し戻しほど強くないが、編集できるようになったことを知らせる）
  const partner = await getUserById(parsed.data.partnerId);
  if (partner) {
    await appendMemberNotification({
      recipientUserId: parsed.data.partnerId,
      type: "INVOICE_RETURNED",
      summary: `${parsed.data.year}年${parsed.data.month}月 の請求書が編集可能になりました（管理者がアンロック）。`,
      actorUserId: session.sub,
      actorRole: "ADMIN",
      link: `/partner/invoices?year=${parsed.data.year}&month=${parsed.data.month}`,
    });
  }
  return jsonOk({ unlock: row });
}

export async function DELETE(request: Request) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "ADMIN") return jsonError("管理者のみ操作できます。", 403);
  const url = new URL(request.url);
  const partnerId = url.searchParams.get("partnerId") ?? "";
  const year = Number(url.searchParams.get("year"));
  const month = Number(url.searchParams.get("month"));
  if (!partnerId || !Number.isInteger(year) || !Number.isInteger(month)) {
    return jsonError("入力内容が不正です。");
  }
  await clearPartnerInvoiceUnlock(partnerId, year, month);
  return jsonOk({ ok: true });
}
