import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getUserById } from "@/lib/repositories/user-repository";
import { listMatchesForRole } from "@/lib/repositories/match-repository";
import { listNegotiationsForMatch } from "@/lib/repositories/negotiation-repository";
import { listSessionPlanForMatch } from "@/lib/repositories/match-sessions-repository";
import { listSessionFeedbacksForMatch } from "@/lib/repositories/session-feedback-repository";
import { listSessionReportsForMatch } from "@/lib/repositories/session-report-repository";
import { listSessionAbandonmentsForMatch } from "@/lib/repositories/session-abandonment-repository";
import { listMessagesForMatch } from "@/lib/repositories/message-repository";
import { listMemberNotifications } from "@/lib/repositories/member-notification-repository";
import { getFtaByUserId } from "@/lib/repositories/fta-repository";
import { getPartnerInvoice } from "@/lib/repositories/partner-invoice-repository";
import { isFirebaseDataBackend } from "@/lib/firebase-admin";
import { getEffectiveAppSettingsForUser } from "@/lib/effective-app-settings";
import { shouldShowGlobalFta } from "@/lib/company-plan";
import {
  computeAllActions,
  type ComputeInput,
  type NegotiationSnapshot,
  type SessionPlanSnapshot,
  type MatchSnapshot,
  type UnreadChatSnapshot,
} from "@/lib/next-actions";

/**
 * 「あなたが次にやること」をユーザー横断で集計する API。
 *
 * パートナー / クライアント / クライアント管理者 / クライアント人事 を対象。
 * 管理者・管理者アシスタントは管理者用の別画面から状況を把握するので、
 * ここでは空配列を返す（このリストは「私個人のタスク」のためのもの）。
 */
export async function GET() {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);

  const me = await getUserById(session.sub);
  if (!me) return jsonError("ユーザー情報が取得できません。", 401);

  if (me.role === "ADMIN" || me.role === "ADMIN_ASSISTANT") {
    return jsonOk({ actions: [], matches: [] });
  }

  const matchRows = await listMatchesForRole({ role: me.role, userId: me.id });
  const matches: MatchSnapshot[] = matchRows.map((m) => ({
    matchId: m.id,
    partnerId: String((m as { partner: { id: string } }).partner.id),
    partnerName: String((m as { partner: { displayName: string } }).partner.displayName ?? ""),
    clientId: String((m as { client: { id: string } }).client.id),
    clientName: String((m as { client: { displayName: string } }).client.displayName ?? ""),
  }));

  // マッチ件数 0 のときは API レベルでもこれだけ返す（クライアントは「アサイン待ち」表示にする）
  if (matches.length === 0) {
    // FTA / 請求書はマッチ無しでも個別アクションになり得るが、
    // 「まず管理者にアサインされるまでは何もできない」というのが本要件なので、
    // マッチが無いときは個別アクションも空にする。
    return jsonOk({ actions: [], matches: [] });
  }

  // 全マッチ分のデータを並列ロード
  const perMatch = await Promise.all(
    matches.map(async (m) => {
      const [negs, sessionPlan, feedbacks, reports, abandonments, messages] = await Promise.all([
        listNegotiationsForMatch(m.matchId),
        listSessionPlanForMatch(m.matchId),
        listSessionFeedbacksForMatch(m.matchId),
        listSessionReportsForMatch(m.matchId),
        listSessionAbandonmentsForMatch(m.matchId),
        listMessagesForMatch(m.matchId),
      ]);
      return { m, negs, sessionPlan, feedbacks, reports, abandonments, messages };
    }),
  );

  // 未読チャット件数: member notifications の CHAT (readAt なし) を matchId ごとに集計
  const myNotifs = await listMemberNotifications(me.id, { limit: 200 });
  const unreadByMatch: Record<string, UnreadChatSnapshot> = {};
  for (const n of myNotifs) {
    if (n.type !== "CHAT" || n.readAt) continue;
    if (!n.matchId) continue;
    const cur = unreadByMatch[n.matchId]?.unreadCount ?? 0;
    unreadByMatch[n.matchId] = { matchId: n.matchId, unreadCount: cur + 1 };
  }

  const negotiationsByMatch: Record<string, NegotiationSnapshot[]> = {};
  const sessionPlanByMatch: Record<string, SessionPlanSnapshot[]> = {};
  const feedbacksByMatch: ComputeInput["feedbacksByMatch"] = {};
  const reportsByMatch: ComputeInput["reportsByMatch"] = {};
  const abandonmentsByMatch: ComputeInput["abandonmentsByMatch"] = {};
  const messageCountByMatch: Record<string, number> = {};

  for (const row of perMatch) {
    negotiationsByMatch[row.m.matchId] = row.negs.map((n) => ({
      matchId: n.matchId,
      sessionNumber: n.sessionNumber,
      round: n.round,
      status: n.status,
      slots: n.slots.map((s) => ({
        id: s.id,
        startAt: s.startAt,
        endAt: s.endAt,
        clientVote: s.clientVote,
        isConfirmed: s.isConfirmed,
      })),
      rescheduleRequestedAt: n.rescheduleRequestedAt ?? null,
      createdAt: n.createdAt,
    }));
    sessionPlanByMatch[row.m.matchId] = row.sessionPlan.map((s) => ({
      matchId: s.matchId,
      sessionNumber: s.sessionNumber,
      confirmed: s.confirmed,
      startAt: s.startAt,
      endAt: s.endAt,
    }));
    feedbacksByMatch[row.m.matchId] = row.feedbacks.map((f) => ({
      matchId: f.matchId,
      sessionNumber: f.sessionNumber,
    }));
    reportsByMatch[row.m.matchId] = row.reports.map((r) => ({
      matchId: r.matchId,
      sessionNumber: r.sessionNumber,
    }));
    abandonmentsByMatch[row.m.matchId] = row.abandonments.map((a) => ({
      matchId: a.matchId,
      sessionNumber: a.sessionNumber,
    }));
    messageCountByMatch[row.m.matchId] = row.messages.length;
  }

  // FTA (CLIENT 系のみ意味があるが、プランで FTA が無効な企業メンバーには出さない)
  let myFta: ComputeInput["myFta"] | undefined;
  const effective = await getEffectiveAppSettingsForUser(me.id);
  const showFta = shouldShowGlobalFta(me.role, effective.companyPlan);
  if (
    showFta &&
    (me.role === "CLIENT" || me.role === "CLIENT_ADMIN" || me.role === "CLIENT_HR")
  ) {
    const chart = await getFtaByUserId(me.id);
    myFta = {
      visionText: chart.vision.text,
      hasAnyElement: chart.elements.some((e) => e.text.trim().length > 0),
    };
  }

  // パートナーの当月請求書（Firestore バックエンドのみ。Prisma では getPartnerInvoice が常に null のため
  // 「未提出」と誤検知しないよう、請求書アクション自体を出さない）
  let myInvoice: ComputeInput["myInvoice"] | undefined;
  if (me.role === "PARTNER" && isFirebaseDataBackend()) {
    const now = new Date();
    const inv = await getPartnerInvoice(me.id, now.getFullYear(), now.getMonth() + 1);
    myInvoice = { status: inv ? inv.status : "MISSING" };
  }

  const actions = computeAllActions({
    me: { id: me.id, role: me.role },
    matches,
    negotiationsByMatch,
    sessionPlanByMatch,
    feedbacksByMatch,
    reportsByMatch,
    abandonmentsByMatch,
    unreadByMatch,
    messageCountByMatch,
    myFta,
    myInvoice,
    now: new Date(),
  });

  return jsonOk({ actions, matches });
}
