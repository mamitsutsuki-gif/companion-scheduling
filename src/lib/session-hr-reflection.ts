import type { SessionFeedbackRow } from "@/lib/repositories/session-feedback-repository";

/** 個別伴走の通常フィードバックが、人事公開に必要な必須項目を満たしているか */
export function isStandardFeedbackReadyForHrPublish(
  row: SessionFeedbackRow | null,
): boolean {
  if (!row) return false;
  const a = row.answers;
  const score = row.satisfactionScore;
  return (
    Boolean(a.insight?.trim()) &&
    Boolean(a.feeling?.trim()) &&
    Boolean(a.nextActions?.trim()) &&
    Boolean(a.satisfactionReason?.trim()) &&
    typeof score === "number" &&
    score >= 1 &&
    score <= 10 &&
    (row.partnerChange === "continue" ||
      row.partnerChange === "undecided" ||
      row.partnerChange === "want_change")
  );
}

/** 人事向けに返す個別伴走フィードバック本文（ガイドライン・チャット・パートナーレポート・変更希望は含めない） */
export function standardFeedbackHrReflectionPayload(row: SessionFeedbackRow) {
  return {
    insight: row.answers.insight ?? "",
    feeling: row.answers.feeling ?? "",
    nextActions: row.answers.nextActions ?? "",
    satisfactionScore: row.satisfactionScore,
    satisfactionReason: row.answers.satisfactionReason ?? "",
    other: row.answers.other ?? "",
    extraAnswers: row.extraAnswers ?? {},
  };
}
