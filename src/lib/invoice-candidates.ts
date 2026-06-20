import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { listSessionPlanForMatch } from "@/lib/repositories/match-sessions-repository";
import { listAllSessionAbandonments } from "@/lib/repositories/session-abandonment-repository";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";
import { getEffectiveAppSettingsForMatch } from "@/lib/effective-app-settings";
import { getRoleplayStore } from "@/lib/repositories/coaching-repository";
import { roleplaySideComplete } from "@/lib/coaching-roleplay";
import { companyLabelFromRegistry } from "@/lib/company-display";
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
  /** レポート本文 + 追加質問の回答が 1 つでも非空かどうか */
  hasContent: boolean;
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

function reportHasContent(raw: Record<string, unknown>): boolean {
  const reflection = typeof raw.reflection === "string" ? raw.reflection.trim() : "";
  if (reflection.length > 0) return true;
  const ea = raw.extraAnswers;
  if (ea && typeof ea === "object") {
    for (const v of Object.values(ea as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim().length > 0) return true;
    }
  }
  return false;
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
      hasContent: reportHasContent(raw),
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

/** クライアント userId → 企業表示ラベル（未所属は空文字） */
async function getClientCompanyLabels(clientIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!isFirebaseDataBackend()) return out;
  const db = getFirebaseFirestoreClient();
  if (!db) return out;
  const settings = await getAppSettingsRow();
  const uniq = [...new Set(clientIds.filter(Boolean))];
  const snaps = await Promise.all(uniq.map((id) => db.collection("users").doc(id).get()));
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const raw = snap.data() as Record<string, unknown>;
    const cid = raw.companyId;
    const companyId = typeof cid === "string" ? cid : null;
    const label = companyLabelFromRegistry(companyId, settings.companies) ?? "";
    out.set(snap.id, label);
  }
  return out;
}

function reportKey(matchId: string, sessionNumber: number) {
  return `${matchId}#${sessionNumber}`;
}

function partnerSessionHasBillableContent(input: {
  matchId: string;
  sessionNumber: number;
  isCoachingPlan: boolean;
  report: RawReportDoc | null;
  roleplayStore: Awaited<ReturnType<typeof getRoleplayStore>> | null;
}): boolean {
  const { sessionNumber, isCoachingPlan, report, roleplayStore } = input;
  if (isCoachingPlan && sessionNumber >= 1 && sessionNumber <= 3) {
    const session = roleplayStore?.sessions[sessionNumber - 1];
    return session ? roleplaySideComplete(session, "partner") : false;
  }
  return report?.hasContent ?? false;
}

/**
 * 保存済み明細などで clientCompanyName が空の行に、マッチから所属企業を補完する。
 */
export async function enrichInvoiceItemsClientCompanyNames(
  items: PartnerInvoiceItem[],
): Promise<PartnerInvoiceItem[]> {
  if (items.length === 0) return items;
  const settings = await getAppSettingsRow();
  if (!isFirebaseDataBackend()) {
    return items.map((i) => ({ ...i, clientCompanyName: i.clientCompanyName ?? "" }));
  }
  const db = getFirebaseFirestoreClient();
  if (!db) return items.map((i) => ({ ...i, clientCompanyName: i.clientCompanyName ?? "" }));

  const needsFill = items.filter((i) => !(i.clientCompanyName ?? "").trim());
  if (needsFill.length === 0) return items.map((i) => ({ ...i, clientCompanyName: i.clientCompanyName ?? "" }));

  const matchIds = [...new Set(needsFill.map((i) => i.matchId).filter(Boolean))];
  const clientByMatch = new Map<string, string>();
  await Promise.all(
    matchIds.map(async (mid) => {
      const snap = await db.collection("matches").doc(mid).get();
      if (!snap.exists) return;
      const raw = snap.data() as Record<string, unknown>;
      clientByMatch.set(mid, String(raw.clientId ?? ""));
    }),
  );
  const clientIds = [...new Set([...clientByMatch.values()].filter(Boolean))];
  const companyIdByClient = new Map<string, string | null>();
  await Promise.all(
    clientIds.map(async (cid) => {
      const snap = await db.collection("users").doc(cid).get();
      if (!snap.exists) return;
      const raw = snap.data() as Record<string, unknown>;
      const co = raw.companyId;
      companyIdByClient.set(cid, typeof co === "string" ? co : null);
    }),
  );

  return items.map((it) => {
    const cur = (it.clientCompanyName ?? "").trim();
    if (cur) return { ...it, clientCompanyName: cur };
    const clientId = clientByMatch.get(it.matchId) ?? "";
    const label =
      companyLabelFromRegistry(companyIdByClient.get(clientId) ?? null, settings.companies) ?? "";
    return { ...it, clientCompanyName: label };
  });
}

/**
 * 指定パートナーが対象月に実施したセッションを請求書の明細候補として返す。
 *
 * 「実施」の判定:
 *   - 対象月内に確定済セッション開始日があること
 *   - パートナー側の記録があること
 *     - 通常プラン（個別伴走・職場活性）: セッションレポートに 1 文字以上
 *     - コーチング研修 1〜3 回目: ロールプレイのパートナー評価が入力済み
 *     - コーチング研修 4 回目以降: セッションレポートに 1 文字以上
 *   - 当該セッションが **未実施・消化（no_show / late_cancel）ではない**こと
 *
 * unitPriceExclTax はパートナー入力のため 0 で初期化。
 */
export async function buildInvoiceCandidatesForPartner(
  partnerId: string,
  year: number,
  month: number,
): Promise<PartnerInvoiceItem[]> {
  const matches = await listMatchesForPartner(partnerId);
  if (matches.length === 0) return [];

  const reports = await listReportsByPartner(partnerId);
  const reportByKey = new Map(
    reports.map((r) => [reportKey(r.matchId, r.sessionNumber), r]),
  );

  const abandonmentKey = (m: string, n: number) => `${m}#${n}`;
  const abandonedSet = new Set<string>();
  try {
    const all = await listAllSessionAbandonments();
    for (const a of all) abandonedSet.add(abandonmentKey(a.matchId, a.sessionNumber));
  } catch {
    /* best-effort */
  }

  const clientNames = await getUserDisplayNames(matches.map((m) => m.clientId));
  const clientCompanies = await getClientCompanyLabels(matches.map((m) => m.clientId));

  const items: PartnerInvoiceItem[] = [];

  await Promise.all(
    matches.map(async (match) => {
      const effective = await getEffectiveAppSettingsForMatch(match.id);
      const isCoachingPlan = effective.companyPlan === "coaching_management_training";
      const roleplayStore = isCoachingPlan ? await getRoleplayStore(match.id) : null;
      const plan = await listSessionPlanForMatch(match.id);

      for (const session of plan) {
        if (!session.confirmed || !session.startAt) continue;
        const d = new Date(session.startAt);
        if (d.getFullYear() !== year || d.getMonth() + 1 !== month) continue;
        if (abandonedSet.has(abandonmentKey(match.id, session.sessionNumber))) continue;

        const report = reportByKey.get(reportKey(match.id, session.sessionNumber)) ?? null;
        if (
          !partnerSessionHasBillableContent({
            matchId: match.id,
            sessionNumber: session.sessionNumber,
            isCoachingPlan,
            report,
            roleplayStore,
          })
        ) {
          continue;
        }

        items.push({
          matchId: match.id,
          sessionNumber: session.sessionNumber,
          sessionDate: session.startAt,
          clientName: clientNames.get(match.clientId) ?? "クライアント",
          clientCompanyName: clientCompanies.get(match.clientId) ?? "",
          unitPriceExclTax: 0,
        });
      }
    }),
  );

  items.sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));
  return items;
}

/** 管理者の月次一覧表示で、各パートナー名を一括取得するヘルパー。 */
export async function getPartnerDisplayNames(partnerIds: string[]): Promise<Map<string, string>> {
  return getUserDisplayNames(partnerIds);
}

/**
 * 対象月 (year, month) に **実施済（= レポート記載あり、かつ未実施・消化でない）**
 * セッションを 1 件以上持つパートナーの id 一覧。未提出の請求書も管理者画面に並べるために使用。
 */
export async function listPartnersWithReportsForMonth(
  year: number,
  month: number,
): Promise<string[]> {
  if (!isFirebaseDataBackend()) return [];
  const db = getFirebaseFirestoreClient();
  if (!db) return [];

  const matchSnap = await db.collection("matches").get();
  const matches = matchSnap.docs.map((d) => {
    const raw = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      partnerId: String(raw.partnerId ?? ""),
      clientId: String(raw.clientId ?? ""),
    };
  });
  if (matches.length === 0) return [];

  const reports = (await db.collection("sessionReports").get()).docs.map((d) => {
    const raw = d.data() as Record<string, unknown>;
    return {
      partnerId: String(raw.partnerId ?? ""),
      matchId: String(raw.matchId ?? ""),
      sessionNumber: Number(raw.sessionNumber ?? 0),
      hasContent: reportHasContent(raw),
    };
  });
  const reportByKey = new Map(
    reports.map((r) => [reportKey(r.matchId, r.sessionNumber), r]),
  );

  const abandonmentKey = (m: string, n: number) => `${m}#${n}`;
  const abandonedSet = new Set<string>();
  try {
    const all = await listAllSessionAbandonments();
    for (const a of all) abandonedSet.add(abandonmentKey(a.matchId, a.sessionNumber));
  } catch {
    /* best-effort */
  }

  const partnerIds = new Set<string>();

  await Promise.all(
    matches.map(async (match) => {
      if (!match.partnerId) return;
      const effective = await getEffectiveAppSettingsForMatch(match.id);
      const isCoachingPlan = effective.companyPlan === "coaching_management_training";
      const roleplayStore = isCoachingPlan ? await getRoleplayStore(match.id) : null;
      const plan = await listSessionPlanForMatch(match.id);

      for (const session of plan) {
        if (!session.confirmed || !session.startAt) continue;
        const d = new Date(session.startAt);
        if (d.getFullYear() !== year || d.getMonth() + 1 !== month) continue;
        if (abandonedSet.has(abandonmentKey(match.id, session.sessionNumber))) continue;
        const report = reportByKey.get(reportKey(match.id, session.sessionNumber)) ?? null;
        if (
          !partnerSessionHasBillableContent({
            matchId: match.id,
            sessionNumber: session.sessionNumber,
            isCoachingPlan,
            report,
            roleplayStore,
          })
        ) {
          continue;
        }
        partnerIds.add(match.partnerId);
      }
    }),
  );

  return [...partnerIds];
}
