function trim(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export type SummaryReportDoc = {
  userId: string;
  companyId: string;
  coachComment: string;
  motiveSummary: string;
  recommendations: string;
  /** コメント3項目を上司・人事に公開した日時（ISO）。未設定時は後方互換ルールで判定。 */
  publishedAt: string | null;
  publishedBy: string;
  updatedAt: string;
  updatedBy: string;
};

export function normalizeSummaryReportDoc(
  userId: string,
  companyId: string,
  input: unknown,
  updatedBy = "",
): SummaryReportDoc {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const publishedAtRaw = raw.publishedAt;
  const publishedAt =
    typeof publishedAtRaw === "string" && publishedAtRaw.trim() !== "" ? publishedAtRaw.trim() : null;
  return {
    userId,
    companyId,
    coachComment: trim(raw.coachComment, 8000),
    motiveSummary: trim(raw.motiveSummary, 8000),
    recommendations: trim(raw.recommendations, 8000),
    publishedAt,
    publishedBy: trim(raw.publishedBy, 80),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    updatedBy: trim(raw.updatedBy, 80) || updatedBy,
  };
}

/** コメント3項目に入力があるか（空白のみは未入力扱い） */
export function summaryCommentsHasContent(doc: Pick<SummaryReportDoc, "coachComment" | "motiveSummary" | "recommendations">): boolean {
  return Boolean(doc.coachComment.trim() || doc.motiveSummary.trim() || doc.recommendations.trim());
}

/**
 * 上司・人事にコメント3項目を公開済みか。
 * 既存データ互換: publishedAt がなくても、いずれかのコメントが保存済みなら「提出済み」とみなす。
 */
export function isSummaryCommentsPublished(
  doc: Pick<SummaryReportDoc, "coachComment" | "motiveSummary" | "recommendations" | "publishedAt">,
): boolean {
  if (doc.publishedAt) return true;
  return summaryCommentsHasContent(doc);
}

/** 上司・人事向けにコメント3項目をマスク（集約セクションはそのまま） */
export function redactSummaryCommentsForSupervisor(doc: SummaryReportDoc): SummaryReportDoc {
  return {
    ...doc,
    coachComment: "",
    motiveSummary: "",
    recommendations: "",
  };
}

export type SummaryReportBundle = {
  targetName: string;
  skillCheck: unknown;
  pdca: unknown;
  reflection: unknown;
  lifeline: unknown;
  fta: unknown;
  adminDoc: SummaryReportDoc;
};
