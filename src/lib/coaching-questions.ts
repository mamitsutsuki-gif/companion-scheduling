import { nanoid } from "nanoid";

function trim(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export type QuestionQuadrant =
  | "both_know"
  | "report_knows"
  | "manager_knows"
  | "neither_knows"
  | "unassigned";

export const QUESTION_QUADRANTS: Array<{ id: QuestionQuadrant; label: string; name: string; short: string }> = [
  {
    id: "both_know",
    label: "部下が答えを知っている × 上司が答えを知っている",
    name: "前提確認の質問",
    short: "前提確認",
  },
  {
    id: "report_knows",
    label: "部下が答えを知っている × 上司が答えを知らない",
    name: "情報収集の質問",
    short: "情報収集",
  },
  {
    id: "manager_knows",
    label: "部下が答えを知らない × 上司が答えを知っている",
    name: "誘導の質問",
    short: "誘導",
  },
  {
    id: "neither_knows",
    label: "部下が答えを知らない × 上司が答えを知らない",
    name: "効果的な質問",
    short: "効果的",
  },
];

export type CoachingQuestion = {
  id: string;
  text: string;
  purpose: string;
  memo: string;
  quadrant: QuestionQuadrant;
  createdAt: string;
  updatedAt: string;
};

export type CoachingQuestionStore = {
  userId: string;
  companyId: string;
  questions: CoachingQuestion[];
  updatedAt: string;
};

export function normalizeQuadrant(input: unknown): QuestionQuadrant {
  if (input === "both_know" || input === "report_knows" || input === "manager_knows" || input === "neither_knows") {
    return input;
  }
  return "unassigned";
}

export function normalizeQuestion(input: unknown, fallbackId: string): CoachingQuestion | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const text = trim(raw.text, 2000);
  if (!text) return null;
  const id = trim(raw.id, 80) || fallbackId;
  return {
    id,
    text,
    purpose: trim(raw.purpose, 2000),
    memo: trim(raw.memo, 2000),
    quadrant: normalizeQuadrant(raw.quadrant),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export function normalizeQuestionStore(userId: string, companyId: string, input: unknown): CoachingQuestionStore {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const questions: CoachingQuestion[] = [];
  const arr = Array.isArray(raw.questions) ? raw.questions : [];
  const seen = new Set<string>();
  for (let i = 0; i < arr.length && questions.length < 200; i++) {
    const q = normalizeQuestion(arr[i], `q-${i + 1}`);
    if (!q || seen.has(q.id)) continue;
    seen.add(q.id);
    questions.push(q);
  }
  return {
    userId,
    companyId,
    questions,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export function newQuestionId() {
  return `q-${nanoid(10)}`;
}
