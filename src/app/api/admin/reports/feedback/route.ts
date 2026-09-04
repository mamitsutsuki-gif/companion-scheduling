import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { listAllSessionFeedbacks } from "@/lib/repositories/session-feedback-repository";
import { listEffectiveConfirmedSessionsForAdmin } from "@/lib/repositories/confirmed-sessions-admin-repository";
import { listAllRoleplayStores } from "@/lib/repositories/coaching-repository";
import { listAdminVisibleUsers } from "@/lib/repositories/user-repository";
import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import {
  mergeAdminFeedbackReportRows,
  roleplaySessionToReportRow,
  standardFeedbackToReportRow,
  type AdminFeedbackReportRow,
} from "@/lib/admin-feedback-report";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  /** 対象クライアント ID。空のときは全クライアント */
  clientIds: z.array(z.string().min(1)).optional(),
  /** 所属企業 ID（アプリ設定の企業テナント）。指定時はその企業に所属するクライアントのみ */
  filterCompanyId: z.string().max(80).optional(),
  /** 対象セッション回（1〜N）。空のときは全回 */
  sessionNumbers: z.array(z.number().int().min(1).max(99)).optional(),
  /** 期間（実施日 from / to）。ISO 文字列 */
  fromIso: z.string().min(1).optional(),
  toIso: z.string().min(1).optional(),
  anonymous: z.boolean().optional(),
  format: z.enum(["per-person", "per-question"]),
});

type ReqBody = z.infer<typeof querySchema>;

/** matchId -> clientId のマップを取得 */
async function loadMatchClientMap(): Promise<Map<string, string>> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return new Map();
    const snap = await db.collection("matches").get();
    const m = new Map<string, string>();
    for (const d of snap.docs) {
      const r = d.data() as Record<string, unknown>;
      m.set(d.id, String(r.clientId ?? ""));
    }
    return m;
  }
  const rows = await prisma.match.findMany({ select: { id: true, clientId: true } });
  return new Map(rows.map((r) => [r.id, r.clientId]));
}

export async function POST(request: Request) {
  const session = await readSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "ADMIN_ASSISTANT"))
    return jsonError("権限がありません。", 403);
  const parsed = querySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");
  const opts: ReqBody = parsed.data;

  const [clientUsers, clientAdminUsers, clientHrUsers] = await Promise.all([
    listAdminVisibleUsers("CLIENT"),
    listAdminVisibleUsers("CLIENT_ADMIN"),
    listAdminVisibleUsers("CLIENT_HR"),
  ]);
  const clientNameById = new Map<string, string>();
  const clientCompanyIdById = new Map<string, string | null>();
  for (const u of [...clientUsers, ...clientAdminUsers, ...clientHrUsers]) {
    clientNameById.set(u.id, u.displayName);
    const cid = (u as { companyId?: string | null }).companyId;
    clientCompanyIdById.set(u.id, typeof cid === "string" && cid.trim() ? cid.trim() : null);
  }

  const [allFeedbacks, confirmed, matchClient, roleplayStores] = await Promise.all([
    listAllSessionFeedbacks(),
    listEffectiveConfirmedSessionsForAdmin(),
    loadMatchClientMap(),
    listAllRoleplayStores(),
  ]);

  const sessionDateByKey = new Map<string, string>();
  for (const c of confirmed) {
    sessionDateByKey.set(`${c.matchId}:${c.sessionNumber}`, c.startAt);
  }

  const standardRows: AdminFeedbackReportRow[] = [];
  for (const fb of allFeedbacks) {
    const clientId = fb.clientId || matchClient.get(fb.matchId) || "";
    if (!clientId) continue;
    standardRows.push(standardFeedbackToReportRow(fb, clientId));
  }

  const roleplayRows: AdminFeedbackReportRow[] = [];
  for (const store of roleplayStores) {
    const clientId = matchClient.get(store.matchId) || "";
    if (!clientId) continue;
    for (const rpSession of store.sessions) {
      const row = roleplaySessionToReportRow(store, rpSession, clientId);
      if (row) roleplayRows.push(row);
    }
  }

  const merged = mergeAdminFeedbackReportRows(standardRows, roleplayRows);

  const fromMs = opts.fromIso ? Date.parse(opts.fromIso) : null;
  const toMs = opts.toIso ? Date.parse(opts.toIso) : null;

  type Enriched = AdminFeedbackReportRow & {
    clientName: string;
    sessionDateIso: string | null;
  };
  const filtered: Enriched[] = [];
  for (const row of merged) {
    if (opts.clientIds && opts.clientIds.length > 0 && !opts.clientIds.includes(row.clientId))
      continue;
    if (opts.filterCompanyId && opts.filterCompanyId.trim()) {
      const want = opts.filterCompanyId.trim();
      const userCo = clientCompanyIdById.get(row.clientId) ?? null;
      if (!userCo || userCo !== want) continue;
    }
    if (
      opts.sessionNumbers &&
      opts.sessionNumbers.length > 0 &&
      !opts.sessionNumbers.includes(row.sessionNumber)
    )
      continue;
    const dateIso =
      sessionDateByKey.get(`${row.matchId}:${row.sessionNumber}`) ?? row.createdAt ?? null;
    if (fromMs != null) {
      const d = dateIso ? Date.parse(dateIso) : Number.NaN;
      if (!Number.isFinite(d) || d < fromMs) continue;
    }
    if (toMs != null) {
      const d = dateIso ? Date.parse(dateIso) : Number.NaN;
      if (!Number.isFinite(d) || d > toMs) continue;
    }
    filtered.push({
      ...row,
      clientName: clientNameById.get(row.clientId) ?? "（不明）",
      sessionDateIso: dateIso,
    });
  }

  if (opts.format === "per-question") {
    const insight: string[] = [];
    const feeling: string[] = [];
    const nextActions: string[] = [];
    const satisfactionReason: string[] = [];
    const other: string[] = [];
    const roleplayClientGood: string[] = [];
    const roleplayClientImprove: string[] = [];
    const roleplayClientNextFocus: string[] = [];
    const roleplayClientSatisfactionReason: string[] = [];
    const roleplayPartnerGood: string[] = [];
    const roleplayPartnerImprove: string[] = [];
    const roleplayPartnerAdvice: string[] = [];
    const roleplayPartnerCategoryAvg: string[] = [];
    const satisfaction: number[] = [];

    for (const r of filtered) {
      if (r.source === "standard") {
        if (r.answers.insight) insight.push(r.answers.insight);
        if (r.answers.feeling) feeling.push(r.answers.feeling);
        if (r.answers.nextActions) nextActions.push(r.answers.nextActions);
        if (r.answers.satisfactionReason) satisfactionReason.push(r.answers.satisfactionReason);
        if (r.answers.other) other.push(r.answers.other);
      } else if (r.roleplayClient) {
        if (r.roleplayClient.good) roleplayClientGood.push(r.roleplayClient.good);
        if (r.roleplayClient.improve) roleplayClientImprove.push(r.roleplayClient.improve);
        if (r.roleplayClient.nextFocus) roleplayClientNextFocus.push(r.roleplayClient.nextFocus);
        if (r.roleplayClient.satisfactionReason) {
          roleplayClientSatisfactionReason.push(r.roleplayClient.satisfactionReason);
        }
        if (r.roleplayPartner) {
          if (r.roleplayPartner.good) roleplayPartnerGood.push(r.roleplayPartner.good);
          if (r.roleplayPartner.improve) roleplayPartnerImprove.push(r.roleplayPartner.improve);
          if (r.roleplayPartner.advice) roleplayPartnerAdvice.push(r.roleplayPartner.advice);
          if (r.roleplayPartner.categoryAvgSummary) {
            roleplayPartnerCategoryAvg.push(r.roleplayPartner.categoryAvgSummary);
          }
        }
      }
      if (typeof r.satisfactionScore === "number") satisfaction.push(r.satisfactionScore);
    }

    const avg =
      satisfaction.length === 0
        ? null
        : Math.round((satisfaction.reduce((a, b) => a + b, 0) / satisfaction.length) * 10) / 10;

    return jsonOk({
      format: "per-question",
      itemsCount: filtered.length,
      perQuestion: {
        insight,
        feeling,
        nextActions,
        satisfactionReason,
        other,
        roleplayClientGood,
        roleplayClientImprove,
        roleplayClientNextFocus,
        roleplayClientSatisfactionReason,
        roleplayPartnerGood,
        roleplayPartnerImprove,
        roleplayPartnerAdvice,
        roleplayPartnerCategoryAvg,
      },
      satisfaction: { values: satisfaction, average: avg },
    });
  }

  const grouped = new Map<string, Enriched[]>();
  for (const r of filtered) {
    const arr = grouped.get(r.clientId) ?? [];
    arr.push(r);
    grouped.set(r.clientId, arr);
  }
  const perPerson = [...grouped.entries()]
    .map(([clientId, items]) => ({
      clientId,
      displayName: opts.anonymous ? "匿名" : (clientNameById.get(clientId) ?? "（不明）"),
      sessions: items
        .sort((a, b) => a.sessionNumber - b.sessionNumber)
        .map((r) => ({
          sessionNumber: r.sessionNumber,
          sessionDateIso: r.sessionDateIso,
          source: r.source,
          satisfactionScore: r.satisfactionScore,
          answers: {
            insight: r.answers.insight,
            feeling: r.answers.feeling,
            nextActions: r.answers.nextActions,
            satisfactionReason: r.answers.satisfactionReason,
            other: r.answers.other,
          },
          roleplayClient: r.roleplayClient,
          roleplayPartner: r.roleplayPartner,
        })),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "ja"));

  return jsonOk({ format: "per-person", itemsCount: filtered.length, perPerson });
}
