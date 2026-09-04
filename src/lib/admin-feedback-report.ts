import { categoryAverages, ROLEPLAY_CATEGORIES, type RoleplaySession } from "@/lib/coaching-roleplay";
import type { SessionFeedbackRow } from "@/lib/repositories/session-feedback-repository";
import type { RoleplayStore } from "@/lib/coaching-roleplay";

export type ReportSource = "standard" | "roleplay";

export type StandardAnswers = {
  insight: string;
  feeling: string;
  nextActions: string;
  satisfactionReason: string;
  other: string;
};

export type RoleplayClientAnswers = {
  good: string;
  improve: string;
  nextFocus: string;
  satisfactionReason: string;
};

export type RoleplayPartnerAnswers = {
  good: string;
  improve: string;
  advice: string;
  /** カテゴリ平均の一行要約（提出済み時のみ） */
  categoryAvgSummary: string;
};

/** 管理者アンケート集計の統一行（通常振り返り or ロールプレイ） */
export type AdminFeedbackReportRow = {
  matchId: string;
  sessionNumber: number;
  clientId: string;
  source: ReportSource;
  satisfactionScore: number | null;
  /** 通常振り返り用。ロールプレイ行では空文字。 */
  answers: StandardAnswers;
  roleplayClient: RoleplayClientAnswers | null;
  /** パートナー未提出なら null */
  roleplayPartner: RoleplayPartnerAnswers | null;
  createdAt: string | null;
};

function emptyStandardAnswers(): StandardAnswers {
  return {
    insight: "",
    feeling: "",
    nextActions: "",
    satisfactionReason: "",
    other: "",
  };
}

function partnerCategoryAvgSummary(session: RoleplaySession): string {
  const avg = categoryAverages(session.partnerScores);
  const parts = ROLEPLAY_CATEGORIES.map((c) => {
    const v = avg[c.id];
    return v == null ? null : `${c.label} ${Math.round(v * 10) / 10}`;
  }).filter((x): x is string => Boolean(x));
  return parts.length > 0 ? parts.join(" / ") : "";
}

export function standardFeedbackToReportRow(
  fb: SessionFeedbackRow,
  clientId: string,
): AdminFeedbackReportRow {
  return {
    matchId: fb.matchId,
    sessionNumber: fb.sessionNumber,
    clientId,
    source: "standard",
    satisfactionScore: fb.satisfactionScore,
    answers: {
      insight: fb.answers.insight ?? "",
      feeling: fb.answers.feeling ?? "",
      nextActions: fb.answers.nextActions ?? "",
      satisfactionReason: fb.answers.satisfactionReason ?? "",
      other: fb.answers.other ?? "",
    },
    roleplayClient: null,
    roleplayPartner: null,
    createdAt: fb.createdAt ?? null,
  };
}

/**
 * クライアント提出済み（clientSubmittedAt）のみ対象。
 * パートナー自由記述・カテゴリ平均は partnerSubmittedAt があるときだけ付与。
 */
export function roleplaySessionToReportRow(
  store: RoleplayStore,
  session: RoleplaySession,
  clientId: string,
): AdminFeedbackReportRow | null {
  if (!session.clientSubmittedAt) return null;
  const partnerSubmitted = Boolean(session.partnerSubmittedAt);
  return {
    matchId: store.matchId,
    sessionNumber: session.round,
    clientId,
    source: "roleplay",
    satisfactionScore: session.sessionFeedback.satisfactionScore,
    answers: emptyStandardAnswers(),
    roleplayClient: {
      good: session.clientReflection.good,
      improve: session.clientReflection.improve,
      nextFocus: session.clientReflection.nextFocus,
      satisfactionReason: session.sessionFeedback.satisfactionReason,
    },
    roleplayPartner: partnerSubmitted
      ? {
          good: session.partnerFeedback.good,
          improve: session.partnerFeedback.improve,
          advice: session.partnerFeedback.advice,
          categoryAvgSummary: partnerCategoryAvgSummary(session),
        }
      : null,
    createdAt: session.clientSubmittedAt,
  };
}

/**
 * 通常振り返りとロールプレイをマージ。
 * 同一 matchId+sessionNumber が両方ある場合はロールプレイを優先（研修の当該回の正本）。
 */
export function mergeAdminFeedbackReportRows(
  standardRows: AdminFeedbackReportRow[],
  roleplayRows: AdminFeedbackReportRow[],
): AdminFeedbackReportRow[] {
  const byKey = new Map<string, AdminFeedbackReportRow>();
  for (const row of standardRows) {
    byKey.set(`${row.matchId}:${row.sessionNumber}`, row);
  }
  for (const row of roleplayRows) {
    byKey.set(`${row.matchId}:${row.sessionNumber}`, row);
  }
  return [...byKey.values()];
}
