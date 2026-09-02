import { z } from "zod";
import { requireAdminWriter } from "@/lib/admin-access";
import { jsonError, jsonOk } from "@/lib/json";
import { formatJaDateTimeRange } from "@/lib/format-datetime";
import { getEffectiveAppSettingsForMatch } from "@/lib/effective-app-settings";
import { notifyMatchStakeholders } from "@/lib/notify-members";
import { createMessage } from "@/lib/repositories/message-repository";
import { appendAdminNotification } from "@/lib/repositories/admin-notification-repository";
import { appendMemberNotification } from "@/lib/repositories/member-notification-repository";
import { adminReleaseConfirmedScheduleForReschedule } from "@/lib/repositories/negotiation-repository";
import { getMatchById } from "@/lib/repositories/match-repository";
import { upsertSessionAbandonment } from "@/lib/repositories/session-abandonment-repository";
import { reconcilePartnerInvoiceAfterScheduleRelease } from "@/lib/invoice-schedule-release";
import { getUserMapByIds } from "@/lib/repositories/user-repository";
import { readSession } from "@/lib/session";

const bodySchema = z.object({
  reason: z.string().trim().min(1, "解除理由を入力してください。").max(2000),
  /** true のとき当該回の実施分をパートナー請求候補に残す（やり直しで実施済み扱いにする場合） */
  partnerBillable: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ matchId: string; sessionNumber: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await readSession();
  const denied = requireAdminWriter(session);
  if (denied) return jsonError(denied.error, denied.status);

  const { matchId, sessionNumber } = await context.params;
  const n = Number(sessionNumber);
  if (!Number.isInteger(n) || n <= 0) return jsonError("回数の指定が不正です。");

  const match = await getMatchById(matchId);
  if (!match) return jsonError("マッチが見つかりません。", 404);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "入力内容が不正です。", 400);
  }

  const released = await adminReleaseConfirmedScheduleForReschedule({
    matchId,
    sessionNumber: n,
    releasedByUserId: session!.sub,
  });
  if (!released.ok) return jsonError(released.error, 409);

  const partnerBillable = parsed.data.partnerBillable === true;
  const excludeFromPartnerInvoice = !partnerBillable;

  await upsertSessionAbandonment({
    matchId,
    sessionNumber: n,
    reason: "admin_reschedule",
    markedBy: session!.sub,
    excludeFromPartnerInvoice,
  });

  const invoiceReconcile = excludeFromPartnerInvoice
    ? await reconcilePartnerInvoiceAfterScheduleRelease({
        partnerId: match.partnerId,
        matchId,
        sessionNumber: n,
        previousStartAt: released.previousStartAt,
      })
    : { draftLineRemoved: false, lockedInvoiceNeedsReview: false };

  const settings = await getEffectiveAppSettingsForMatch(matchId);
  const displayTz = settings.timezone || "Asia/Tokyo";
  const pretty = formatJaDateTimeRange(
    released.previousStartAt,
    released.previousEndAt,
    displayTz,
  );

  const sessionEnded =
    !Number.isNaN(new Date(released.previousEndAt).getTime()) &&
    new Date(released.previousEndAt).getTime() <= Date.now();

  const messageBody =
    `【運営による日程解除のお知らせ】\n` +
    (sessionEnded
      ? `第${n}回は再実施のため、確定済み日程（${pretty}）を解除し、再調整を開始します。\n`
      : `第${n}回の確定済み日程（${pretty}）を解除し、再調整を開始します。\n`) +
    `理由: ${parsed.data.reason}\n\n` +
    `以前お送りした確定メール・カレンダー登録の日程は無効となります。\n` +
    `担当パートナーが新しい候補日時を提示します。お手数ですがご確認ください。`;

  await createMessage({
    matchId,
    senderId: session!.sub,
    body: messageBody,
  });

  const origin = new URL(request.url).origin;
  await notifyMatchStakeholders(matchId, {
    appOrigin: origin,
    subject: `【重要】第${n}回の確定日程を解除しました（再調整）`,
    text:
      `${messageBody}\n\n` +
      `ルームの「1on1セッション」タブから再調整の状況をご確認ください。`,
  });

  const usersMap = await getUserMapByIds([session!.sub]);
  const adminUser = usersMap.get(session!.sub);
  const adminName = adminUser?.displayName ?? "運営";

  const billingNote = partnerBillable ? "（パートナー請求: 対象）" : "（パートナー請求: 対象外）";
  await appendAdminNotification({
    type: "RESCHEDULE",
    matchId,
    sessionNumber: n,
    actorUserId: session!.sub,
    actorRole: session!.role,
    summary: `${adminName}が第${n}回の確定日程（${pretty}）を解除しました${billingNote}。理由: ${parsed.data.reason}`,
    link: `/match/${matchId}#schedule`,
  });

  if (invoiceReconcile.draftLineRemoved) {
    await appendAdminNotification({
      type: "RESCHEDULE",
      matchId,
      sessionNumber: n,
      actorUserId: session!.sub,
      actorRole: session!.role,
      summary: `第${n}回: パートナーの下書き／差し戻し請求書から当該明細行を自動削除しました。`,
      link: `/admin/invoices`,
    });
  }
  if (invoiceReconcile.lockedInvoiceNeedsReview) {
    await appendAdminNotification({
      type: "RESCHEDULE",
      matchId,
      sessionNumber: n,
      actorUserId: session!.sub,
      actorRole: session!.role,
      summary: `【要確認】第${n}回: 提出済み／確定済み請求書に当該明細が残っています。差し戻し等で修正してください。`,
      link: `/admin/invoices`,
    });
  }

  const memberSummary = sessionEnded
    ? `運営が第${n}回の日程（${pretty}）を再実施のため解除しました。担当パートナーが新しい候補日時を提示します。`
    : `運営が第${n}回の確定日程（${pretty}）を解除しました。担当パートナーが新しい候補日時を提示します。`;
  await appendMemberNotification({
    recipientUserId: match.clientId,
    type: "RESCHEDULE",
    matchId,
    sessionNumber: n,
    actorUserId: session!.sub,
    actorRole: session!.role,
    summary: memberSummary,
    link: `/match/${matchId}#schedule`,
  });
  await appendMemberNotification({
    recipientUserId: match.partnerId,
    type: "RESCHEDULE",
    matchId,
    sessionNumber: n,
    actorUserId: session!.sub,
    actorRole: session!.role,
    summary: `${memberSummary} 候補日時の再提示をお願いします。`,
    link: `/match/${matchId}#schedule`,
  });

  return jsonOk({
    ok: true,
    sessionNumber: n,
    previousStartAt: released.previousStartAt,
    previousEndAt: released.previousEndAt,
    invoiceReconcile,
  });
}
