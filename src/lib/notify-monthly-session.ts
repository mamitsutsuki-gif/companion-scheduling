import { buildGoogleCalendarLink, buildOutlookCalendarLink } from "@/lib/calendar-links";
import { formatJaDateTime } from "@/lib/format-datetime";
import { buildIcsEvent } from "@/lib/ics";
import { sendMail, type MailInput } from "@/lib/mail";
import {
  formatMeetingLines,
  meetingProviderLabel,
  resolveMeetingSnapshotFromProfile,
  type MeetingSnapshot,
} from "@/lib/meeting-provider";
import {
  MONTHLY_SERVICE_LABELS,
  type MonthlyServiceType,
} from "@/lib/monthly-session";
import { getEffectiveAppSettings } from "@/lib/repositories/app-settings-repository";
import type { MonthlyBooking } from "@/lib/repositories/monthly-session-repository";
import { getPartnerZoomProfile } from "@/lib/repositories/zoom-repository";
import {
  listAdminEmails,
  resolveUserEmailForNotifications,
  getUserById,
} from "@/lib/repositories/user-repository";

const DISPLAY_TZ = "Asia/Tokyo";

export async function resolveMonthlyMeetingSnapshot(
  companyId: string,
  partnerId: string,
): Promise<MeetingSnapshot | null> {
  const [effective, profile] = await Promise.all([
    getEffectiveAppSettings({ companyId }),
    getPartnerZoomProfile(partnerId),
  ]);
  return resolveMeetingSnapshotFromProfile(effective.meetingProvider, profile);
}

/**
 * 月額セッション予約確定時: クライアント・パートナー・管理者へ
 * 確定メール（Google / Outlook 追加リンク + .ics 添付）を送信する。
 * 日時表示は常に Asia/Tokyo。
 */
export async function notifyMonthlyBookingConfirmed(input: {
  booking: MonthlyBooking;
  appOrigin?: string;
}) {
  const { booking } = input;
  try {
    const [client, partner, meeting, clientEmail, partnerEmail, admins] = await Promise.all([
      getUserById(booking.clientId),
      getUserById(booking.partnerId),
      resolveMonthlyMeetingSnapshot(booking.companyId, booking.partnerId),
      resolveUserEmailForNotifications(booking.clientId),
      resolveUserEmailForNotifications(booking.partnerId),
      listAdminEmails(),
    ]);

    const clientName = client?.displayName?.trim() || "クライアント";
    const partnerName = partner?.displayName?.trim() || "パートナー";
    const serviceLabel =
      MONTHLY_SERVICE_LABELS[booking.serviceType as MonthlyServiceType] ?? "セッション";
    const start = new Date(booking.startAt);
    const end = new Date(booking.endAt);
    if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) return;

    const meetingLines = formatMeetingLines(meeting);
    const meetingLine = meetingLines.join("\n");
    const providerLabel = meeting ? meetingProviderLabel(meeting.provider) : "オンライン会議";

    const eventTitle = `モチベイジ セッション申し込み（${serviceLabel}・${clientName}さん）`;
    const eventDetails = [
      `種別: ${serviceLabel}`,
      `クライアント: ${clientName}さん`,
      `パートナー: ${partnerName}さん`,
      meetingLine,
      "",
      "ご予約が確定しました。",
      "連絡先はプラットフォーム内チャットのみをご利用ください。",
    ]
      .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
      .join("\n")
      .trim();

    const ics = buildIcsEvent({
      uid: `monthly-${booking.id}@companion-scheduling`,
      start,
      end,
      title: eventTitle,
      description: eventDetails,
      location: meeting?.joinUrl,
    });

    const googleCalendarLink = buildGoogleCalendarLink({
      title: eventTitle,
      start,
      end,
      details: eventDetails,
      location: meeting?.joinUrl,
    });
    const outlookCalendarLink = buildOutlookCalendarLink({
      title: eventTitle,
      start,
      end,
      details: eventDetails,
      location: meeting?.joinUrl,
    });

    const textBody =
      `次のセッション申し込みが確定しました。\n` +
      `種別: ${serviceLabel}\n` +
      `開始: ${formatJaDateTime(start, DISPLAY_TZ)}（日本時間）\n` +
      `終了: ${formatJaDateTime(end, DISPLAY_TZ)}（日本時間）\n` +
      `クライアント: ${clientName}さん\n` +
      `パートナー: ${partnerName}さん\n` +
      (meetingLine ? `${providerLabel}\n${meetingLine}\n` : "") +
      `\n連絡先はプラットフォーム内チャットのみをご利用ください。\n` +
      `カレンダー用 .ics を添付しています。\n\n` +
      `Googleカレンダーに追加: ${googleCalendarLink}\n` +
      `Outlookカレンダーに追加: ${outlookCalendarLink}`;

    const appBase = (process.env.APP_ORIGIN || input.appOrigin || "").replace(/\/$/, "");
    const linkPath = `/sessions-booking/${encodeURIComponent(booking.id)}`;
    const linkLine = appBase ? `\n\n詳細を開く: ${appBase}${linkPath}` : `\n\n詳細: ${linkPath}`;

    const attachments: MailInput["attachments"] = [
      { filename: "session.ics", content: ics, contentType: "text/calendar; charset=utf-8" },
    ];

    const targets = new Map<string, string>();
    const push = (email: string | null | undefined, intro: string) => {
      const t = email?.trim();
      if (!t) return;
      const key = t.toLowerCase();
      if (!targets.has(key)) targets.set(key, intro);
    };
    push(clientEmail, `${clientName}さん\n\n`);
    push(partnerEmail, `${partnerName}さん\n\n`);
    for (const a of admins) {
      push(a, `[${partnerName}さん ／ ${clientName}さん]\n\n`);
    }

    if (targets.size === 0) {
      console.warn("[notify] notifyMonthlyBookingConfirmed: no recipients", {
        bookingId: booking.id,
      });
      return;
    }

    for (const [to, intro] of targets) {
      await sendMail({
        to,
        subject: "セッション申し込みが確定しました（カレンダー .ics 添付）",
        text: intro + textBody + linkLine,
        attachments,
      });
    }
  } catch (e) {
    console.error("[notify] notifyMonthlyBookingConfirmed failed", booking.id, e);
  }
}
