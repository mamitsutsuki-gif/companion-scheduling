import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getPartnerInvoice } from "@/lib/repositories/partner-invoice-repository";
import { buildInvoiceCandidatesForPartner } from "@/lib/invoice-candidates";
import { isAtOrAfterEndOfMonth } from "@/lib/invoice-editability";

/**
 * パートナー向けのホーム/タブバッジ判定。
 * - 当月: 月末日以降で、当月分の請求書が「未提出（DRAFT もしくは未作成）」かつ実施済セッションが存在するならアラート
 * - 前月: 入力期限内なので、未提出かつ実施済セッションが存在するならアラート
 */
export async function GET() {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "PARTNER") {
    return jsonOk({ alerts: [], count: 0 });
  }
  const partnerId = session.sub;
  const today = new Date();
  const currYear = today.getFullYear();
  const currMonth = today.getMonth() + 1;
  // 前月計算
  const prevDate = new Date(currYear, currMonth - 2, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonth = prevDate.getMonth() + 1;

  type Alert = {
    year: number;
    month: number;
    reason: "current_month_end" | "previous_month_unsubmitted";
    label: string;
  };
  const alerts: Alert[] = [];

  async function shouldAlert(year: number, month: number, currentEndOfMonth: boolean) {
    const [invoice, items] = await Promise.all([
      getPartnerInvoice(partnerId, year, month),
      buildInvoiceCandidatesForPartner(partnerId, year, month),
    ]);
    // SUBMITTED/CONFIRMED ならアラート不要
    if (invoice && (invoice.status === "SUBMITTED" || invoice.status === "CONFIRMED")) {
      return false;
    }
    // 実施済セッションが 1 件も無いなら出さない
    if (items.length === 0 && (!invoice || invoice.items.length === 0)) return false;
    // 当月は最終日以降のみ通知
    if (currentEndOfMonth && !isAtOrAfterEndOfMonth(year, month, today)) return false;
    return true;
  }

  if (await shouldAlert(currYear, currMonth, true)) {
    alerts.push({
      year: currYear,
      month: currMonth,
      reason: "current_month_end",
      label: `${currYear}年${currMonth}月分の請求書を入力してください。`,
    });
  }
  if (await shouldAlert(prevYear, prevMonth, false)) {
    alerts.push({
      year: prevYear,
      month: prevMonth,
      reason: "previous_month_unsubmitted",
      label: `${prevYear}年${prevMonth}月分の請求書が未提出です。`,
    });
  }

  return jsonOk({ alerts, count: alerts.length });
}
