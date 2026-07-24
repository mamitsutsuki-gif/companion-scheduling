import { addMinutes } from "date-fns";
import { z } from "zod";
import { readSession } from "@/lib/session";
import { getMatchIfAllowed } from "@/lib/match-access";
import { jsonError, jsonOk } from "@/lib/json";
import { getEffectiveAppSettingsForMatch } from "@/lib/effective-app-settings";
import { notifyMatchStakeholders } from "@/lib/notify-members";
import {
  createNegotiationRound,
  findLatestNegotiationForSession,
  blocksNewProposalForSession,
  listNegotiationsForMatch,
  markNegotiationSuperseded,
} from "@/lib/repositories/negotiation-repository";
import { createMessage } from "@/lib/repositories/message-repository";
import { appendAdminNotification } from "@/lib/repositories/admin-notification-repository";
import { appendMemberNotification } from "@/lib/repositories/member-notification-repository";
import { getUserMapByIds } from "@/lib/repositories/user-repository";
import { getMatchById } from "@/lib/repositories/match-repository";
import { isPartnerPendingMatch } from "@/lib/match-partner-pending";
import { formatJaDateTimeRange } from "@/lib/format-datetime";
import {
  generateSlotsFromTimeRanges,
  MAX_PROPOSAL_SLOTS,
  type TimeRangeInput,
} from "@/lib/generate-slots-from-ranges";
import { computeResponseDeadline } from "@/lib/negotiation-display";
import {
  isSlotStartOnPickerGrid,
  slotStartPickerStepLabel,
  slotStartPickerStepMinutes,
  validateSlotWindow,
} from "@/lib/slot-schedule";

const timeRangeSchema = z.object({
  dateYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

const rangesPayload = z.object({
  sessionNumber: z.number().int().min(1).optional(),
  /** 複数回分を同じ時間帯でまとめて提案（月額以外のマッチ日程調整） */
  sessionNumbers: z.array(z.number().int().min(1)).min(1).max(60).optional(),
  timeRanges: z.array(timeRangeSchema).min(1).max(14),
});

/** 後方互換: 旧来の starts / slots ペイロード */
const startsPayload = z.object({
  starts: z.array(z.string()).min(1).max(MAX_PROPOSAL_SLOTS),
  sessionNumber: z.number().int().min(1).optional(),
  sessionNumbers: z.array(z.number().int().min(1)).min(1).max(60).optional(),
});

const legacySlotsPayload = z.object({
  sessionNumber: z.number().int().min(1).optional(),
  sessionNumbers: z.array(z.number().int().min(1)).min(1).max(60).optional(),
  slots: z
    .array(z.object({ start: z.string(), end: z.string() }))
    .min(1)
    .max(MAX_PROPOSAL_SLOTS),
});

type RouteContext = { params: Promise<{ matchId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);

  const { matchId } = await context.params;
  const gate = await getMatchIfAllowed(matchId, { id: session.sub, role: session.role });
  if ("error" in gate) {
    const status = gate.error === "not_found" ? 404 : 403;
    return jsonError(status === 404 ? "見つかりません。" : "閲覧できません。", status);
  }

  if (isPartnerPendingMatch(gate.match)) {
    return jsonOk({ negotiations: [] });
  }

  const negotiations = await listNegotiationsForMatch(matchId);
  return jsonOk({ negotiations });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "PARTNER") return jsonError("パートナーのみ提案できます。", 403);

  const { matchId } = await context.params;
  const gate = await getMatchIfAllowed(matchId, { id: session.sub, role: session.role });
  if ("error" in gate) {
    const status = gate.error === "not_found" ? 404 : 403;
    return jsonError(status === 404 ? "見つかりません。" : "操作できません。", status);
  }
  if (isPartnerPendingMatch(gate.match)) {
    return jsonError("パートナーが決まるまで、日程調整はご利用いただけません。", 403);
  }

  const raw = await request.json().catch(() => null);
  const parsedRanges = rangesPayload.safeParse(raw);
  const parsedStarts = !parsedRanges.success ? startsPayload.safeParse(raw) : null;
  const parsedLegacy =
    !parsedRanges.success && (!parsedStarts || !parsedStarts.success)
      ? legacySlotsPayload.safeParse(raw)
      : null;

  if (!parsedRanges.success && (!parsedStarts || !parsedStarts.success) && (!parsedLegacy || !parsedLegacy.success)) {
    return jsonError("対応可能な時間帯を1件以上登録してください。");
  }

  const settings = await getEffectiveAppSettingsForMatch(matchId);
  const maxSessions = Math.max(1, settings.totalSessions);

  const rawSessionNumbers =
    (parsedRanges.success ? parsedRanges.data.sessionNumbers : undefined) ??
    (parsedStarts?.success ? parsedStarts.data.sessionNumbers : undefined) ??
    (parsedLegacy?.success ? parsedLegacy.data.sessionNumbers : undefined);
  const rawSessionNumber =
    (parsedRanges.success ? parsedRanges.data.sessionNumber : undefined) ??
    (parsedStarts?.success ? parsedStarts.data.sessionNumber : undefined) ??
    (parsedLegacy?.success ? parsedLegacy.data.sessionNumber : undefined) ??
    1;

  const sessionNumbers = [
    ...new Set(
      (rawSessionNumbers && rawSessionNumbers.length > 0 ? rawSessionNumbers : [rawSessionNumber]).map(
        (n) => Math.min(Math.max(1, n), maxSessions),
      ),
    ),
  ].sort((a, b) => a - b);

  if (sessionNumbers.length === 0) {
    return jsonError("対象の回を指定してください。");
  }

  const slotWindow = {
    slotDurationMinutes: settings.slotDurationMinutes,
    slotEarliestHour: settings.slotEarliestHour,
    slotLatestHour: settings.slotLatestHour,
    allowWeekends: settings.allowWeekends,
    timezone: settings.timezone || "Asia/Tokyo",
  };

  let slotData: { startAt: Date; endAt: Date }[] = [];
  let truncated = false;

  if (parsedRanges.success) {
    const generated = generateSlotsFromTimeRanges(
      parsedRanges.data.timeRanges as TimeRangeInput[],
      slotWindow,
    );
    slotData = generated.slots;
    truncated = generated.truncated;
    if (slotData.length === 0) {
      return jsonError("入力された時間帯から候補日時を生成できませんでした。日付・時刻をご確認ください。");
    }
  } else if (parsedStarts?.success) {
    for (const iso of parsedStarts.data.starts) {
      const start = new Date(iso);
      if (Number.isNaN(start.valueOf())) return jsonError("開始日時が不正です。");
      if (!isSlotStartOnPickerGrid(start, slotWindow)) {
        const step = slotStartPickerStepLabel(slotStartPickerStepMinutes(settings.slotDurationMinutes));
        return jsonError(`候補の開始時刻は ${step} 刻みで指定してください。`);
      }
      const end = addMinutes(start, settings.slotDurationMinutes);
      const v = validateSlotWindow(start, end, slotWindow);
      if (v) return jsonError(v);
      slotData.push({ startAt: start, endAt: end });
    }
  } else if (parsedLegacy?.success) {
    for (const row of parsedLegacy.data.slots) {
      const start = new Date(row.start);
      const end = new Date(row.end);
      if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || start >= end) {
        return jsonError("開始・終了の日時が不正です。");
      }
      const v = validateSlotWindow(start, end, slotWindow);
      if (v) return jsonError(v);
      slotData.push({ startAt: start, endAt: end });
    }
  }

  // 事前チェック: 進行中の回はまとめ提案に含めない（他の回は妨げない）
  for (const sessionNumber of sessionNumbers) {
    const latestForSession = await findLatestNegotiationForSession(matchId, sessionNumber);
    if (latestForSession && blocksNewProposalForSession(latestForSession.status)) {
      return jsonError(
        `第${sessionNumber}回は進行中の日程調整があるため、新しい提案を出せません。先にその回の回答・確定を進めるか、対象から外してください。`,
        409,
      );
    }
  }

  const proposedAt = new Date();
  const responseDeadline = computeResponseDeadline(proposedAt, slotWindow.timezone);
  const created = [];

  for (const sessionNumber of sessionNumbers) {
    const latestForSession = await findLatestNegotiationForSession(matchId, sessionNumber);
    if (latestForSession?.status === "NEEDS_NEW_PROPOSAL") {
      await markNegotiationSuperseded(latestForSession.id);
    }
    const round = latestForSession ? latestForSession.round + 1 : 1;
    // NEEDS_NEW_PROPOSAL を SUPERSEDED した直後は同じ round+1 でよい（上で supersede 済み）
    const negotiation = await createNegotiationRound({
      matchId,
      sessionNumber,
      round,
      slotData,
      responseDeadline,
    });
    created.push(negotiation);

    const payload = {
      negotiationId: negotiation.id,
      sessionNumber,
      round: negotiation.round,
      durationMinutes: settings.slotDurationMinutes,
      timezone: settings.timezone,
      slots: negotiation.slots.map((s: { id: string; startAt: string; endAt: string }) => ({
        id: s.id,
        start: s.startAt,
        end: s.endAt,
      })),
    };

    const bodyShort = `${sessionNumber}回目の候補日時 Round ${negotiation.round}（各 ${settings.slotDurationMinutes} 分 × ${negotiation.slots.length} 件）`;

    await createMessage({
      matchId,
      senderId: session.sub,
      body: bodyShort,
      kind: "SLOT_PROPOSAL",
      payload,
    });

    const displayTz = settings.timezone || "Asia/Tokyo";
    const lines = negotiation.slots
      .slice(0, 10)
      .map(
        (slot: { startAt: string; endAt: string }, i: number) =>
          `${i + 1}. ${formatJaDateTimeRange(slot.startAt, slot.endAt, displayTz)}`,
      )
      .join("\n");
    const moreLine =
      negotiation.slots.length > 10 ? `\n…他 ${negotiation.slots.length - 10} 件（アプリでご確認ください）` : "";

    await notifyMatchStakeholders(matchId, {
      appOrigin: new URL(request.url).origin,
      subject: `${sessionNumber}回目の候補日時 Round ${negotiation.round} が届きました`,
      text: `${bodyShort}\n\n${lines}${moreLine}\n\nアプリの「日程調整」タブからご都合の良い日時を選択してください。`,
      excludeUserId: session.sub,
    });

    const senderMap = await getUserMapByIds([session.sub]);
    const sender = senderMap.get(session.sub);
    await appendAdminNotification({
      type: "SLOT_PROPOSED",
      matchId,
      sessionNumber,
      actorUserId: session.sub,
      actorRole: session.role,
      summary: `${sender?.displayName ?? "パートナー"}さんが ${sessionNumber} 回目の候補日時（Round ${negotiation.round}）を提示しました。`,
      link: `/match/${matchId}#schedule`,
    });

    const matchInfo = await getMatchById(matchId).catch(() => null);
    if (matchInfo?.client?.id) {
      await appendMemberNotification({
        recipientUserId: matchInfo.client.id,
        type: "SLOT_PROPOSED",
        matchId,
        sessionNumber,
        actorUserId: session.sub,
        actorRole: session.role,
        summary: `${sender?.displayName ?? "パートナー"}さんから ${sessionNumber} 回目のご案内可能な日時が届きました。日程調整タブからご回答ください。`,
        link: `/match/${matchId}#schedule`,
      });
    }
  }

  const first = created[0]!;
  return jsonOk({
    ok: true,
    negotiation: first,
    negotiations: created,
    sessionNumbers,
    truncated,
    slotCount: first.slots.length,
  });
}
