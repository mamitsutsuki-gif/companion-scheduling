/**
 * 「あなたが次にやること」を判定する純粋ロジック。
 *
 * 設計方針:
 * - サーバー側集計 (`/api/me/next-actions`) と、クライアント側の
 *   match ページ「今の状態」バナーの両方から同じ関数を呼び、
 *   表示の食い違いを防ぐ。
 * - 副作用なし。引数で与えられたデータからだけ判断する。
 * - 1 つのマッチに対して複数のアクションが同時に成り立つ場合があるので
 *   配列で返す（例: 「未読チャット 3 件」と「振り返り未提出」の同時発生）。
 */
export type ActionSeverity = "info" | "todo" | "warn" | "critical";

export type ActionKind =
  | "PROPOSE_SLOTS" // パートナー: 候補日を送る
  | "RE_PROPOSE_SLOTS" // パートナー: 全 × だったため再提示
  | "VOTE_SLOTS" // クライアント: ◯×回答
  | "CONFIRM_SLOT" // パートナー: ◯がついた候補から確定
  | "WRITE_PARTNER_REPORT" // パートナー: 実施済みセッションのレポート
  | "WRITE_CLIENT_FEEDBACK" // クライアント: 実施済みセッションの振り返り
  | "UNREAD_CHAT" // 双方: 未読チャット
  | "SESSION_UPCOMING" // 双方: 直近セッション開始リマインダ
  | "FILL_FTA" // クライアント: 自分FTA が空 (vision 未入力)
  | "SUBMIT_INVOICE" // パートナー: 当月請求書未提出
  | "SAY_HELLO"; // 初挨拶 (チャットがまだ無い)

export type ActionItem = {
  kind: ActionKind;
  /** 1 件の説明文（ペア名込みの 1 行で完結する形にする） */
  message: string;
  /** 押下時の遷移先 URL */
  href: string;
  /** 主要 CTA のラベル */
  ctaLabel: string;
  severity: ActionSeverity;
  matchId: string | null;
  /** 並べ替えのための重要度（高いほど上） */
  weight: number;
};

export type MatchSnapshot = {
  matchId: string;
  partnerId: string;
  partnerName: string;
  clientId: string;
  clientName: string;
};

export type NegotiationSnapshot = {
  matchId: string;
  sessionNumber: number;
  round: number;
  status:
    | "AWAITING_CLIENT_RESPONSE"
    | "NEEDS_NEW_PROPOSAL"
    | "AWAITING_PARTNER_CONFIRM"
    | "CONFIRMED"
    | "SUPERSEDED";
  slots: Array<{ id: string; startAt: string; endAt: string; clientVote: "YES" | "NO" | null; isConfirmed: boolean }>;
  rescheduleRequestedAt: string | null;
  createdAt: string;
};

export type SessionPlanSnapshot = {
  matchId: string;
  sessionNumber: number;
  confirmed: boolean;
  startAt: string | null;
  endAt: string | null;
};

export type FeedbackSnapshot = {
  matchId: string;
  sessionNumber: number;
};

export type ReportSnapshot = {
  matchId: string;
  sessionNumber: number;
};

export type AbandonmentSnapshot = {
  matchId: string;
  sessionNumber: number;
};

export type UnreadChatSnapshot = {
  matchId: string;
  unreadCount: number;
};

export type FtaSnapshot = {
  visionText: string;
  hasAnyElement: boolean;
};

export type InvoiceSnapshot = {
  /** その partner の、当月分の請求書ステータス */
  status: "DRAFT" | "SUBMITTED" | "RETURNED" | "CONFIRMED" | "MISSING";
};

export type ComputeInput = {
  me: { id: string; role: "ADMIN" | "ADMIN_ASSISTANT" | "PARTNER" | "CLIENT" | "CLIENT_ADMIN" | "CLIENT_HR" };
  /** 自分が当事者であるマッチ一覧 */
  matches: MatchSnapshot[];
  /** マッチごとの直近 negotiations（古い順でも新しい順でも可、内部でソートする） */
  negotiationsByMatch: Record<string, NegotiationSnapshot[]>;
  /** マッチごとのセッションプラン（完了済み判定に使う） */
  sessionPlanByMatch: Record<string, SessionPlanSnapshot[]>;
  /** クライアントの振り返り（提出済みの sessionNumber） */
  feedbacksByMatch: Record<string, FeedbackSnapshot[]>;
  /** パートナーのレポート（提出済みの sessionNumber） */
  reportsByMatch: Record<string, ReportSnapshot[]>;
  /** セッションの未実施・消化（abandoned）扱い */
  abandonmentsByMatch: Record<string, AbandonmentSnapshot[]>;
  /** マッチごとの未読チャット件数（自分が読んでいない他人の発言数） */
  unreadByMatch: Record<string, UnreadChatSnapshot>;
  /** 「初挨拶しているか」のためにメッセージ件数を見たい場合（>0 なら挨拶済みとみなす） */
  messageCountByMatch: Record<string, number>;
  /** 自分の FTA（CLIENT 系のときだけ意味がある） */
  myFta?: FtaSnapshot;
  /** 自分の当月請求書（PARTNER のときだけ意味がある） */
  myInvoice?: InvoiceSnapshot;
  /** 判定用の現在時刻（テスト/サーバ時刻ずれ対策） */
  now: Date;
};

function partnerLabel(m: MatchSnapshot) {
  return `${m.partnerName}さん`;
}
function clientLabel(m: MatchSnapshot) {
  return `${m.clientName}さん`;
}

function latestPerSession(negs: NegotiationSnapshot[]) {
  const map = new Map<number, NegotiationSnapshot>();
  for (const n of negs) {
    const prev = map.get(n.sessionNumber);
    if (!prev || n.round > prev.round) map.set(n.sessionNumber, n);
  }
  return map;
}

function hoursBetween(a: Date, b: Date) {
  return (b.getTime() - a.getTime()) / 3_600_000;
}

/**
 * 1 つのマッチに対する「次のアクション」を最大 3 件くらいまで挙げる。
 * 役割に応じてクライアント側／パートナー側それぞれの目線で判定する。
 */
export function computeMatchActions(
  match: MatchSnapshot,
  input: Omit<ComputeInput, "matches"> & { negotiations: NegotiationSnapshot[] },
): ActionItem[] {
  const { me, now } = input;
  const negs = input.negotiations.slice().sort((a, b) => b.round - a.round);
  const sessionPlan = input.sessionPlanByMatch[match.matchId] ?? [];
  const feedbacks = input.feedbacksByMatch[match.matchId] ?? [];
  const reports = input.reportsByMatch[match.matchId] ?? [];
  const abandonments = input.abandonmentsByMatch[match.matchId] ?? [];
  const unread = input.unreadByMatch[match.matchId]?.unreadCount ?? 0;
  const msgCount = input.messageCountByMatch[match.matchId] ?? 0;
  const isClientSide = me.role === "CLIENT" || me.role === "CLIENT_ADMIN" || me.role === "CLIENT_HR";
  const isPartner = me.role === "PARTNER";
  const otherLabel = isClientSide ? partnerLabel(match) : clientLabel(match);
  const items: ActionItem[] = [];

  // ----- 0. 挨拶（メッセージ 0 件のとき） -----
  if (msgCount === 0 && (isClientSide || isPartner)) {
    items.push({
      kind: "SAY_HELLO",
      message: `${otherLabel} とまだメッセージを交換していません。最初の挨拶を送りましょう。`,
      href: `/match/${match.matchId}#chat`,
      ctaLabel: "チャットを開く",
      severity: "info",
      matchId: match.matchId,
      weight: 30,
    });
  }

  // ----- 1. 未読チャット -----
  if (unread > 0) {
    items.push({
      kind: "UNREAD_CHAT",
      message: `${otherLabel} からの未読メッセージが ${unread} 件あります。`,
      href: `/match/${match.matchId}#chat`,
      ctaLabel: "チャットを開く",
      severity: "todo",
      matchId: match.matchId,
      weight: 60,
    });
  }

  // ----- 2. 日程調整 -----
  const latestBySession = latestPerSession(negs);
  // 最も古い「進行中」のラウンドを優先（同時に複数あれば session 番号小さい順）
  const active = Array.from(latestBySession.values())
    .filter((n) => n.status !== "CONFIRMED" && n.status !== "SUPERSEDED")
    .sort((a, b) => a.sessionNumber - b.sessionNumber);

  for (const n of active) {
    if (n.status === "AWAITING_CLIENT_RESPONSE" && isClientSide) {
      items.push({
        kind: "VOTE_SLOTS",
        message: `${partnerLabel(match)} から第 ${n.sessionNumber} 回の候補日が届いています。◯×で回答してください。`,
        href: `/match/${match.matchId}#schedule`,
        ctaLabel: "回答する",
        severity: "todo",
        matchId: match.matchId,
        weight: 80,
      });
    }
    if (n.status === "NEEDS_NEW_PROPOSAL" && isPartner) {
      items.push({
        kind: "RE_PROPOSE_SLOTS",
        message: `${clientLabel(match)} が第 ${n.sessionNumber} 回の候補日にすべて × を回答しました。新しい候補日を送ってください。`,
        href: `/match/${match.matchId}#schedule`,
        ctaLabel: "候補日を再送",
        severity: "warn",
        matchId: match.matchId,
        weight: 95,
      });
    }
    if (n.status === "AWAITING_PARTNER_CONFIRM" && isPartner) {
      items.push({
        kind: "CONFIRM_SLOT",
        message: `${clientLabel(match)} が回答済みです。◯がついた候補から第 ${n.sessionNumber} 回の日程を決定してください。`,
        href: `/match/${match.matchId}#schedule`,
        ctaLabel: "日程を決定する",
        severity: "todo",
        matchId: match.matchId,
        weight: 90,
      });
    }
  }

  // ----- 3. パートナー: 次回 (＝未提示の最も若い回) の候補提示 -----
  if (isPartner) {
    // 候補がまだ「一度も提示されていない」最も小さい session を探す
    const knownSessions = new Set(negs.map((n) => n.sessionNumber));
    const totalSessions = Math.max(
      // sessionPlan の長さがそのまま totalSessions
      sessionPlan.length,
      // 念のため negotiations から推測（古いマッチ向けフォールバック）
      ...negs.map((n) => n.sessionNumber),
      1,
    );
    let needPropose: number | null = null;
    for (let i = 1; i <= totalSessions; i++) {
      if (!knownSessions.has(i)) {
        needPropose = i;
        break;
      }
    }
    // 提示済みのものがすべて CONFIRMED である場合、次回提示が必要
    if (needPropose !== null) {
      // 「初回 (need===1)」だけは初回ラベルを付け、severity も warn にして強調する。
      // 2 回目以降は淡々と todo として並べる。
      const isFirst = needPropose === 1;
      items.push({
        kind: "PROPOSE_SLOTS",
        message: isFirst
          ? `${clientLabel(match)} に第 1 回（初回）の候補日を送ってください。`
          : `${clientLabel(match)} に第 ${needPropose} 回の候補日を送ってください。`,
        href: `/match/${match.matchId}#schedule`,
        ctaLabel: "候補日を送る",
        severity: isFirst ? "warn" : "todo",
        matchId: match.matchId,
        weight: isFirst ? 100 : 70,
      });
    }
  }

  // ----- 4. 実施済みセッションの振り返り／レポート未提出 -----
  const submittedFeedbackSet = new Set(feedbacks.map((f) => f.sessionNumber));
  const submittedReportSet = new Set(reports.map((r) => r.sessionNumber));
  const abandonedSet = new Set(abandonments.map((a) => a.sessionNumber));
  const doneSessions = sessionPlan
    .filter((s) => s.confirmed && s.endAt && new Date(s.endAt) <= now && !abandonedSet.has(s.sessionNumber))
    .sort((a, b) => a.sessionNumber - b.sessionNumber);
  for (const s of doneSessions) {
    if (isClientSide && !submittedFeedbackSet.has(s.sessionNumber)) {
      items.push({
        kind: "WRITE_CLIENT_FEEDBACK",
        message: `第 ${s.sessionNumber} 回の振り返り（フィードバック）がまだ提出されていません。`,
        href: `/match/${match.matchId}/sessions/${s.sessionNumber}`,
        ctaLabel: "振り返りを書く",
        severity: "todo",
        matchId: match.matchId,
        weight: 75,
      });
    }
    if (isPartner && !submittedReportSet.has(s.sessionNumber)) {
      items.push({
        kind: "WRITE_PARTNER_REPORT",
        message: `第 ${s.sessionNumber} 回のパートナーレポートがまだ提出されていません。`,
        href: `/match/${match.matchId}/sessions/${s.sessionNumber}`,
        ctaLabel: "レポートを書く",
        severity: "todo",
        matchId: match.matchId,
        weight: 75,
      });
    }
  }

  // ----- 5. 確定済み直近セッションのリマインダ (24h 以内開始) -----
  const upcoming = sessionPlan
    .filter((s) => s.confirmed && s.startAt && new Date(s.startAt) > now)
    .sort((a, b) => new Date(a.startAt!).getTime() - new Date(b.startAt!).getTime())[0];
  if (upcoming && upcoming.startAt) {
    const hrs = hoursBetween(now, new Date(upcoming.startAt));
    if (hrs <= 24) {
      const dt = new Intl.DateTimeFormat("ja-JP", {
        month: "numeric",
        day: "numeric",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(upcoming.startAt));
      items.push({
        kind: "SESSION_UPCOMING",
        message: `第 ${upcoming.sessionNumber} 回はまもなく開始です（${dt} 〜）。`,
        href: `/match/${match.matchId}#sessions`,
        ctaLabel: "セッション詳細を開く",
        severity: "info",
        matchId: match.matchId,
        weight: 50,
      });
    }
  }

  return items;
}

/** 全マッチを横断して「次のアクション」を 1 本のリストにまとめる。 */
export function computeAllActions(input: ComputeInput): ActionItem[] {
  const items: ActionItem[] = [];

  for (const m of input.matches) {
    const negs = input.negotiationsByMatch[m.matchId] ?? [];
    items.push(
      ...computeMatchActions(m, {
        ...input,
        negotiations: negs,
      }),
    );
  }

  // ----- グローバル: FTA が空 (CLIENT 系のみ) -----
  const isClientSide =
    input.me.role === "CLIENT" || input.me.role === "CLIENT_ADMIN" || input.me.role === "CLIENT_HR";
  if (isClientSide && input.myFta) {
    const visionEmpty = (input.myFta.visionText ?? "").trim().length === 0;
    if (visionEmpty) {
      items.push({
        kind: "FILL_FTA",
        message: "自分FTA がまだ書かれていません。「ありたい姿」だけでも入れてみましょう。",
        href: "/fta",
        ctaLabel: "自分FTAを開く",
        severity: "todo",
        matchId: null,
        weight: 65,
      });
    }
  }

  // ----- グローバル: パートナー請求書 -----
  if (input.me.role === "PARTNER" && input.myInvoice) {
    const s = input.myInvoice.status;
    if (s === "MISSING" || s === "DRAFT") {
      items.push({
        kind: "SUBMIT_INVOICE",
        message: "今月の請求書がまだ提出されていません。",
        href: "/partner/invoices",
        ctaLabel: "請求書を提出",
        severity: "todo",
        matchId: null,
        weight: 55,
      });
    } else if (s === "RETURNED") {
      items.push({
        kind: "SUBMIT_INVOICE",
        message: "今月の請求書が差し戻されています。修正して再提出してください。",
        href: "/partner/invoices",
        ctaLabel: "請求書を確認",
        severity: "warn",
        matchId: null,
        weight: 90,
      });
    }
  }

  // 重要度高い順 → 同じ重要度なら matchId をまとめる
  return items.sort((a, b) => b.weight - a.weight || (a.matchId ?? "").localeCompare(b.matchId ?? ""));
}
