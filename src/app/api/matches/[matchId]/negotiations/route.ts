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

const startsPayload = z.object({
  starts: z.array(z.string()).min(3).max(5),
  sessionNumber: z.number().int().min(1).optional(),
});

const legacySlotsPayload = z.object({
  sessionNumber: z.number().int().min(1).optional(),
  slots: z
    .array(
      z.object({
        start: z.string(),
        end: z.string(),
      }),
    )
    .min(3)
    .max(5),
});

function formatJpRange(start: Date, end: Date) {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("ja-JP", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  return `${fmt(start)}〜${fmt(end)}`;
}

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

  const raw = await request.json().catch(() => null);
  const parsedStarts = startsPayload.safeParse(raw);
  const parsedLegacy = !parsedStarts.success ? legacySlotsPayload.safeParse(raw) : null;

  if (!parsedStarts.success && (!parsedLegacy || !parsedLegacy.success)) {
    return jsonError("候補は3〜5件。開始時刻のみ（starts）または従来の開始・終了ペアで送ってください。");
  }

  const latest = await findLatestNegotiation(matchId);

  if (latest && latest.status !== "CONFIRMED" && latest.status !== "NEEDS_NEW_PROPOSAL") {
    return jsonError("進行中の日程調整があるため新しい提案を出せません。", 409);
  }

  if (latest?.status === "NEEDS_NEW_PROPOSAL") {
    await markNegotiationSuperseded(latest.id);
  }

  // この match のクライアントが所属する企業の実効設定を読む。
  // 企業上書きが無ければグローバル設定にフォールバックするので従来挙動と互換。
  const settings = await getEffectiveAppSettingsForMatch(matchId);
  const sessionNumberRaw =
    (parsedStarts.success ? parsedStarts.data.sessionNumber : undefined) ??
    (parsedLegacy?.success ? parsedLegacy.data.sessionNumber : undefined) ??
    1;
  const sessionNumber = Math.min(Math.max(1, sessionNumberRaw), Math.max(1, settings.totalSessions));
  const slotData: { startAt: Date; endAt: Date }[] = [];

  function validateWithinAllowedWindow(start: Date, end: Date) {
    // 表示・案内 TZ で見たときに 開始/終了 が許容ウィンドウに収まっているかチェック。
    const tz = settings.timezone || "Asia/Tokyo";
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    const partsStart = Object.fromEntries(fmt.formatToParts(start).map((p) => [p.type, p.value]));
    const partsEnd = Object.fromEntries(fmt.formatToParts(end).map((p) => [p.type, p.value]));
    const startHour = Number(partsStart.hour);
    const startMinute = Number(partsStart.minute);
    const endHour = Number(partsEnd.hour);
    const endMinute = Number(partsEnd.minute);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes =
      endHour === 0 && endMinute === 0 ? 24 * 60 : endHour * 60 + endMinute;
    const earliest = settings.slotEarliestHour * 60;
    const latest = settings.slotLatestHour * 60;
    if (startMinutes < earliest || endMinutes > latest) {
      return `候補日時は ${String(settings.slotEarliestHour).padStart(2, "0")}:00〜${String(settings.slotLatestHour).padStart(2, "0")}:00 の間で指定してください。`;
    }
    if (!settings.allowWeekends) {
      const weekday = String(partsStart.weekday).slice(0, 3);
      if (weekday === "Sat" || weekday === "Sun") {
        return "土日は候補日として指定できません。（管理者の設定で許可可能）";
      }
    }
    return null;
  }

  if (parsedStarts.success) {
    for (const iso of parsedStarts.data.starts) {
      const start = new Date(iso);
      if (Number.isNaN(start.valueOf())) return jsonError("開始日時が不正です。");
      const end = addMinutes(start, settings.slotDurationMinutes);
      const v = validateWithinAllowedWindow(start, end);
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
      const v = validateWithinAllowedWindow(start, end);
      if (v) return jsonError(v);
      slotData.push({ startAt: start, endAt: end });
    }
  }

  const round = latest ? latest.round + 1 : 1;

  const negotiation = await createNegotiationRound({
    matchId,
    sessionNumber,
    round,
    slotData,
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

  const bodyShort = `${sessionNumber}回目の日程候補 Round ${negotiation.round}（各 ${settings.slotDurationMinutes} 分 × ${negotiation.slots.length} 件）`;

  await createMessage({
    matchId,
    senderId: session.sub,
    body: bodyShort,
    kind: "SLOT_PROPOSAL",
    payload,
  });

  const lines = negotiation.slots
    .map(
      (slot: { startAt: string; endAt: string }, i: number) =>
        `${i + 1}. ${formatJpRange(new Date(slot.startAt), new Date(slot.endAt))}`,
    )
    .join("\n");

  await notifyMatchStakeholders(matchId, {
    appOrigin: new URL(request.url).origin,
    subject: `${sessionNumber}回目の日程候補 Round ${negotiation.round} が提示されました`,
    text: `${bodyShort}\n\n${lines}\n\nアプリのチャットで○／×の回答をお願いします。`,
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
    summary: `${sender?.displayName ?? "パートナー"}さんが ${sessionNumber} 回目の日程候補（Round ${negotiation.round}）を提示しました。`,
    // 日程候補は match ページの日程調整タブに直接飛ばす。
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
      summary: `${sender?.displayName ?? "パートナー"}さんが ${sessionNumber} 回目の日程候補を提示しました。○／× で回答してください。`,
      link: `/match/${matchId}#schedule`,
    });
  }

  return jsonOk({ ok: true, negotiation });
}
