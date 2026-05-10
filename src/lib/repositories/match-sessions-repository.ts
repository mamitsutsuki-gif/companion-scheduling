import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";

export type SessionPlanRow = {
  matchId: string;
  sessionNumber: number;
  /** 確定済みネゴシエーションがあるか */
  confirmed: boolean;
  /** 直近の確定 round（無ければ null） */
  round: number | null;
  startAt: string | null;
  endAt: string | null;
  negotiationId: string | null;
  /** 確定時にスナップショットされた Zoom URL（無ければ null） */
  zoomUrl: string | null;
  zoomPass: string | null;
};

type RawNeg = {
  id: string;
  matchId: string;
  status: string;
  sessionNumber: number;
  round: number;
  slots: Array<{ startAt: string; endAt: string; isConfirmed: boolean }>;
  confirmedZoomUrl: string | null;
  confirmedZoomPass: string | null;
};

async function loadConfirmedNegotiationsForMatch(matchId: string): Promise<RawNeg[]> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    const snap = await db
      .collection("negotiations")
      .where("matchId", "==", matchId)
      .where("status", "==", "CONFIRMED")
      .get();
    return snap.docs.map((d) => {
      const raw = d.data() as Record<string, unknown>;
      const slots = Array.isArray(raw.slots) ? (raw.slots as Record<string, unknown>[]) : [];
      return {
        id: d.id,
        matchId: String(raw.matchId ?? matchId),
        status: String(raw.status ?? "CONFIRMED"),
        sessionNumber: Math.max(1, Number(raw.sessionNumber ?? 1)),
        round: Number(raw.round ?? 1),
        slots: slots.map((s) => ({
          startAt: String(s.startAt ?? ""),
          endAt: String(s.endAt ?? ""),
          isConfirmed: Boolean(s.isConfirmed),
        })),
        confirmedZoomUrl: typeof raw.confirmedZoomUrl === "string" ? raw.confirmedZoomUrl : null,
        confirmedZoomPass: typeof raw.confirmedZoomPass === "string" ? raw.confirmedZoomPass : null,
      };
    });
  }
  const negs = await prisma.negotiation.findMany({
    where: { matchId, status: "CONFIRMED" },
    include: { slots: true },
  });
  return negs.map((n) => {
    const ext = n as unknown as {
      confirmedZoomUrl?: string | null;
      confirmedZoomPass?: string | null;
    };
    return {
      id: n.id,
      matchId: n.matchId,
      status: n.status,
      sessionNumber: n.sessionNumber ?? 1,
      round: n.round,
      slots: n.slots.map((s) => ({
        startAt: s.startAt.toISOString(),
        endAt: s.endAt.toISOString(),
        isConfirmed: s.isConfirmed,
      })),
      confirmedZoomUrl: ext.confirmedZoomUrl ?? null,
      confirmedZoomPass: ext.confirmedZoomPass ?? null,
    };
  });
}

export async function listSessionPlanForMatch(matchId: string): Promise<SessionPlanRow[]> {
  const settings = await getAppSettingsRow();
  const totalSessions = Math.max(1, Math.min(60, settings.totalSessions || 6));
  const negs = await loadConfirmedNegotiationsForMatch(matchId);

  const latestPerSession = new Map<number, RawNeg & { slot: { startAt: string; endAt: string } }>();
  for (const n of negs) {
    const slot = n.slots.find((s) => s.isConfirmed);
    if (!slot || !slot.startAt || !slot.endAt) continue;
    const prev = latestPerSession.get(n.sessionNumber);
    if (!prev || n.round > prev.round) {
      latestPerSession.set(n.sessionNumber, { ...n, slot });
    }
  }

  return Array.from({ length: totalSessions }, (_, i) => {
    const sessionNumber = i + 1;
    const found = latestPerSession.get(sessionNumber);
    return {
      matchId,
      sessionNumber,
      confirmed: Boolean(found),
      round: found?.round ?? null,
      startAt: found?.slot.startAt ?? null,
      endAt: found?.slot.endAt ?? null,
      negotiationId: found?.id ?? null,
      zoomUrl: found?.confirmedZoomUrl ?? null,
      zoomPass: found?.confirmedZoomPass ?? null,
    } satisfies SessionPlanRow;
  });
}

/**
 * セッション一覧の中から、ユーザーが「開く」ことを許可される回を判定。
 * - 過去（end <= now）: 全員許可
 * - 開始済みかつ未終了: 全員許可
 * - 未来: その回が「次回実施分（最も近い未来かつ確定済み）」のみ許可
 * - 未確定: 不可
 */
export function determineOpenableSessions(plan: SessionPlanRow[], now = new Date()): Set<number> {
  const openable = new Set<number>();
  let nextUpcoming: SessionPlanRow | null = null;

  for (const row of plan) {
    if (!row.confirmed || !row.startAt || !row.endAt) continue;
    const start = new Date(row.startAt);
    const end = new Date(row.endAt);
    if (end <= now) {
      openable.add(row.sessionNumber);
    } else if (start <= now && now < end) {
      openable.add(row.sessionNumber);
    } else if (start > now) {
      if (!nextUpcoming || new Date(nextUpcoming.startAt!) > start) nextUpcoming = row;
    }
  }
  if (nextUpcoming) openable.add(nextUpcoming.sessionNumber);
  return openable;
}
