import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { listAllSessionFeedbacks } from "@/lib/repositories/session-feedback-repository";
import { listEffectiveConfirmedSessionsForAdmin } from "@/lib/repositories/confirmed-sessions-admin-repository";
import { listAdminVisibleUsers } from "@/lib/repositories/user-repository";
import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  /** 対象クライアント ID。空のときは全クライアント */
  clientIds: z.array(z.string().min(1)).optional(),
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
  if (!session || session.role !== "ADMIN") return jsonError("権限がありません。", 403);
  const parsed = querySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");
  const opts: ReqBody = parsed.data;

  // 全クライアント名を取得（匿名指定でも内部判定で利用）
  const [clientUsers, clientAdminUsers] = await Promise.all([
    listAdminVisibleUsers("CLIENT"),
    listAdminVisibleUsers("CLIENT_ADMIN"),
  ]);
  const clientNameById = new Map<string, string>();
  for (const u of [...clientUsers, ...clientAdminUsers]) clientNameById.set(u.id, u.displayName);

  // 全フィードバック + 確定セッション（実施日付） + match->client
  const [allFeedbacks, confirmed, matchClient] = await Promise.all([
    listAllSessionFeedbacks(),
    listEffectiveConfirmedSessionsForAdmin(),
    loadMatchClientMap(),
  ]);

  const sessionDateByKey = new Map<string, string>();
  for (const c of confirmed) {
    sessionDateByKey.set(`${c.matchId}:${c.sessionNumber}`, c.startAt);
  }

  const fromMs = opts.fromIso ? Date.parse(opts.fromIso) : null;
  const toMs = opts.toIso ? Date.parse(opts.toIso) : null;

  // 抽出（クライアント／回／期間でフィルタ）
  type EnrichedFeedback = (typeof allFeedbacks)[number] & {
    clientName: string;
    sessionDateIso: string | null;
  };
  const filtered: EnrichedFeedback[] = [];
  for (const fb of allFeedbacks) {
    const clientId = fb.clientId || matchClient.get(fb.matchId) || "";
    if (!clientId) continue;
    if (opts.clientIds && opts.clientIds.length > 0 && !opts.clientIds.includes(clientId))
      continue;
    if (
      opts.sessionNumbers &&
      opts.sessionNumbers.length > 0 &&
      !opts.sessionNumbers.includes(fb.sessionNumber)
    )
      continue;
    const dateIso =
      sessionDateByKey.get(`${fb.matchId}:${fb.sessionNumber}`) ?? fb.createdAt ?? null;
    if (fromMs != null) {
      const d = dateIso ? Date.parse(dateIso) : Number.NaN;
      if (!Number.isFinite(d) || d < fromMs) continue;
    }
    if (toMs != null) {
      const d = dateIso ? Date.parse(dateIso) : Number.NaN;
      if (!Number.isFinite(d) || d > toMs) continue;
    }
    filtered.push({
      ...fb,
      clientId,
      clientName: clientNameById.get(clientId) ?? "（不明）",
      sessionDateIso: dateIso,
    });
  }

  if (opts.format === "per-question") {
    // 項目ごと：匿名前提、partnerChange は除外
    const insight: string[] = [];
    const feeling: string[] = [];
    const nextActions: string[] = [];
    const satisfactionReason: string[] = [];
    const other: string[] = [];
    const satisfaction: number[] = [];
    for (const r of filtered) {
      if (r.answers.insight) insight.push(r.answers.insight);
      if (r.answers.feeling) feeling.push(r.answers.feeling);
      if (r.answers.nextActions) nextActions.push(r.answers.nextActions);
      if (r.answers.satisfactionReason) satisfactionReason.push(r.answers.satisfactionReason);
      if (r.answers.other) other.push(r.answers.other);
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
      },
      satisfaction: { values: satisfaction, average: avg },
    });
  }

  // 一人一人：クライアント順 → セッション順
  const grouped = new Map<string, EnrichedFeedback[]>();
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
          satisfactionScore: r.satisfactionScore,
          answers: {
            insight: r.answers.insight ?? "",
            feeling: r.answers.feeling ?? "",
            nextActions: r.answers.nextActions ?? "",
            satisfactionReason: r.answers.satisfactionReason ?? "",
            other: r.answers.other ?? "",
          },
        })),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "ja"));

  return jsonOk({ format: "per-person", itemsCount: filtered.length, perPerson });
}
