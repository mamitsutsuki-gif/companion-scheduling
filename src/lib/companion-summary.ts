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
  return {
    userId,
    companyId,
    coachComment: trim(raw.coachComment, 8000),
    motiveSummary: trim(raw.motiveSummary, 8000),
    recommendations: trim(raw.recommendations, 8000),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    updatedBy: trim(raw.updatedBy, 80) || updatedBy,
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
