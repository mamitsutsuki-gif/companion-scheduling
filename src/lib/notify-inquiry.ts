import { sendMail, sendMailToMany } from "@/lib/mail";
import { INQUIRY_REPLY_NOTICE } from "@/lib/inquiry-categories";
import type { InquiryRow } from "@/lib/repositories/inquiry-repository";
import { appendAdminNotification } from "@/lib/repositories/admin-notification-repository";
import { appendMemberNotification } from "@/lib/repositories/member-notification-repository";
import {
  getUserById,
  listAdminEmails,
  resolveUserEmailForNotifications,
} from "@/lib/repositories/user-repository";

function appOrigin() {
  return (process.env.APP_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "");
}

function formatJa(iso: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function roleLabel(role: string) {
  return role === "PARTNER" ? "パートナー" : "クライアント";
}

function formatInquiryBlock(inquiry: InquiryRow) {
  const status = inquiry.status === "ANSWERED" ? "回答済み" : "受付中";
  const lines = [
    `受付番号: ${inquiry.receptionNumber}`,
    `受付日時: ${formatJa(inquiry.createdAt)}`,
    `ステータス: ${status}`,
    `問い合わせ種別: ${inquiry.category}`,
    `内容:`,
    inquiry.body,
  ];
  if (inquiry.replyBody) {
    lines.push("", "【回答】", inquiry.replyBody, `回答日時: ${formatJa(inquiry.repliedAt ?? "")}`);
  }
  return lines.join("\n");
}

function formatHistoryBlock(history: InquiryRow[]) {
  if (history.length <= 1) return "";
  return [
    "",
    "―――― お問い合わせ履歴 ――――",
    ...history.map((h, i) => [`--- ${i + 1}件目 ---`, formatInquiryBlock(h), ""].join("\n")),
  ].join("\n");
}

export async function notifyInquirySubmitted(input: {
  inquiry: InquiryRow;
  history: InquiryRow[];
}) {
  const { inquiry, history } = input;
  const me = await getUserById(inquiry.userId);
  const email = await resolveUserEmailForNotifications(inquiry.userId);
  const roleJa = roleLabel(inquiry.submitterRole);

  if (email) {
    const text = [
      `${inquiry.name} 様`,
      "",
      "お問い合わせを受け付けました。",
      "",
      formatInquiryBlock(inquiry),
      formatHistoryBlock(history),
      "",
      INQUIRY_REPLY_NOTICE,
      "",
      `問い合わせ履歴の確認: ${appOrigin()}/contact`,
      "",
      "モチベイジクラウド",
    ].join("\n");
    try {
      await sendMail({
        to: email,
        subject: `【お問い合わせ受付】${inquiry.receptionNumber}`,
        text,
      });
    } catch {
      /* メール失敗は問い合わせ保存を妨げない */
    }
  }

  try {
    await appendAdminNotification({
      type: "INQUIRY_SUBMITTED",
      actorUserId: inquiry.userId,
      actorRole: inquiry.submitterRole,
      summary: `[${inquiry.receptionNumber}] ${me?.displayName ?? inquiry.name}さん（${roleJa}）からお問い合わせ`,
      link: `/admin/inquiries?focus=${inquiry.id}&role=${inquiry.submitterRole}`,
    });
  } catch {
    /* noop */
  }

  const admins = await listAdminEmails();
  if (admins.length > 0) {
    const adminText = [
      "問い合わせが来ました。回答が必要です！",
      "",
      `受付番号: ${inquiry.receptionNumber}`,
      `お名前: ${inquiry.name}`,
      `区分: ${roleJa}`,
      `問い合わせ種別: ${inquiry.category}`,
      "",
      "内容:",
      inquiry.body,
      "",
      `管理画面: ${appOrigin()}/admin/inquiries?focus=${inquiry.id}&role=${inquiry.submitterRole}`,
    ].join("\n");
    try {
      await sendMailToMany(admins, {
        subject: `【要回答】お問い合わせ ${inquiry.receptionNumber}（${roleJa}）`,
        text: adminText,
      });
    } catch {
      /* noop */
    }
  }
}

export async function notifyInquiryReplied(input: {
  inquiry: InquiryRow;
  history: InquiryRow[];
  adminDisplayName: string;
}) {
  const { inquiry, history, adminDisplayName } = input;
  const email = await resolveUserEmailForNotifications(inquiry.userId);

  if (email) {
    const text = [
      `${inquiry.name} 様`,
      "",
      `お問い合わせ（受付番号: ${inquiry.receptionNumber}）への回答をお送りします。`,
      "",
      "【ご質問内容】",
      `問い合わせ種別: ${inquiry.category}`,
      inquiry.body,
      "",
      "【回答】",
      inquiry.replyBody ?? "",
      "",
      formatHistoryBlock(history),
      "",
      "追加のご質問がある場合は、アプリの「問い合わせ」画面から再度お送りください。",
      "",
      `問い合わせ履歴の確認: ${appOrigin()}/contact`,
      "",
      "モチベイジクラウド",
      adminDisplayName,
    ].join("\n");
    try {
      await sendMail({
        to: email,
        subject: `【お問い合わせ回答】${inquiry.receptionNumber}`,
        text,
      });
    } catch {
      /* noop */
    }
  }

  try {
    await appendMemberNotification({
      recipientUserId: inquiry.userId,
      type: "INQUIRY_REPLIED",
      summary: `お問い合わせ（${inquiry.receptionNumber}）に回答がありました`,
      link: `/contact?focus=${inquiry.id}`,
      actorRole: "ADMIN",
    });
  } catch {
    /* noop */
  }
}
