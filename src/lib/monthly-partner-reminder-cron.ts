import { sendMail } from "@/lib/mail";
import {
  monthlyPartnerReminderWindowLabel,
  resolveMonthlyPartnerReminder,
  type MonthlyPartnerReminderKind,
} from "@/lib/monthly-session";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { getMonthlyGlobalSettings } from "@/lib/repositories/monthly-session-repository";
import {
  getUserById,
  resolveUserEmailForNotifications,
} from "@/lib/repositories/user-repository";

function appOriginFromEnv() {
  const candidate =
    process.env.APP_ORIGIN ??
    process.env.NEXT_PUBLIC_APP_ORIGIN ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    "";
  return candidate.replace(/\/+$/, "");
}

async function alreadySentReminder(ymd: string, kind: MonthlyPartnerReminderKind): Promise<boolean> {
  if (!isFirebaseDataBackend()) return false;
  const db = getFirebaseFirestoreClient();
  if (!db) return false;
  const id = `${ymd}_${kind}`;
  const snap = await db.collection("monthlyPartnerReminderLogs").doc(id).get();
  return snap.exists;
}

async function markReminderSent(
  ymd: string,
  kind: MonthlyPartnerReminderKind,
  sent: number,
): Promise<void> {
  if (!isFirebaseDataBackend()) return;
  const db = getFirebaseFirestoreClient();
  if (!db) return;
  const id = `${ymd}_${kind}`;
  await db
    .collection("monthlyPartnerReminderLogs")
    .doc(id)
    .set({
      ymd,
      kind,
      sent,
      sentAt: new Date().toISOString(),
    });
}

/**
 * 毎月 12日: 当月 15日〜月末の予定登録を促す
 * 毎月 27日: 翌月 1日〜15日の予定登録を促す
 * 同一 ymd+kind は1回だけ送信（Firestore で冪等）。
 */
export async function runMonthlyPartnerAvailabilityReminderCron(now = new Date()) {
  const reminder = resolveMonthlyPartnerReminder(now);
  if (!reminder) {
    return { ok: true as const, skipped: true as const, reason: "not_reminder_day" };
  }

  if (await alreadySentReminder(reminder.ymd, reminder.kind)) {
    return {
      ok: true as const,
      skipped: true as const,
      reason: "already_sent",
      ymd: reminder.ymd,
      kind: reminder.kind,
    };
  }

  const settings = await getMonthlyGlobalSettings();
  const partnerIds = settings.eligiblePartnerIds;
  const { periodLabel, monthLabel } = monthlyPartnerReminderWindowLabel(reminder.kind, now);
  const origin = appOriginFromEnv();
  const path = "/sessions-booking/partner";
  const link = origin ? `${origin}${path}` : path;

  const subject =
    reminder.kind === "mid_month"
      ? `【予定登録のお願い】${monthLabel} 後半（15日〜月末）の空き枠登録`
      : `【予定登録のお願い】${monthLabel} 前半（1日〜15日）の空き枠登録`;

  let sent = 0;
  let failed = 0;
  for (const partnerId of partnerIds) {
    const [user, email] = await Promise.all([
      getUserById(partnerId),
      resolveUserEmailForNotifications(partnerId),
    ]);
    if (!email?.trim()) {
      failed += 1;
      continue;
    }
    const name = user?.displayName?.trim() || "パートナー";
    const text =
      `${name}さん\n\n` +
      `セッション申し込み用の空き予定の登録をお願いします。\n\n` +
      `■ 登録していただきたい期間\n` +
      `${periodLabel}\n\n` +
      `クライアントは毎月1日（日本時間）から当月の予約が可能になります。\n` +
      `期日までに空き枠の登録をお願いいたします。\n\n` +
      `登録ページ: ${link}\n`;

    const ok = await sendMail({ to: email.trim(), subject, text });
    if (ok) sent += 1;
    else failed += 1;
  }

  await markReminderSent(reminder.ymd, reminder.kind, sent);

  return {
    ok: true as const,
    skipped: false as const,
    ymd: reminder.ymd,
    kind: reminder.kind,
    periodLabel,
    partnerCount: partnerIds.length,
    sent,
    failed,
  };
}
