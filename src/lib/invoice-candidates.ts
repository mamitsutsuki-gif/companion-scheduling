import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { listSessionPlanForMatch } from "@/lib/repositories/match-sessions-repository";
import type { PartnerInvoiceItem } from "@/lib/repositories/partner-invoice-repository";

type RawMatchDoc = {
  id: string;
  partnerId: string;
  clientId: string;
};

type RawReportDoc = {
  matchId: string;
  sessionNumber: number;
  partnerId: string;
};

async function listMatchesForPartner(partnerId: string): Promise<RawMatchDoc[]> {
  if (!isFirebaseDataBackend()) return [];
  const db = getFirebaseFirestoreClient();
  if (!db) return [];
  const snap = await db.collection("matches").where("partnerId", "==", partnerId).get();
  return snap.docs.map((d) => {
    const raw = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      partnerId: String(raw.partnerId ?? ""),
      clientId: String(raw.clientId ?? ""),
    };
  });
}

async function listReportsByPartner(partnerId: string): Promise<RawReportDoc[]> {
  if (!isFirebaseDataBackend()) return [];
  const db = getFirebaseFirestoreClient();
  if (!db) return [];
  const snap = await db
    .collection("sessionReports")
    .where("partnerId", "==", partnerId)
    .get();
  return snap.docs.map((d) => {
    const raw = d.data() as Record<string, unknown>;
    return {
      matchId: String(raw.matchId ?? ""),
      sessionNumber: Number(raw.sessionNumber ?? 0),
      partnerId: String(raw.partnerId ?? ""),
    };
  });
}

async function getUserDisplayNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!isFirebaseDataBackend()) return out;
  const db = getFirebaseFirestoreClient();
  if (!db) return out;
  const uniq = [...new Set(ids.filter(Boolean))];
  const snaps = await Promise.all(uniq.map((id) => db.collection("users").doc(id).get()));
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const raw = snap.data() as Record<string, unknown>;
    out.set(snap.id, String(raw.displayName ?? "ユーザー"));
  }
  return out;
}

/**
 * 指定パートナーが対象月に実施した（= レポート入力済かつ確定済セッションが対象月内）セッションを請求書の明細候補として返す。
 * unitPriceExclTax はパートナー入力なので 0 で初期化する。
 */
export async function buildInvoiceCandidatesForPartner(
  partnerId: string,
  year: number,
  month: number,
): Promise<PartnerInvoiceItem[]> {
  const matches = await listMatchesForPartner(partnerId);
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const reports = await listReportsByPartner(partnerId);
  if (reports.length === 0) return [];

  // 並列で各マッチの session plan を取得
  const planByMatch = new Map<string, Awaited<ReturnType<typeof listSessionPlanForMatch>>>();
  await Promise.all(
    [...new Set(reports.map((r) => r.matchId))].map(async (mid) => {
      planByMatch.set(mid, await listSessionPlanForMatch(mid));
    }),
  );

  const clientNames = await getUserDisplayNames(matches.map((m) => m.clientId));

  const items: PartnerInvoiceItem[] = [];
  for (const r of reports) {
    const match = matchById.get(r.matchId);
    if (!match) continue;
    const plan = planByMatch.get(r.matchId) ?? [];
    const session = plan.find((p) => p.sessionNumber === r.sessionNumber);
    if (!session?.confirmed || !session.startAt) continue;
    const d = new Date(session.startAt);
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month) continue;
    items.push({
      matchId: r.matchId,
      sessionNumber: r.sessionNumber,
      sessionDate: session.startAt,
      clientName: clientNames.get(match.clientId) ?? "クライアント",
      unitPriceExclTax: 0,
    });
  }
  // 実施日昇順でソート
  items.sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));
  return items;
}

/** 管理者の月次一覧表示で、各パートナー名を一括取得するヘルパー。 */
export async function getPartnerDisplayNames(partnerIds: string[]): Promise<Map<string, string>> {
  return getUserDisplayNames(partnerIds);
}
