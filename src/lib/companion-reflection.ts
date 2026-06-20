function trim(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export type ReflectionSheet = {
  userId: string;
  companyId: string;
  changedThrough: string;
  becameAbleTo: string;
  behaviorChanged: string;
  relationshipChanged: string;
  continueDoing: string;
  growFurther: string;
  memorablePdca: string;
  meaningfulSession: string;
  updatedAt: string;
};

export function normalizeReflectionSheet(
  userId: string,
  companyId: string,
  input: unknown,
): ReflectionSheet {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    userId,
    companyId,
    changedThrough: trim(raw.changedThrough, 4000),
    becameAbleTo: trim(raw.becameAbleTo, 4000),
    behaviorChanged: trim(raw.behaviorChanged, 4000),
    relationshipChanged: trim(raw.relationshipChanged, 4000),
    continueDoing: trim(raw.continueDoing, 4000),
    growFurther: trim(raw.growFurther, 4000),
    memorablePdca: trim(raw.memorablePdca, 4000),
    meaningfulSession: trim(raw.meaningfulSession, 4000),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export const REFLECTION_FIELDS: Array<{ key: keyof ReflectionSheet; label: string }> = [
  { key: "changedThrough", label: "活動を通じて変化したこと" },
  { key: "becameAbleTo", label: "できるようになったこと" },
  { key: "behaviorChanged", label: "行動が変わったこと" },
  { key: "relationshipChanged", label: "周囲との関係性の変化" },
  { key: "continueDoing", label: "今後も継続したいこと" },
  { key: "growFurther", label: "今後さらに伸ばしたいこと" },
  { key: "memorablePdca", label: "自分にとって印象に残っているPDCA" },
  { key: "meaningfulSession", label: "自分にとって意味があったセッション内容" },
];
