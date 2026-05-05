import nodemailer from "nodemailer";

export type MailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: string; contentType: string }[];
};

let transporterPromise: Promise<nodemailer.Transporter | null> | null = null;

async function getSmtpTransport() {
  if (transporterPromise) return transporterPromise;
  transporterPromise = (async () => {
    const host = process.env.SMTP_HOST;
    const from = process.env.SMTP_FROM;
    if (!host || !from) return null;

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
  const from = process.env.SMTP_FROM?.trim();
  if (!apiKey || !from) return false;

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
  const from = process.env.SMTP_FROM;

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

export async function sendMailToMany(
  recipients: string[],
  input: Omit<MailInput, "to">,
) {
  const uniq = [...new Set(recipients.map((e) => e.trim()).filter(Boolean))];
  for (const to of uniq) {
    await sendMail({ ...input, to });
    // Resend free-tier rate limit: 2 requests / sec.
    await new Promise((resolve) => setTimeout(resolve, 550));
  }
}
