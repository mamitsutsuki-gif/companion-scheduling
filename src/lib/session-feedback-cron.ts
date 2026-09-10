import { DEFAULT_APP_TIMEZONE, resolveAppTimeZone } from "@/lib/format-datetime";
import { sendMail } from "@/lib/mail";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { getMatchById } from "@/lib/repositories/match-repository";
import { getNegotiationById } from "@/lib/repositories/negotiation-repository";
import { createMessage } from "@/lib/repositories/message-repository";
import { getSessionFeedback } from "@/lib/repositories/session-feedback-repository";
import { getSessionAbandonment } from "@/lib/repositories/session-abandonment-repository";
import { getRoleplayStore } from "@/lib/repositories/coaching-repository";
import { getEffectiveAppSettingsForMatch } from "@/lib/effective-app-settings";
import {
  coachingSessionModeContextFromEffective,
  isCoachingRoleplaySession,
} from "@/lib/coaching-session-mode";
import { roleplayClientSubmissionComplete } from "@/lib/coaching-roleplay";
import {
  enqueueSessionFeedbackEmailJob,
  isInitialFeedbackJobSettled,
  listPendingSessionFeedbackJobs,
  markSessionFeedbackJobCancelled,
  tryClaimSessionFeedbackJob,
  type PendingFeedbackJob,
} from "@/lib/repositories/session-feedback-job-repository";
import { resolveUserEmailForNotifications } from "@/lib/repositories/user-repository";

const MAX_FEEDBACK_LAG_MS = 14 * 24 * 60 * 60 * 1000;

/** セッション終了日の N 日後 08:30（指定タイムゾーン） */
export function computeClientFeedbackFollowupAt(
  slotEndAt: Date,
  daysAfterEnd: number,
  timeZone: string = DEFAULT_APP_TIMEZONE,
): Date {
  const tz = resolveAppTimeZone(timeZone);
  const endParts = zonedDateTimeParts(slotEndAt, tz);
  const target = addCalendarDays(endParts.year, endParts.month, endParts.day, daysAfterEnd);
  return zonedLocalToUtc(target.year, target.month, target.day, 8, 30, tz);
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

function buildSessionUrl(matchId: string, sessionNumber: number) {
  const origin = appOriginFromEnv();
  const path = `/match/${matchId}/sessions/${sessionNumber}`;
  return origin ? `${origin}${path}` : path;
}

/**
 * クライアント振り返りが提出済みか。
 * ロールプレイ回は roleplay のクライアント提出、それ以外は SessionFeedback。
 */
export async function isClientSessionFeedbackSubmitted(
  matchId: string,
  sessionNumber: number,
): Promise<boolean> {
  const settings = await getEffectiveAppSettingsForMatch(matchId);
  const modeCtx = coachingSessionModeContextFromEffective({
    companyPlan: settings.companyPlan,
    totalSessions: settings.totalSessions,
    coachingSessionModesByRound: settings.coachingSessionModesByRound,
  });
  if (isCoachingRoleplaySession(modeCtx, sessionNumber)) {
    const store = await getRoleplayStore(matchId);
    const session = store?.sessions[sessionNumber - 1];
    if (!session) return false;
    return roleplayClientSubmissionComplete(session);
  }
  const fb = await getSessionFeedback(matchId, sessionNumber);
  return fb != null;
}

export async function runSessionFeedbackEmailCron(now = new Date()) {
  const secretOk = Boolean(process.env.CRON_SECRET?.trim());
  const ensured = await ensureFeedbackJobsForConfirmedSessions(now);
  const pending = await listPendingSessionFeedbackJobs(now);
  let sent = 0;
  let posted = 0;
  let skipped = 0;
  let failed = 0;

  for (const job of pending) {
    const result = await processOneFeedbackJob(job, now);
    sent += result.sent;
    posted += result.posted;
    skipped += result.skipped;
    failed += result.failed;
  }

  return {
    processed: pending.length,
    ensured,
    sent,
    chatPosted: posted,
    skipped,
    failed,
    secretConfigured: secretOk,
  };
}

/**
 * 確定済みセッションの初回＋追っかけジョブを補完（送信はしない）。
 * 終了が未来、または終了から14日以内のもの。
 */
async function ensureFeedbackJobsForConfirmedSessions(now: Date): Promise<number> {
  let created = 0;
  const tz = DEFAULT_APP_TIMEZONE;

  type Row = { id: string; matchId: string; slotId: string; endAt: Date };
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
      const end = new Date(String(confirmed.endAt ?? ""));
      if (Number.isNaN(end.valueOf())) continue;
      const lag = now.getTime() - end.getTime();
      if (lag > MAX_FEEDBACK_LAG_MS) continue;
      rows.push({
        id: d.id,
        matchId: String(raw.matchId ?? ""),
        slotId: String(confirmed.id ?? ""),
        endAt: end,
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
        const end =
          confirmed.endAt instanceof Date ? confirmed.endAt : new Date(confirmed.endAt);
        if (Number.isNaN(end.valueOf())) continue;
        if (now.getTime() - end.getTime() > MAX_FEEDBACK_LAG_MS) continue;
        rows.push({ id: n.id, matchId: n.matchId, slotId: confirmed.id, endAt: end });
      }
    } catch {
      return 0;
    }
  }

  for (const row of rows) {
    if (!row.slotId) continue;
    const match = await getMatchById(row.matchId);
    if (!match) continue;
    await enqueueSessionFeedbackEmailJob({
      negotiationId: row.id,
      slotId: row.slotId,
      matchId: row.matchId,
      clientId: match.clientId,
      slotEndAt: row.endAt,
      clientFollowupRemindAts: {
        day1: computeClientFeedbackFollowupAt(row.endAt, 1, tz),
        day3: computeClientFeedbackFollowupAt(row.endAt, 3, tz),
      },
    });
    created += 1;
  }
  return created;
}

async function processOneFeedbackJob(
  job: PendingFeedbackJob,
  now: Date,
): Promise<{ sent: number; posted: number; skipped: number; failed: number }> {
  let sent = 0;
  let posted = 0;
  let skipped = 0;
  let failed = 0;

  const lag = now.getTime() - job.slotEndAt.getTime();
  if (lag > MAX_FEEDBACK_LAG_MS) {
    await markSessionFeedbackJobCancelled(job.id);
    return { sent: 0, posted: 0, skipped: 1, failed: 0 };
  }

  const match = await getMatchById(job.matchId);
  if (!match) {
    await markSessionFeedbackJobCancelled(job.id);
    return { sent: 0, posted: 0, skipped: 1, failed: 0 };
  }

  // 宛先はマッチの現在の clientId を正とする（ジョブ上の ID と不一致なら送らない）
  if (match.clientId !== job.clientId) {
    await markSessionFeedbackJobCancelled(job.id);
    return { sent: 0, posted: 0, skipped: 1, failed: 0 };
  }

  const negotiation = await getNegotiationById(job.negotiationId);
  if (!negotiation || negotiation.matchId !== job.matchId || negotiation.status !== "CONFIRMED") {
    await markSessionFeedbackJobCancelled(job.id);
    return { sent: 0, posted: 0, skipped: 1, failed: 0 };
  }

  const sessionNumber = Math.max(1, negotiation.sessionNumber ?? 1);

  if (job.slotId) {
    const slot = negotiation.slots.find((s) => s.id === job.slotId && s.isConfirmed);
    if (!slot) {
      await markSessionFeedbackJobCancelled(job.id);
      return { sent: 0, posted: 0, skipped: 1, failed: 0 };
    }
    const end = new Date(slot.endAt);
    if (Number.isNaN(end.valueOf()) || Math.abs(end.getTime() - job.slotEndAt.getTime()) > 1000) {
      await markSessionFeedbackJobCancelled(job.id);
      return { sent: 0, posted: 0, skipped: 1, failed: 0 };
    }
  }

  const abandonment = await getSessionAbandonment(job.matchId, sessionNumber);
  if (abandonment) {
    await markSessionFeedbackJobCancelled(job.id);
    return { sent: 0, posted: 0, skipped: 1, failed: 0 };
  }

  const isFollowup = job.kind === "client_followup";
  if (isFollowup) {
    // 初回が未処理のまま追っかけだけ飛ぶのを防ぐ（ensure 直後の同一 cron など）
    const initialSettled = await isInitialFeedbackJobSettled(job.negotiationId, job.slotId);
    if (!initialSettled) {
      // キャンセルせず次回へ回す
      return { sent: 0, posted: 0, skipped: 1, failed: 0 };
    }
    const already = await isClientSessionFeedbackSubmitted(job.matchId, sessionNumber);
    if (already) {
      await markSessionFeedbackJobCancelled(job.id);
      return { sent: 0, posted: 0, skipped: 1, failed: 0 };
    }
  }

  // 二重送信防止: 送信直前に claim
  const claimed = await tryClaimSessionFeedbackJob(job.id);
  if (!claimed) {
    return { sent: 0, posted: 0, skipped: 1, failed: 0 };
  }

  // claim 後に再検証（記入・消化・確定解除との競合）
  const abandonmentAfter = await getSessionAbandonment(job.matchId, sessionNumber);
  if (abandonmentAfter) {
    return { sent: 0, posted: 0, skipped: 1, failed: 0 };
  }
  const negotiationAfter = await getNegotiationById(job.negotiationId);
  if (
    !negotiationAfter ||
    negotiationAfter.matchId !== job.matchId ||
    negotiationAfter.status !== "CONFIRMED"
  ) {
    return { sent: 0, posted: 0, skipped: 1, failed: 0 };
  }
  if (isFollowup) {
    const already = await isClientSessionFeedbackSubmitted(job.matchId, sessionNumber);
    if (already) {
      return { sent: 0, posted: 0, skipped: 1, failed: 0 };
    }
  }

  const sessionUrl = buildSessionUrl(job.matchId, sessionNumber);

  if (isFollowup) {
    const clientName = match.client.displayName || "お客さま";
    const clientBody =
      `${clientName}さん\n\n` +
      `先日の第${sessionNumber}回1on1セッションについてご連絡です。\n` +
      `振り返りのご記入がまだのようですので、お手数ですが下記よりご提出をお願いいたします。\n\n` +
      `${sessionUrl}\n\n` +
      `ご不明点がございましたら、お気軽にお問い合わせください。\n\n` +
      `モチベイジクラウド`;
    const subject = `第${sessionNumber}回1on1の振り返りご記入のお願い`;

    try {
      await createMessage({
        matchId: job.matchId,
        senderId: match.partnerId,
        body: clientBody,
        kind: "STANDARD",
        audience: "CLIENT",
      });
      posted += 1;
    } catch {
      /* email へ */
    }

    const clientEmail = await resolveUserEmailForNotifications(match.clientId);
    if (clientEmail) {
      const ok = await sendMail({ to: clientEmail, subject, text: clientBody });
      if (ok) sent += 1;
      else failed += 1;
    } else {
      skipped += 1;
    }
    return { sent, posted, skipped, failed };
  }

  // ----- initial: 双方・記入不問 -----
  const clientBody =
    `本日は1on1セッション、お疲れ様でした。\n` +
    `お時間を確保してくださってありがとうございました。\n` +
    `このフォームから振り返りをお願いいたします。\n\n${sessionUrl}`;
  const partnerBody =
    `本日は1on1セッション、お疲れ様でした。\n` +
    `クライアントへの温かなご支援をありがとうございました。\n` +
    `このフォームから振り返りをお願いいたします。\n\n${sessionUrl}`;

  try {
    await createMessage({
      matchId: job.matchId,
      senderId: match.partnerId,
      body: clientBody,
      kind: "STANDARD",
      audience: "CLIENT",
    });
    await createMessage({
      matchId: job.matchId,
      senderId: match.clientId,
      body: partnerBody,
      kind: "STANDARD",
      audience: "PARTNER",
    });
    posted += 2;
  } catch {
    /* email へ */
  }

  const clientEmail = await resolveUserEmailForNotifications(match.clientId);
  if (clientEmail) {
    const ok = await sendMail({
      to: clientEmail,
      subject: `${sessionNumber}回目の1on1の振り返りフォーム`,
      text: clientBody,
    });
    if (ok) sent += 1;
    else failed += 1;
  } else {
    skipped += 1;
  }

  const partnerEmail = await resolveUserEmailForNotifications(match.partnerId);
  if (partnerEmail) {
    const ok = await sendMail({
      to: partnerEmail,
      subject: `${sessionNumber}回目の1on1セッションレポート`,
      text: partnerBody,
    });
    if (ok) sent += 1;
    else failed += 1;
  } else {
    skipped += 1;
  }

  return { sent, posted, skipped, failed };
}
