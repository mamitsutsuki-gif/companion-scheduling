import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { getEffectiveAppSettingsForMatch } from "@/lib/effective-app-settings";

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
  /** 確定時にスナップショットされた会議 URL（無ければ null） */
  zoomUrl: string | null;
  zoomMeetingId: string | null;
  zoomPass: string | null;
  /** 確定時の会議プロバイダ（無ければ URL から推定） */
  meetingProvider: "zoom" | "google_meet" | null;
};

type RawNeg = {
  id: string;
  matchId: string;
  status: string;
  sessionNumber: number;
  round: number;
  slots: Array<{ startAt: string; endAt: string; isConfirmed: boolean }>;
  confirmedZoomUrl: string | null;
  confirmedZoomMeetingId: string | null;
  confirmedZoomPass: string | null;
  confirmedMeetingProvider: "zoom" | "google_meet" | null;
};

function inferMeetingProvider(
  provider: unknown,
  joinUrl: string | null,
): "zoom" | "google_meet" | null {
  if (provider === "google_meet" || provider === "zoom") return provider;
  if (!joinUrl) return null;
  const lower = joinUrl.toLowerCase();
  if (lower.includes("meet.google.com")) return "google_meet";
  if (lower.includes("zoom.us") || lower.includes("zoom.com")) return "zoom";
  return null;
}

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
      const confirmedZoomUrl = typeof raw.confirmedZoomUrl === "string" ? raw.confirmedZoomUrl : null;
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
        confirmedZoomUrl,
        confirmedZoomMeetingId:
          typeof raw.confirmedZoomMeetingId === "string" ? raw.confirmedZoomMeetingId : null,
        confirmedZoomPass: typeof raw.confirmedZoomPass === "string" ? raw.confirmedZoomPass : null,
        confirmedMeetingProvider: inferMeetingProvider(raw.confirmedMeetingProvider, confirmedZoomUrl),
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
      confirmedZoomMeetingId?: string | null;
      confirmedZoomPass?: string | null;
      confirmedMeetingProvider?: string | null;
    };
    const confirmedZoomUrl = ext.confirmedZoomUrl ?? null;
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
      confirmedZoomUrl,
      confirmedZoomMeetingId: ext.confirmedZoomMeetingId ?? null,
      confirmedZoomPass: ext.confirmedZoomPass ?? null,
      confirmedMeetingProvider: inferMeetingProvider(ext.confirmedMeetingProvider, confirmedZoomUrl),
    };
  });
}

export async function listSessionPlanForMatch(matchId: string): Promise<SessionPlanRow[]> {
  // 企業ごとに「総セッション数」を上書きしている場合は、そちらを優先する。
  const settings = await getEffectiveAppSettingsForMatch(matchId);
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
      zoomMeetingId: found?.confirmedZoomMeetingId ?? null,
      zoomPass: found?.confirmedZoomPass ?? null,
      meetingProvider: found?.confirmedMeetingProvider ?? null,
    } satisfies SessionPlanRow;
  });
}

/**
 * セッション一覧の中から、ユーザーが「開く」ことを許可される回を判定。
 * - 過去（end <= now）: 許可
 * - 開始済みかつ未終了（実施中）: 許可
 * - 未来・未確定: 不可
 */
export function determineOpenableSessions(plan: SessionPlanRow[], now = new Date()): Set<number> {
  const openable = new Set<number>();

  for (const row of plan) {
    if (!row.confirmed || !row.startAt || !row.endAt) continue;
    const start = new Date(row.startAt);
    const end = new Date(row.endAt);
    if (end <= now) {
      openable.add(row.sessionNumber);
    } else if (start <= now && now < end) {
      openable.add(row.sessionNumber);
    }
  }
  return openable;
}
