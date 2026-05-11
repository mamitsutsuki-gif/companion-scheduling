import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import {
  computeTransferDate,
  type PartnerInvoiceItem,
} from "@/lib/repositories/partner-invoice-repository";
import { getPartnerBillingProfile } from "@/lib/repositories/partner-billing-profile-repository";
import { getUserById } from "@/lib/repositories/user-repository";
import { buildInvoiceCandidatesForPartner, enrichInvoiceItemsClientCompanyNames } from "@/lib/invoice-candidates";

/**
 * 管理者用: パートナーがまだ請求書を作成していない月でも、レポート入力済セッションから
 * 仮の請求書プレビューを組み立てて返す。閲覧専用（書き換えはしない）。
 */
export async function GET(request: Request) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "ADMIN") return jsonError("管理者のみ閲覧できます。", 403);
  const url = new URL(request.url);
  const partnerId = url.searchParams.get("partnerId") ?? "";
  const year = Number(url.searchParams.get("year"));
  const month = Number(url.searchParams.get("month"));
  if (!partnerId || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return jsonError("パラメータが不正です。");
  }
  const [partner, profile, itemsRaw] = await Promise.all([
    getUserById(partnerId),
    getPartnerBillingProfile(partnerId),
    buildInvoiceCandidatesForPartner(partnerId, year, month),
  ]);
  const items = await enrichInvoiceItemsClientCompanyNames(itemsRaw);
  const preview: {
    partnerId: string;
    partnerDisplayName: string;
    address: string;
    phone: string;
    bankAccount: string;
    items: PartnerInvoiceItem[];
    transferDate: string;
    year: number;
    month: number;
  } = {
    partnerId,
    partnerDisplayName: partner?.displayName ?? "",
    address: profile?.address ?? "",
    phone: profile?.phone ?? "",
    bankAccount: profile?.bankAccount ?? "",
    items,
    transferDate: computeTransferDate(year, month),
    year,
    month,
  };
  return jsonOk({ preview });
}
