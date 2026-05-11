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
import { isPartnerInvoiceUnlocked } from "@/lib/repositories/partner-invoice-unlock-repository";
import { getUserById } from "@/lib/repositories/user-repository";
import {
  buildInvoiceCandidatesForPartner,
  enrichInvoiceItemsClientCompanyNames,
} from "@/lib/invoice-candidates";
import { isMonthWithinDefaultEditWindow } from "@/lib/invoice-editability";

const itemSchema = z.object({
  matchId: z.string().min(1).max(120),
  sessionNumber: z.number().int().min(1).max(60),
  sessionDate: z.string().min(1).max(80),
  clientName: z.string().max(200).default(""),
  clientCompanyName: z.string().max(200).default(""),
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
  const key = (i: PartnerInvoiceItem) => `${i.matchId}|${i.sessionNumber}`;
  const candByKey = new Map(candidates.map((c) => [key(c), c]));
  const seen = new Set(existing.map(key));
  const out: PartnerInvoiceItem[] = existing.map((ex) => {
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
  const [existing, profile, candidates, me, unlocked] = await Promise.all([
    getPartnerInvoice(session.sub, year, month),
    getPartnerBillingProfile(session.sub),
    buildInvoiceCandidatesForPartner(session.sub, year, month),
    getUserById(session.sub),
    isPartnerInvoiceUnlocked(session.sub, year, month),
  ]);

  const partnerName = me?.displayName ?? "";
  // 既存があれば items は既存のまま（編集内容を保持）。新規セッションが追加されていればマージ。
  let itemsForView: PartnerInvoiceItem[] = existing
    ? existing.status === "CONFIRMED" || existing.status === "SUBMITTED"
      ? existing.items
      : mergeItems(existing.items, candidates)
    : candidates;
  itemsForView = await enrichInvoiceItemsClientCompanyNames(itemsForView);

  const editable = isMonthWithinDefaultEditWindow(year, month) || unlocked;

  return jsonOk({
    invoice: existing ?? null,
    candidates,
    profile,
    partnerName,
    transferDate: computeTransferDate(year, month),
    itemsForView,
    editable,
    unlocked,
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

  const unlocked = await isPartnerInvoiceUnlocked(
    session.sub,
    parsed.data.year,
    parsed.data.month,
  );
  if (!isMonthWithinDefaultEditWindow(parsed.data.year, parsed.data.month) && !unlocked) {
    return jsonError(
      "編集できる期間（当月・前月）を過ぎています。過去分を編集したい場合は管理者にアンロックを依頼してください。",
      403,
    );
  }

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
