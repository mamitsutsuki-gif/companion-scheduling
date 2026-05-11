import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import {
  computeTransferDate,
  getPartnerInvoice,
  listPartnerInvoicesByPartner,
  upsertPartnerInvoice,
  type PartnerInvoiceItem,
} from "@/lib/repositories/partner-invoice-repository";
import { getPartnerBillingProfile } from "@/lib/repositories/partner-billing-profile-repository";
import { getUserById } from "@/lib/repositories/user-repository";
import { buildInvoiceCandidatesForPartner } from "@/lib/invoice-candidates";

const itemSchema = z.object({
  matchId: z.string().min(1).max(120),
  sessionNumber: z.number().int().min(1).max(60),
  sessionDate: z.string().min(1).max(80),
  clientName: z.string().max(200).default(""),
  unitPriceExclTax: z.number().int().min(0).max(10_000_000),
});

const putSchema = z.object({
  year: z.number().int().min(2024).max(2099),
  month: z.number().int().min(1).max(12),
  partnerName: z.string().max(200).default(""),
  address: z.string().max(1000).default(""),
  phone: z.string().max(200).default(""),
  bankAccount: z.string().max(1000).default(""),
  items: z.array(itemSchema).max(200).default([]),
});

function mergeItems(
  existing: PartnerInvoiceItem[],
  candidates: PartnerInvoiceItem[],
): PartnerInvoiceItem[] {
  // existing を優先しつつ、未追加の candidates を末尾に追加する。
  const key = (i: PartnerInvoiceItem) => `${i.matchId}|${i.sessionNumber}`;
  const seen = new Set(existing.map(key));
  const out = [...existing];
  for (const c of candidates) {
    if (!seen.has(key(c))) {
      out.push(c);
      seen.add(key(c));
    }
  }
  return out;
}

export async function GET(request: Request) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "PARTNER") {
    return jsonError("パートナー専用です。", 403);
  }
  const url = new URL(request.url);
  const yearStr = url.searchParams.get("year");
  const monthStr = url.searchParams.get("month");
  // 月指定がない場合は一覧を返す
  if (!yearStr || !monthStr) {
    const list = await listPartnerInvoicesByPartner(session.sub);
    return jsonOk({ invoices: list });
  }
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isInteger(year) || !Number.isInteger(month) || year < 2024 || year > 2099 || month < 1 || month > 12) {
    return jsonError("対象月の指定が不正です。");
  }
  const [existing, profile, candidates, me] = await Promise.all([
    getPartnerInvoice(session.sub, year, month),
    getPartnerBillingProfile(session.sub),
    buildInvoiceCandidatesForPartner(session.sub, year, month),
    getUserById(session.sub),
  ]);

  const partnerName = me?.displayName ?? "";
  // 既存があれば items は既存のまま（編集内容を保持）。新規セッションが追加されていればマージ。
  const itemsForView: PartnerInvoiceItem[] = existing
    ? existing.status === "CONFIRMED" || existing.status === "SUBMITTED"
      ? existing.items
      : mergeItems(existing.items, candidates)
    : candidates;

  return jsonOk({
    invoice: existing ?? null,
    candidates,
    profile,
    partnerName,
    transferDate: computeTransferDate(year, month),
    itemsForView,
  });
}

export async function PUT(request: Request) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "PARTNER") {
    return jsonError("パートナー専用です。", 403);
  }
  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  try {
    const saved = await upsertPartnerInvoice({
      partnerId: session.sub,
      year: parsed.data.year,
      month: parsed.data.month,
      partnerName: parsed.data.partnerName,
      address: parsed.data.address,
      phone: parsed.data.phone,
      bankAccount: parsed.data.bankAccount,
      items: parsed.data.items,
    });
    return jsonOk({ invoice: saved });
  } catch (err) {
    const e = err as Error & { http?: number };
    return jsonError(e.message ?? "保存に失敗しました。", e.http ?? 500);
  }
}
