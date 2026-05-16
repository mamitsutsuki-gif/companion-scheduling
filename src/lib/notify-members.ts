import { sendMail, sendMailToMany, type MailInput } from "@/lib/mail";
import { appendMemberNotification } from "@/lib/repositories/member-notification-repository";
import { getMatchById } from "@/lib/repositories/match-repository";
import { listAdminEmails, resolveUserEmailForNotifications } from "@/lib/repositories/user-repository";

/** トリム済み一意の管理者メール */
export async function getAdminEmails(): Promise<string[]> {
  return listAdminEmails();
}

async function emailsForMatch(matchId: string) {
  const m = await getMatchById(matchId);
  if (!m) return { partnerEmail: "", clientEmail: "", pairLabel: "" };
  const pairLabel = `${m.partner.displayName}さん ／ ${m.client.displayName}さん`;
  const [partnerEmail, clientEmail] = await Promise.all([
    resolveUserEmailForNotifications(m.partner.id),
    resolveUserEmailForNotifications(m.client.id),
  ]);
  return {
    partnerEmail: partnerEmail ?? "",
    clientEmail: clientEmail ?? "",
    pairLabel,
  };
}

/**
 * マッチ参加者＋管理者に同一文面で通知（宛先ごと個別送信）。
 * `excludeUserId` があればそのユーザーのみ宛先から除外。
 */
export async function notifyMatchStakeholders(
  matchId: string,
  input: {
    subject: string;
    text: string;
    html?: string;
    excludeUserId?: string;
    attachments?: MailInput["attachments"];
    appOrigin?: string;
  },
) {
  const { partnerEmail, clientEmail, pairLabel } = await emailsForMatch(matchId);
  const admins = await getAdminEmails();

  const exclude = new Set<string>();
  if (input.excludeUserId) {
    const email = await resolveUserEmailForNotifications(input.excludeUserId);
    if (email) exclude.add(email.trim().toLowerCase());
  }

  const targets: string[] = [];
  const push = (e?: string | null) => {
    const t = e?.trim();
    if (!t) return;
    if (exclude.has(t.toLowerCase())) return;
    targets.push(t);
  };
  push(partnerEmail);
  push(clientEmail);
  admins.forEach((a) => push(a));

  const uniq = [...new Set(targets)];

  if (uniq.length === 0) {
    console.warn("[notify] notifyMatchStakeholders: no recipients (check user emails / Firebase Auth)", {
      matchId,
      pairLabel,
    });
    return;
  }

  // 本番では APP_ORIGIN（公開URL）を優先。request.url の origin は内部ホストになることがある。
  const appBase = (process.env.APP_ORIGIN || input.appOrigin || "").replace(/\/$/, "");
  const linkLine = appBase ? `\n\nルームを開く: ${appBase}/match/${matchId}` : "";

  const bodyIntro = `[${pairLabel}]\n\n`;
  await sendMailToMany(uniq, {
    subject: input.subject,
    text: bodyIntro + input.text + linkLine,
    html: input.html
      ? `<p><strong>${escapeHtml(pairLabel)}</strong></p>${input.html}`
      : undefined,
    attachments: input.attachments,
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function summarizeChatLine(body: string, max = 480) {
  const one = body.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max)}…`;
}

/**
 * 管理者がペアマッチングを作成した直後に、パートナー・クライアント双方へ
 * アプリ通知＋個別文言のメールを送る（失敗してもログのみで握りつぶす）。
 */
export async function notifyNewMatchAssignment(matchId: string) {
  try {
    const m = await getMatchById(matchId);
    if (!m?.partner?.id || !m.client?.id) return;
    const partnerId = m.partner.id;
    const clientId = m.client.id;
    const roomPath = `/match/${encodeURIComponent(matchId)}`;
    const appBase = (process.env.APP_ORIGIN || "").replace(/\/$/, "");
    const absLink = appBase ? `${appBase}${roomPath}` : roomPath;

    await appendMemberNotification({
      recipientUserId: partnerId,
      type: "MATCH_ASSIGNED",
      matchId,
      summary: "担当のクライアントが決まりました。アプリ上から確認してください。",
      link: roomPath,
    });
    await appendMemberNotification({
      recipientUserId: clientId,
      type: "MATCH_ASSIGNED",
      matchId,
      summary: "専属の対話パートナーが決まりました。アプリ上から確認してください。",
      link: roomPath,
    });

    const [partnerEmail, clientEmail] = await Promise.all([
      resolveUserEmailForNotifications(partnerId),
      resolveUserEmailForNotifications(clientId),
    ]);

    const partnerText = `担当のクライアントが決まりました。アプリ上から確認してください。\n\n${absLink}`;
    const clientText = `専属の対話パートナーが決まりました。アプリ上から確認してください。\n\n${absLink}`;

    if (partnerEmail?.trim()) {
      await sendMail({
        to: partnerEmail.trim(),
        subject: "担当のクライアントが決まりました",
        text: partnerText,
      });
    }
    if (clientEmail?.trim()) {
      await sendMail({
        to: clientEmail.trim(),
        subject: "専属の対話パートナーが決まりました",
        text: clientText,
      });
    }
  } catch (e) {
    console.error("[notify] notifyNewMatchAssignment failed", matchId, e);
  }
}
