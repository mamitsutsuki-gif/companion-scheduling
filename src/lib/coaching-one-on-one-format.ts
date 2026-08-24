import {
  MOTIVAGE_ONE_ON_ONE_STEP_IDS,
  type MotivageOneOnOneStepId,
} from "@/lib/motivage-one-on-one-model";

function trim(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

/** 将来の管理者設定用。型の参照UIとは別系統。 */
export type OneOnOneFormatFieldType = "text" | "textarea" | "select" | "number";

export type OneOnOneFormatField = {
  id: string;
  label: string;
  type: OneOnOneFormatFieldType;
  value: string;
  options?: string[];
  required?: boolean;
};

export type OneOnOneStepMemos = Partial<Record<MotivageOneOnOneStepId, string>>;

export type OneOnOneFormatDoc = {
  matchId: string;
  schemaVersion: number;
  fields: OneOnOneFormatField[];
  /** @deprecated 全体メモ。stepMemos へ移行。互換のため残す */
  notes: string;
  /** ①〜⑥ 各パートの型についてのメモ */
  stepMemos: OneOnOneStepMemos;
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

function normalizeStepMemos(input: unknown): OneOnOneStepMemos {
  const out: OneOnOneStepMemos = {};
  if (!input || typeof input !== "object") return out;
  const raw = input as Record<string, unknown>;
  for (const id of MOTIVAGE_ONE_ON_ONE_STEP_IDS) {
    if (typeof raw[id] === "string") {
      out[id] = trim(raw[id], 4000);
    }
  }
  return out;
}

export function normalizeOneOnOneFormat(matchId: string, input: unknown): OneOnOneFormatDoc {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const fields: OneOnOneFormatField[] = [];
  const arr = Array.isArray(raw.fields) ? raw.fields : [];
  for (let i = 0; i < arr.length && fields.length < 64; i++) {
    const f = normalizeFormatField(arr[i], `f-${i + 1}`);
    if (f) fields.push(f);
  }
  const stepMemos = normalizeStepMemos(raw.stepMemos);
  // 旧・全体メモのみある場合は icebreak に寄せない（混同防止）。notes として残す。
  return {
    matchId,
    schemaVersion:
      typeof raw.schemaVersion === "number" ? Math.max(1, Math.round(raw.schemaVersion)) : 2,
    fields,
    notes: trim(raw.notes, 4000),
    stepMemos,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}
