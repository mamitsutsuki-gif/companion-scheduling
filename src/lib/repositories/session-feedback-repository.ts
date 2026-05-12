import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";

export type SessionFeedbackAnswers = {
  insight?: string;
  feeling?: string;
  nextActions?: string;
  satisfactionReason?: string;
  other?: string;
};

/**
 * 管理者が「企業ごとの設定 → クライアント振り返りの追加質問」で
 * 設定した自由設問の回答。key は設問のインデックスを文字列化したもの（"0","1",…）。
 * SessionReport.extraAnswers と同じ形に揃えてある。
 */
export type SessionFeedbackExtraAnswers = Record<string, string>;

export type PartnerChangeChoice = "continue" | "undecided" | "want_change";

export type SessionFeedbackRow = {
  id: string;
  matchId: string;
  sessionNumber: number;
  clientId: string;
  answers: SessionFeedbackAnswers;
  extraAnswers: SessionFeedbackExtraAnswers;
  satisfactionScore: number | null;
  partnerChange: PartnerChangeChoice | null;
  createdAt: string;
  updatedAt: string;
};

function docId(matchId: string, sessionNumber: number) {
  return `${matchId}_${sessionNumber}`;
}

function normalizeAnswers(input: unknown): SessionFeedbackAnswers {
  if (!input || typeof input !== "object") return {};
  const v = input as Record<string, unknown>;
  const pick = (k: string) =>
    typeof v[k] === "string" ? String(v[k]).slice(0, 4000) : undefined;
  return {
    insight: pick("insight"),
    feeling: pick("feeling"),
    nextActions: pick("nextActions"),
    satisfactionReason: pick("satisfactionReason"),
    other: pick("other"),
  };
}

function normalizePartnerChange(input: unknown): PartnerChangeChoice | null {
  return input === "continue" || input === "undecided" || input === "want_change"
    ? input
    : null;
}

function normalizeExtraAnswers(input: unknown): SessionFeedbackExtraAnswers {
  if (!input || typeof input !== "object") return {};
  const out: SessionFeedbackExtraAnswers = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const key = String(k);
    if (!/^\d+$/.test(key)) continue;
    if (typeof v !== "string") continue;
    const trimmed = v.slice(0, 4000);
    out[key] = trimmed;
  }
  return out;
}

export async function getSessionFeedback(
  matchId: string,
  sessionNumber: number,
): Promise<SessionFeedbackRow | null> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const snap = await db.collection("sessionFeedbacks").doc(docId(matchId, sessionNumber)).get();
    if (!snap.exists) return null;
    const raw = snap.data() as Record<string, unknown>;
    return {
      id: snap.id,
      matchId,
      sessionNumber,
      clientId: String(raw.clientId ?? ""),
      answers: normalizeAnswers(raw.answers),
      extraAnswers: normalizeExtraAnswers(raw.extraAnswers),
      satisfactionScore:
        typeof raw.satisfactionScore === "number" ? raw.satisfactionScore : null,
      partnerChange: normalizePartnerChange(raw.partnerChange),
      createdAt: String(raw.createdAt ?? new Date().toISOString()),
      updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
    };
  }
  const delegate = (
    prisma as unknown as { sessionFeedback?: { findUnique?: Function } }
  ).sessionFeedback;
  if (!delegate?.findUnique) return null;
  const row = (await delegate.findUnique({
    where: { matchId_sessionNumber: { matchId, sessionNumber } },
  })) as Record<string, unknown> | null;
  if (!row) return null;
  return {
    id: String(row.id),
    matchId: String(row.matchId),
    sessionNumber: Number(row.sessionNumber),
    clientId: String(row.clientId ?? ""),
    answers: normalizeAnswers(row.answers),
    extraAnswers: normalizeExtraAnswers(row.extraAnswers),
    satisfactionScore:
      typeof row.satisfactionScore === "number" ? row.satisfactionScore : null,
    partnerChange: normalizePartnerChange(row.partnerChange),
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt ?? new Date().toISOString()),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt ?? new Date().toISOString()),
  };
}

export async function listSessionFeedbacksForMatch(
  matchId: string,
): Promise<SessionFeedbackRow[]> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    const snap = await db
      .collection("sessionFeedbacks")
      .where("matchId", "==", matchId)
      .get();
    return snap.docs
      .map((d) => {
        const raw = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          matchId,
          sessionNumber: Number(raw.sessionNumber ?? 0),
          clientId: String(raw.clientId ?? ""),
          answers: normalizeAnswers(raw.answers),
          extraAnswers: normalizeExtraAnswers(raw.extraAnswers),
          satisfactionScore:
            typeof raw.satisfactionScore === "number" ? raw.satisfactionScore : null,
          partnerChange: normalizePartnerChange(raw.partnerChange),
          createdAt: String(raw.createdAt ?? new Date().toISOString()),
          updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
        } as SessionFeedbackRow;
      })
      .sort((a, b) => a.sessionNumber - b.sessionNumber);
  }
  const delegate = (
    prisma as unknown as { sessionFeedback?: { findMany?: Function } }
  ).sessionFeedback;
  if (!delegate?.findMany) return [];
  const rows = (await delegate.findMany({
    where: { matchId },
    orderBy: { sessionNumber: "asc" },
  })) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    matchId: String(row.matchId),
    sessionNumber: Number(row.sessionNumber),
    clientId: String(row.clientId ?? ""),
    answers: normalizeAnswers(row.answers),
    extraAnswers: normalizeExtraAnswers(row.extraAnswers),
    satisfactionScore:
      typeof row.satisfactionScore === "number" ? row.satisfactionScore : null,
    partnerChange: normalizePartnerChange(row.partnerChange),
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt ?? new Date().toISOString()),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt ?? new Date().toISOString()),
  }));
}

/**
 * 全ての SessionFeedback を取得（管理者レポート用）。
 * クライアント単位や期間でのフィルタは呼び出し側で行う。
 */
export async function listAllSessionFeedbacks(): Promise<SessionFeedbackRow[]> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    const snap = await db.collection("sessionFeedbacks").get();
    return snap.docs.map((d) => {
      const raw = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        matchId: String(raw.matchId ?? ""),
        sessionNumber: Number(raw.sessionNumber ?? 0),
        clientId: String(raw.clientId ?? ""),
        answers: normalizeAnswers(raw.answers),
        extraAnswers: normalizeExtraAnswers(raw.extraAnswers),
        satisfactionScore:
          typeof raw.satisfactionScore === "number" ? raw.satisfactionScore : null,
        partnerChange: normalizePartnerChange(raw.partnerChange),
        createdAt: String(raw.createdAt ?? new Date().toISOString()),
        updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
      };
    });
  }
  const delegate = (
    prisma as unknown as { sessionFeedback?: { findMany?: Function } }
  ).sessionFeedback;
  if (!delegate?.findMany) return [];
  const rows = (await delegate.findMany({
    orderBy: { createdAt: "desc" },
  })) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    matchId: String(row.matchId),
    sessionNumber: Number(row.sessionNumber),
    clientId: String(row.clientId ?? ""),
    answers: normalizeAnswers(row.answers),
    extraAnswers: normalizeExtraAnswers(row.extraAnswers),
    satisfactionScore:
      typeof row.satisfactionScore === "number" ? row.satisfactionScore : null,
    partnerChange: normalizePartnerChange(row.partnerChange),
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt ?? new Date().toISOString()),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt ?? new Date().toISOString()),
  }));
}

export async function upsertSessionFeedback(input: {
  matchId: string;
  sessionNumber: number;
  clientId: string;
  answers: SessionFeedbackAnswers;
  extraAnswers?: SessionFeedbackExtraAnswers;
  satisfactionScore: number | null;
  partnerChange: PartnerChangeChoice | null;
}): Promise<SessionFeedbackRow> {
  const answers = normalizeAnswers(input.answers);
  const extraAnswers = normalizeExtraAnswers(input.extraAnswers ?? {});
  const partnerChange = normalizePartnerChange(input.partnerChange);
  const satisfactionScore =
    input.satisfactionScore == null
      ? null
      : Math.max(1, Math.min(10, Math.round(Number(input.satisfactionScore))));
  const now = new Date().toISOString();

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) throw new Error("Firestore is not configured");
    const ref = db.collection("sessionFeedbacks").doc(docId(input.matchId, input.sessionNumber));
    const existing = await ref.get();
    const createdAt = existing.exists
      ? String((existing.data() as Record<string, unknown>).createdAt ?? now)
      : now;
    const data = {
      matchId: input.matchId,
      sessionNumber: input.sessionNumber,
      clientId: input.clientId,
      answers,
      extraAnswers,
      satisfactionScore,
      partnerChange,
      createdAt,
      updatedAt: now,
    };
    await ref.set(data, { merge: true });
    return {
      id: ref.id,
      ...data,
    };
  }

  const delegate = (
    prisma as unknown as { sessionFeedback?: { upsert?: Function } }
  ).sessionFeedback;
  if (!delegate?.upsert) {
    throw new Error("SessionFeedback model is not available in Prisma client");
  }
  // Prisma 経路では `extraAnswers` カラムが無いケースを許容。
  // Firebase 経路が本番なので、まずは extraAnswers 付きで試し、ダメなら除外して再試行。
  let row: Record<string, unknown>;
  try {
    row = (await delegate.upsert({
      where: { matchId_sessionNumber: { matchId: input.matchId, sessionNumber: input.sessionNumber } },
      create: {
        matchId: input.matchId,
        sessionNumber: input.sessionNumber,
        clientId: input.clientId,
        answers,
        extraAnswers,
        satisfactionScore,
        partnerChange,
      },
      update: {
        answers,
        extraAnswers,
        satisfactionScore,
        partnerChange,
      },
    })) as Record<string, unknown>;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("Unknown argument `extraAnswers`") ||
        error.message.includes("no such column"))
    ) {
      row = (await delegate.upsert({
        where: { matchId_sessionNumber: { matchId: input.matchId, sessionNumber: input.sessionNumber } },
        create: {
          matchId: input.matchId,
          sessionNumber: input.sessionNumber,
          clientId: input.clientId,
          answers,
          satisfactionScore,
          partnerChange,
        },
        update: {
          answers,
          satisfactionScore,
          partnerChange,
        },
      })) as Record<string, unknown>;
    } else {
      throw error;
    }
  }
  return {
    id: String(row.id),
    matchId: String(row.matchId),
    sessionNumber: Number(row.sessionNumber),
    clientId: String(row.clientId),
    answers,
    extraAnswers,
    satisfactionScore,
    partnerChange,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt ?? now),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt ?? now),
  };
}
