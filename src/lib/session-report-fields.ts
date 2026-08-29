export type SessionReportAnswerKey =
  | "sessionTheme"
  | "clientCurrentFocus"
  | "clientSmallChange"
  | "partnerReflection"
  | "partnerMemo";

export type SessionReportAnswers = Record<SessionReportAnswerKey, string>;

export const SESSION_REPORT_MOTIVEAGE_NOTICE =
  "共有されるのはモチベイジです。ご本人やクライアント管理者にダイレクトに公開されるものではありません。";

export const SESSION_REPORT_FIELDS: Array<{
  key: SessionReportAnswerKey;
  label: string;
  required: boolean;
  hint?: string;
  rows?: number;
}> = [
  { key: "sessionTheme", label: "今回扱ったテーマ", required: true, rows: 3 },
  { key: "clientCurrentFocus", label: "本人が現在取り組んでいること", required: true, rows: 3 },
  {
    key: "clientSmallChange",
    label: "本人の小さな変化（あればでOK）",
    required: false,
    rows: 3,
  },
  {
    key: "partnerReflection",
    label: "パートナーとしての所感",
    required: true,
    rows: 6,
    hint: "目安: 200字程度",
  },
  {
    key: "partnerMemo",
    label: "メモ（ご自身のメモ欄としてお使いください）",
    required: false,
    rows: 4,
  },
];

const STRUCTURED_KEYS = new Set<SessionReportAnswerKey>(
  SESSION_REPORT_FIELDS.map((f) => f.key),
);

export function emptySessionReportAnswers(): SessionReportAnswers {
  return {
    sessionTheme: "",
    clientCurrentFocus: "",
    clientSmallChange: "",
    partnerReflection: "",
    partnerMemo: "",
  };
}

function trimField(value: unknown, max = 4000): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function parseSessionReportAnswers(input: {
  reflection?: string;
  extraAnswers?: Record<string, string>;
}): SessionReportAnswers {
  const extra = input.extraAnswers ?? {};
  const partnerReflection =
    trimField(extra.partnerReflection) || trimField(input.reflection);
  return {
    sessionTheme: trimField(extra.sessionTheme),
    clientCurrentFocus: trimField(extra.clientCurrentFocus),
    clientSmallChange: trimField(extra.clientSmallChange),
    partnerReflection,
    partnerMemo: trimField(extra.partnerMemo),
  };
}

export function parsePartnerQuestionAnswers(
  extraAnswers: Record<string, string> | undefined,
): Record<number, string> {
  const out: Record<number, string> = {};
  if (!extraAnswers) return out;
  for (const [k, v] of Object.entries(extraAnswers)) {
    if (/^\d+$/.test(k)) out[Number(k)] = v;
  }
  return out;
}

export function isStructuredSessionReportKey(key: string): boolean {
  return STRUCTURED_KEYS.has(key as SessionReportAnswerKey);
}

export function mergeSessionReportExtraAnswers(
  answers: SessionReportAnswers,
  partnerQuestionAnswers: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of SESSION_REPORT_FIELDS) {
    const value = trimField(answers[field.key]);
    if (value) out[field.key] = value;
  }
  for (const [k, v] of Object.entries(partnerQuestionAnswers)) {
    if (/^\d+$/.test(k)) out[k] = trimField(v);
  }
  return out;
}

export function validateSessionReportAnswers(
  answers: SessionReportAnswers,
): string | null {
  for (const field of SESSION_REPORT_FIELDS) {
    if (!field.required) continue;
    if (!trimField(answers[field.key])) {
      return `「${field.label}」を入力してください。`;
    }
  }
  return null;
}
