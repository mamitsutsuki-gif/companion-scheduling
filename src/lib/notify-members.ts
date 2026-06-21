import { sendMail, type MailInput } from "@/lib/mail";
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

  const m = await getMatchById(matchId);

  // 本番では APP_ORIGIN（公開URL）を優先。request.url の origin は内部ホストになることがある。
  const appBase = (process.env.APP_ORIGIN || input.appOrigin || "").replace(/\/$/, "");
  const linkLine = appBase ? `\n\nルームを開く: ${appBase}/match/${matchId}` : "";

  const partnerAddr = partnerEmail.trim().toLowerCase();
  const clientAddr = clientEmail.trim().toLowerCase();

  for (const to of uniq) {
    const lower = to.toLowerCase();
    let bodyIntro: string;
    if (m && lower === partnerAddr) {
      bodyIntro = `${m.partner.displayName}さん\n\n`;
    } else if (m && lower === clientAddr) {
      bodyIntro = `${m.client.displayName}さん\n\n`;
    } else {
      bodyIntro = `[${pairLabel}]\n\n`;
    }
    await sendMail({
      to,
      subject: input.subject,
      text: bodyIntro + input.text + linkLine,
      html: input.html
        ? `<p><strong>${escapeHtml(bodyIntro.trim())}</strong></p>${input.html}`
        : undefined,
      attachments: input.attachments,
    });
  }
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

/** ロールプレイ評価が双方入力完了し、相互開示されたタイミングで通知。 */
export async function notifyRoleplayMutualReveal(input: {
  matchId: string;
  sessionNumber: number;
  appOrigin?: string;
}) {
  try {
    const m = await getMatchById(input.matchId);
    if (!m?.partner?.id || !m.client?.id) return;
    const partnerId = m.partner.id;
    const clientId = m.client.id;
    const sn = input.sessionNumber;
    const roomPath = `/match/${encodeURIComponent(input.matchId)}/sessions/${sn}`;
    const appBase = (process.env.APP_ORIGIN || input.appOrigin || "").replace(/\/$/, "");
    const absLink = appBase ? `${appBase}${roomPath}` : roomPath;

    const summary = `第 ${sn} 回のロールプレイ評価が双方入力完了しました。フィードバックとレーダーチャートをご確認ください。`;
    const emailSubject = `ロールプレイ評価：フィードバックが届きました（第 ${sn} 回）`;
    const emailBody =
      `第 ${sn} 回のロールプレイ評価について、クライアントとパートナー双方の入力が完了しました。\n` +
      `アプリ上でお互いのフィードバックとレーダーチャートをご確認ください。\n\n${absLink}`;

    await appendMemberNotification({
      recipientUserId: partnerId,
      type: "ROLEPLAY_REVEALED",
      matchId: input.matchId,
      sessionNumber: sn,
      summary,
      link: roomPath,
    });
    await appendMemberNotification({
      recipientUserId: clientId,
      type: "ROLEPLAY_REVEALED",
      matchId: input.matchId,
      sessionNumber: sn,
      summary,
      link: roomPath,
    });

    const [partnerEmail, clientEmail] = await Promise.all([
      resolveUserEmailForNotifications(partnerId),
      resolveUserEmailForNotifications(clientId),
    ]);

    if (partnerEmail?.trim()) {
      await sendMail({
        to: partnerEmail.trim(),
        subject: emailSubject,
        text: `${m.partner.displayName}さん\n\n${emailBody}`,
      });
    }
    if (clientEmail?.trim()) {
      await sendMail({
        to: clientEmail.trim(),
        subject: emailSubject,
        text: `${m.client.displayName}さん\n\n${emailBody}`,
      });
    }
  } catch (e) {
    console.error("[notify] notifyRoleplayMutualReveal failed", input.matchId, e);
  }
}
