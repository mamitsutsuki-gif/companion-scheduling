import { sendMail } from "@/lib/mail";
import { getUserById } from "@/lib/repositories/user-repository";
import {
  listPendingSessionFeedbackJobs,
  markSessionFeedbackJobSent,
} from "@/lib/repositories/session-feedback-job-repository";
import { getMatchById } from "@/lib/repositories/match-repository";
import { getNegotiationById } from "@/lib/repositories/negotiation-repository";
import { createMessage } from "@/lib/repositories/message-repository";

const MAX_FEEDBACK_LAG_MS = 14 * 24 * 60 * 60 * 1000;

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

export async function runSessionFeedbackEmailCron(now = new Date()) {
  const secretOk = Boolean(process.env.CRON_SECRET?.trim());
  const pending = await listPendingSessionFeedbackJobs(now);
  let sent = 0;
  let posted = 0;
  for (const job of pending) {
    const lag = now.getTime() - job.slotEndAt.getTime();
    if (lag > MAX_FEEDBACK_LAG_MS) {
      await markSessionFeedbackJobSent(job.id);
      continue;
    }

    const match = await getMatchById(job.matchId);
    if (!match) {
      await markSessionFeedbackJobSent(job.id);
      continue;
    }
    const negotiation = await getNegotiationById(job.negotiationId);
    const sessionNumber = Math.max(1, negotiation?.sessionNumber ?? 1);

    const sessionUrl = buildSessionUrl(job.matchId, sessionNumber);

    const clientBody =
      `本日は1on1セッションのお疲れ様でした。\n` +
      `お時間を確保してくださってありがとうございました。\n` +
      `このフォームから振り返りをお願いいたします。\n\n${sessionUrl}`;
    const partnerBody =
      `本日は1on1セッションのお疲れ様でした。\n` +
      `クライアントへの温かなご支援をありがとうございました。\n` +
      `このフォームから振り返りをお願いいたします。\n\n${sessionUrl}`;

    try {
      // Audience-scoped chat message: only the role's user sees it.
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
      // continue to email fallback
    }

    let okEmailClient = true;
    let okEmailPartner = true;

    const client = await getUserById(job.clientId);
    if (client?.email) {
      const subject = `${sessionNumber}回目の1on1の振り返りフォーム`;
      okEmailClient = await sendMail({ to: client.email, subject, text: clientBody });
      if (okEmailClient) sent += 1;
    }

    const partner = await getUserById(match.partnerId);
    if (partner?.email) {
      const subject = `${sessionNumber}回目の1on1セッションレポート`;
      okEmailPartner = await sendMail({ to: partner.email, subject, text: partnerBody });
      if (okEmailPartner) sent += 1;
    }

    // Mark sent regardless of email success once chat is posted, so we don't keep retrying forever.
    // (If chat failed, we still mark sent to avoid loops; this matches the previous behavior of bailing on hard errors.)
    await markSessionFeedbackJobSent(job.id);
  }
  return {
    processed: pending.length,
    sent,
    chatPosted: posted,
    secretConfigured: secretOk,
  };
}
