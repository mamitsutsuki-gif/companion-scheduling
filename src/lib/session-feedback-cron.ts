import { sendMail } from "@/lib/mail";
import { getUserById } from "@/lib/repositories/user-repository";
import {
  listPendingSessionFeedbackJobs,
  markSessionFeedbackJobSent,
} from "@/lib/repositories/session-feedback-job-repository";

const DEFAULT_FEEDBACK_FORM_URL = "https://forms.gle/XN8Dea5Ym1STqxsK6";

function feedbackFormUrl() {
  return (process.env.SESSION_FEEDBACK_FORM_URL ?? DEFAULT_FEEDBACK_FORM_URL).trim();
}

const MAX_FEEDBACK_LAG_MS = 14 * 24 * 60 * 60 * 1000;

export async function runSessionFeedbackEmailCron(now = new Date()) {
  const secretOk = Boolean(process.env.CRON_SECRET?.trim());
  const pending = await listPendingSessionFeedbackJobs(now);
  let sent = 0;
  for (const job of pending) {
    const lag = now.getTime() - job.slotEndAt.getTime();
    if (lag > MAX_FEEDBACK_LAG_MS) {
      await markSessionFeedbackJobSent(job.id);
      continue;
    }
    const user = await getUserById(job.clientId);
    if (!user) {
      await markSessionFeedbackJobSent(job.id);
      continue;
    }
    const email = user.email?.trim();
    if (!email) {
      await markSessionFeedbackJobSent(job.id);
      continue;
    }
    const formUrl = feedbackFormUrl();
    const subject = "1on1セッション後のフィードバックのお願い";
    const text =
      `${user.displayName} さん\n\n` +
      `今日はお時間をいただきありがとうございました。今日の1on1セッションを振り返るためのフィードバックフォームにご回答をお願いします。\n\n` +
      `${formUrl}\n\n` +
      `モチベイジサポートデスク`;
    const ok = await sendMail({ to: email, subject, text });
    if (ok) {
      await markSessionFeedbackJobSent(job.id);
      sent += 1;
    }
  }
  return { processed: pending.length, sent, secretConfigured: secretOk };
}
