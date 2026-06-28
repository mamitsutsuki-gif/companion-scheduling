import { addMinutes } from "date-fns";
import { z } from "zod";
import { readSession } from "@/lib/session";
import { getMatchIfAllowed } from "@/lib/match-access";
import { jsonError, jsonOk } from "@/lib/json";
import { getEffectiveAppSettingsForMatch } from "@/lib/effective-app-settings";
import { notifyMatchStakeholders } from "@/lib/notify-members";
import {
  createNegotiationRound,
  findLatestNegotiation,
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
  timeRanges: z.array(timeRangeSchema).min(1).max(14),
});

/** 後方互換: 旧来の starts / slots ペイロード */
const startsPayload = z.object({
  starts: z.array(z.string()).min(1).max(MAX_PROPOSAL_SLOTS),
  sessionNumber: z.number().int().min(1).optional(),
});

const legacySlotsPayload = z.object({
  sessionNumber: z.number().int().min(1).optional(),
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

  const latest = await findLatestNegotiation(matchId);
  if (latest && latest.status !== "CONFIRMED" && latest.status !== "NEEDS_NEW_PROPOSAL") {
    return jsonError("進行中の日程調整があるため新しい提案を出せません。", 409);
  }
  if (latest?.status === "NEEDS_NEW_PROPOSAL") {
    await markNegotiationSuperseded(latest.id);
  }

  const settings = await getEffectiveAppSettingsForMatch(matchId);
  const sessionNumberRaw =
    (parsedRanges.success ? parsedRanges.data.sessionNumber : undefined) ??
    (parsedStarts?.success ? parsedStarts.data.sessionNumber : undefined) ??
    (parsedLegacy?.success ? parsedLegacy.data.sessionNumber : undefined) ??
    1;
  const sessionNumber = Math.min(Math.max(1, sessionNumberRaw), Math.max(1, settings.totalSessions));

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

  const round = latest ? latest.round + 1 : 1;
  const proposedAt = new Date();
  const responseDeadline = computeResponseDeadline(proposedAt, slotWindow.timezone);

  const negotiation = await createNegotiationRound({
    matchId,
    sessionNumber,
    round,
    slotData,
    responseDeadline,
  });

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

  return jsonOk({ ok: true, negotiation, truncated, slotCount: negotiation.slots.length });
}
