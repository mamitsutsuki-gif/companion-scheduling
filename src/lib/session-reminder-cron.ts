import { DEFAULT_APP_TIMEZONE, formatJaDateTime, resolveAppTimeZone } from "@/lib/format-datetime";
import { sendMail } from "@/lib/mail";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { getMatchById } from "@/lib/repositories/match-repository";
import { getNegotiationById } from "@/lib/repositories/negotiation-repository";
import {
  enqueueSessionReminderEmailJob,
  listPendingSessionReminderJobs,
  markSessionReminderJobCancelled,
  markSessionReminderJobSent,
} from "@/lib/repositories/session-reminder-job-repository";
import { resolveUserEmailForNotifications } from "@/lib/repositories/user-repository";
import { prisma } from "@/lib/prisma";

/** セッション開始日の前日 08:30（指定タイムゾーン） */
export function computeSessionReminderAt(
  slotStartAt: Date,
  timeZone: string = DEFAULT_APP_TIMEZONE,
): Date {
  const tz = resolveAppTimeZone(timeZone);
  const startParts = zonedDateTimeParts(slotStartAt, tz);
  const prev = addCalendarDays(startParts.year, startParts.month, startParts.day, -1);
  return zonedLocalToUtc(prev.year, prev.month, prev.day, 8, 30, tz);
}

function zonedDateTimeParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function addCalendarDays(year: number, month: number, day: number, delta: number) {
  const utc = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

/** 指定タイムゾーンの壁時計日時 → UTC Date（DST ずれを反復で補正） */
function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  for (let i = 0; i < 4; i++) {
    const parts = zonedDateTimeParts(guess, timeZone);
    const asIfUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
    const diff = wanted - asIfUtc;
    if (diff === 0) break;
    guess = new Date(guess.getTime() + diff);
  }
  return guess;
}

function appOriginFromEnv() {
  const candidate =
    process.env.APP_ORIGIN ??
    process.env.NEXT_PUBLIC_APP_ORIGIN ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    "";
  return candidate.replace(/\/+$/, "");
}

function buildMatchUrl(matchId: string) {
  const origin = appOriginFromEnv();
  const path = `/match/${matchId}`;
  return origin ? `${origin}${path}` : path;
}

function isSlotStartTomorrowInTimeZone(now: Date, slotStart: Date, timeZone: string): boolean {
  const tz = resolveAppTimeZone(timeZone);
  const nowP = zonedDateTimeParts(now, tz);
  const startP = zonedDateTimeParts(slotStart, tz);
  const tomorrow = addCalendarDays(nowP.year, nowP.month, nowP.day, 1);
  return (
    tomorrow.year === startP.year && tomorrow.month === startP.month && tomorrow.day === startP.day
  );
}

function meetingBlock(joinUrl: string | null | undefined): string {
  const url = (joinUrl ?? "").trim();
  if (!url) return "";
  return `オンライン会議\n${url}\n`;
}

export async function runSessionReminderEmailCron(now = new Date()) {
  const secretOk = Boolean(process.env.CRON_SECRET?.trim());
  const ensured = await ensureReminderJobsForConfirmedSessions(now);
  const pending = await listPendingSessionReminderJobs(now);
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const job of pending) {
    const displayTzForJob = DEFAULT_APP_TIMEZONE;
    const match = await getMatchById(job.matchId);
    if (!match) {
      await markSessionReminderJobCancelled(job.id);
      skipped += 1;
      continue;
    }

    const negotiation = await getNegotiationById(job.negotiationId);
    if (!negotiation || negotiation.matchId !== job.matchId || negotiation.status !== "CONFIRMED") {
      await markSessionReminderJobCancelled(job.id);
      skipped += 1;
      continue;
    }

    const slot = negotiation.slots.find((s) => s.id === job.slotId && s.isConfirmed);
    if (!slot) {
      await markSessionReminderJobCancelled(job.id);
      skipped += 1;
      continue;
    }

    const start = new Date(slot.startAt);
    const end = new Date(slot.endAt);
    if (
      Number.isNaN(start.valueOf()) ||
      Math.abs(start.getTime() - job.slotStartAt.getTime()) > 1000
    ) {
      // 開始時刻がジョブと不一致（微調整・再確定など）→ 送らずキャンセル
      await markSessionReminderJobCancelled(job.id);
      skipped += 1;
      continue;
    }
    if (start <= now) {
      await markSessionReminderJobCancelled(job.id);
      skipped += 1;
      continue;
    }

    // 「明日の1on1」文面のため、開始日が JST で翌日のときだけ送る（当日確定などは送らない）
    if (!isSlotStartTomorrowInTimeZone(now, start, displayTzForJob)) {
      const startDay = zonedDateTimeParts(start, displayTzForJob);
      const today = zonedDateTimeParts(now, displayTzForJob);
      const startDayNum = startDay.year * 10000 + startDay.month * 100 + startDay.day;
      const todayNum = today.year * 10000 + today.month * 100 + today.day;
      if (startDayNum <= todayNum) {
        await markSessionReminderJobCancelled(job.id);
      }
      skipped += 1;
      continue;
    }

    // 宛先は送信直前に userId から解決（誤送信防止）
    if (match.clientId !== job.clientId || match.partnerId !== job.partnerId) {
      await markSessionReminderJobCancelled(job.id);
      skipped += 1;
      continue;
    }

    const [clientEmail, partnerEmail] = await Promise.all([
      resolveUserEmailForNotifications(match.clientId),
      resolveUserEmailForNotifications(match.partnerId),
    ]);

    const displayTz = displayTzForJob;
    const startLabel = formatJaDateTime(start, displayTz);
    const endLabel = formatJaDateTime(end, displayTz);
    const meet = meetingBlock(negotiation.confirmedZoomUrl);
    const roomUrl = buildMatchUrl(job.matchId);
    const clientName = match.client.displayName || "クライアント";
    const partnerName = match.partner.displayName || "パートナー";

    const clientSubject = "明日の1on1のご案内";
    const clientBody =
      `${clientName}さん\n\n` +
      `明日の1on1セッションについてご案内です。\n\n` +
      `日時: ${startLabel} 〜 ${endLabel}\n` +
      (meet ? `${meet}\n` : "") +
      `当日は上記の時間になりましたらご参加ください。\n` +
      `ルームを開く: ${roomUrl}\n\n` +
      `モチベイジクラウド`;

    const partnerSubject = `明日の1on1のご案内（${clientName}さん）`;
    const partnerBody =
      `${partnerName}さん\n\n` +
      `明日の1on1セッションについてご案内です。\n\n` +
      `相手: ${clientName}さん\n` +
      `日時: ${startLabel} 〜 ${endLabel}\n` +
      (meet ? `${meet}\n` : "") +
      `セッションガイドラインは、モチベイジクラウドのルームからご確認ください。\n` +
      `ルームを開く: ${roomUrl}\n\n` +
      `モチベイジクラウド`;

    let okClient = true;
    let okPartner = true;
    if (clientEmail) {
      okClient = await sendMail({ to: clientEmail, subject: clientSubject, text: clientBody });
      if (okClient) sent += 1;
      else failed += 1;
    } else {
      skipped += 1;
    }
    if (partnerEmail) {
      okPartner = await sendMail({ to: partnerEmail, subject: partnerSubject, text: partnerBody });
      if (okPartner) sent += 1;
      else failed += 1;
    } else {
      skipped += 1;
    }

    // 片方失敗しても再送ループを避けるため sent にする（ログは failed カウント）
    await markSessionReminderJobSent(job.id);
  }

  return {
    processed: pending.length,
    ensured,
    sent,
    skipped,
    failed,
    secretConfigured: secretOk,
  };
}

/**
 * デプロイ前に確定済みの回も含め、未登録ジョブを補完する（送信はしない）。
 * 開始が未来の CONFIRMED のみ。
 */
async function ensureReminderJobsForConfirmedSessions(now: Date): Promise<number> {
  let created = 0;
  const tz = DEFAULT_APP_TIMEZONE;

  type Row = {
    id: string;
    matchId: string;
    slotId: string;
    startAt: Date;
  };

  const rows: Row[] = [];

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return 0;
    const snap = await db.collection("negotiations").where("status", "==", "CONFIRMED").limit(400).get();
    for (const d of snap.docs) {
      const raw = d.data() as Record<string, unknown>;
      const slots = Array.isArray(raw.slots) ? (raw.slots as Record<string, unknown>[]) : [];
      const confirmed = slots.find((s) => Boolean(s.isConfirmed));
      if (!confirmed) continue;
      const start = new Date(String(confirmed.startAt ?? ""));
      if (Number.isNaN(start.valueOf()) || start <= now) continue;
      rows.push({
        id: d.id,
        matchId: String(raw.matchId ?? ""),
        slotId: String(confirmed.id ?? ""),
        startAt: start,
      });
    }
  } else {
    try {
      const found = await prisma.negotiation.findMany({
        where: { status: "CONFIRMED" },
        include: { slots: true },
        take: 400,
      });
      for (const n of found) {
        const confirmed = n.slots.find((s) => s.isConfirmed);
        if (!confirmed) continue;
        const start = confirmed.startAt instanceof Date ? confirmed.startAt : new Date(confirmed.startAt);
        if (Number.isNaN(start.valueOf()) || start <= now) continue;
        rows.push({
          id: n.id,
          matchId: n.matchId,
          slotId: confirmed.id,
          startAt: start,
        });
      }
    } catch {
      return 0;
    }
  }

  for (const row of rows) {
    const match = await getMatchById(row.matchId);
    if (!match) continue;
    await enqueueSessionReminderEmailJob({
      negotiationId: row.id,
      slotId: row.slotId,
      matchId: row.matchId,
      clientId: match.clientId,
      partnerId: match.partnerId,
      slotStartAt: row.startAt,
      remindAt: computeSessionReminderAt(row.startAt, tz),
    });
    created += 1;
  }
  return created;
}
