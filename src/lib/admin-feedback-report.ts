import type { RoleplaySession } from "@/lib/coaching-roleplay";
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
  satisfactionReason: string;
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
    createdAt: fb.createdAt ?? null,
  };
}

/**
 * クライアント提出済み（clientSubmittedAt）のみ対象。
 * パートナーコメント・カテゴリ点数はレポートに含めない。
 */
export function roleplaySessionToReportRow(
  store: RoleplayStore,
  session: RoleplaySession,
  clientId: string,
): AdminFeedbackReportRow | null {
  if (!session.clientSubmittedAt) return null;
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
      satisfactionReason: session.sessionFeedback.satisfactionReason,
    },
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
