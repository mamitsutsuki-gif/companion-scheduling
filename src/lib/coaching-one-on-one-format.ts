function trim(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

/** 将来の管理者設定用。現時点はプレースホルダーのみ。 */
export type OneOnOneFormatFieldType = "text" | "textarea" | "select" | "number";

export type OneOnOneFormatField = {
  id: string;
  label: string;
  type: OneOnOneFormatFieldType;
  value: string;
  options?: string[];
  required?: boolean;
};

export type OneOnOneFormatDoc = {
  matchId: string;
  schemaVersion: number;
  fields: OneOnOneFormatField[];
  notes: string;
  updatedAt: string;
};

export function normalizeFormatField(input: unknown, fallbackId: string): OneOnOneFormatField | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const label = trim(raw.label, 200);
  if (!label) return null;
  const typeRaw = raw.type;
  const type: OneOnOneFormatFieldType =
    typeRaw === "textarea" || typeRaw === "select" || typeRaw === "number" ? typeRaw : "text";
  return {
    id: trim(raw.id, 80) || fallbackId,
    label,
    type,
    value: trim(raw.value, 8000),
    options: Array.isArray(raw.options)
      ? raw.options.map((o) => trim(o, 200)).filter(Boolean).slice(0, 32)
      : undefined,
    required: raw.required === true,
  };
}

export function normalizeOneOnOneFormat(matchId: string, input: unknown): OneOnOneFormatDoc {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const fields: OneOnOneFormatField[] = [];
  const arr = Array.isArray(raw.fields) ? raw.fields : [];
  for (let i = 0; i < arr.length && fields.length < 64; i++) {
    const f = normalizeFormatField(arr[i], `f-${i + 1}`);
    if (f) fields.push(f);
  }
  return {
    matchId,
    schemaVersion: typeof raw.schemaVersion === "number" ? Math.max(1, Math.round(raw.schemaVersion)) : 1,
    fields,
    notes: trim(raw.notes, 4000),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}
