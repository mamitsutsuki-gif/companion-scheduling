import nodemailer from "nodemailer";

export type MailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: string; contentType: string }[];
};

const DEFAULT_MAIL_FROM = "モチベイジクラウド <customer@motive-iji.com>";

/**
 * メール差出人を解決する。優先順位: SMTP_FROM > MAIL_FROM > 既定値。
 * staging / Firebase App Hosting で SMTP_FROM 未設定でも、必ず
 * customer@motive-iji.com から送信される。
 */
export function resolveMailFrom() {
  return (
    process.env.SMTP_FROM?.trim() ||
    process.env.MAIL_FROM?.trim() ||
    DEFAULT_MAIL_FROM
  );
}

let transporterPromise: Promise<nodemailer.Transporter | null> | null = null;

async function getSmtpTransport() {
  if (transporterPromise) return transporterPromise;
  transporterPromise = (async () => {
    const host = process.env.SMTP_HOST;
    if (!host) return null;

    const port = Number(process.env.SMTP_PORT ?? "587");
    const secure = process.env.SMTP_SECURE === "true" || port === 465;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });
  })();
  return transporterPromise;
}

async function sendViaResend(input: MailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return false;
  const from = resolveMailFrom();

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.content, "utf8").toString("base64"),
        })),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[mail] Resend send failed", res.status, detail);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[mail] Resend send failed", e);
    return false;
  }
}

/** 開発時や SMTP 未設定時はコンソールに出す */
export async function sendMail(input: MailInput): Promise<boolean> {
  const resendOk = await sendViaResend(input);
  if (resendOk) return true;

  const transport = await getSmtpTransport();
  const from = resolveMailFrom();

  if (transport && from) {
    try {
      await transport.sendMail({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });
      return true;
    } catch (e) {
      console.error("[mail] SMTP send failed", e);
      return false;
    }
  }

  const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
  // eslint-disable-next-line no-console
  console.log(`[mail] (SMTP未設定・コンソールのみ) → ${input.to} | ${input.subject}\n${input.text}`, {
    origin,
    attachments: input.attachments?.map((a) => a.filename),
  });
  return false;
}

/**
 * Resend Free の制限（2 req/sec）を確実に守るためのインプロセススロットル。
 * - 同一プロセス内で逐次送信（送信失敗は console.error に集約）
 * - 1 リクエストの宛先数を **最大 50 件** に制限し DDoS / 暴走を抑止
 */
const SEND_RATE_INTERVAL_MS = 550;
const SEND_TO_CAP = 50;
let lastSendAt = 0;

async function throttle() {
  const wait = Math.max(0, SEND_RATE_INTERVAL_MS - (Date.now() - lastSendAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastSendAt = Date.now();
}

export async function sendMailToMany(
  recipients: string[],
  input: Omit<MailInput, "to">,
) {
  const uniq = [...new Set(recipients.map((e) => e.trim()).filter(Boolean))].slice(0, SEND_TO_CAP);
  let okCount = 0;
  let failCount = 0;
  for (const to of uniq) {
    await throttle();
    const ok = await sendMail({ ...input, to });
    if (ok) okCount += 1;
    else failCount += 1;
  }
  if (failCount > 0) {
    console.warn(
      `[mail] sendMailToMany finished: subject="${input.subject.slice(0, 60)}" ok=${okCount} fail=${failCount}`,
    );
  }
}
