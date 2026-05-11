import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { resolveMailFrom } from "@/lib/mail";
import { resolveUserEmailForNotifications } from "@/lib/repositories/user-repository";

/**
 * 管理者向けメール送信テスト用エンドポイント（詳細診断モード）。
 *
 *   POST /api/admin/test-mail            → ログイン中の管理者のメールアドレス宛てにテスト送信
 *   POST /api/admin/test-mail { "to": ".." } → 任意のアドレスに送信
 *
 * Resend へ直接 fetch して、API のステータスとレスポンスボディをそのまま画面に返す。
 * 一般の sendMail() は失敗を bool で抑え込んでしまうため、原因解析のために
 * このエンドポイントだけ詳細を吐く設計にしている。
 */
const bodySchema = z
  .object({
    to: z.string().email().max(200).optional(),
  })
  .default({});

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "ADMIN") {
    return jsonError("管理者のみ操作できます。", 403);
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  const to =
    parsed.data.to?.trim().toLowerCase() ||
    (await resolveUserEmailForNotifications(session.sub));
  if (!to) {
    return jsonError(
      "送信先メールアドレスを判定できませんでした。ログイン中の管理者のメールアドレスを設定するか、to= で明示してください。",
      400,
    );
  }

  const from = resolveMailFrom();
  const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const hasSmtp = Boolean(process.env.SMTP_HOST?.trim());

  const subject = "【テスト】モチベイジクラウド メール送信確認";
  const text = [
    "これはメール送信機能のテストメールです。",
    "",
    `送信元: ${from}`,
    `APP_ORIGIN: ${origin}`,
    `送信時刻: ${new Date().toISOString()}`,
    "",
    "このメールが届いていれば、Resend の送信ドメイン認証および環境変数の設定は正しく完了しています。",
  ].join("\n");

  // RESEND_API_KEY 未設定なら早期に return（フォールバックは sendMail に委ねず詳細を出す）
  if (!apiKey) {
    return jsonOk({
      ok: false,
      sentTo: to,
      from,
      origin,
      driver: hasSmtp ? "smtp" : "console",
      hint: "RESEND_API_KEY が未設定です。Firebase App Hosting の環境変数を確認してください。",
    });
  }

  // Resend へ直接送信し、ステータスとレスポンスをそのまま開示する
  let resendStatus = 0;
  let resendBody = "";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
      }),
    });
    resendStatus = res.status;
    resendBody = await res.text().catch(() => "");
  } catch (e) {
    return jsonOk({
      ok: false,
      sentTo: to,
      from,
      origin,
      driver: "resend",
      hint: `Resend API への通信に失敗しました: ${String(e)}`,
    });
  }

  const ok = resendStatus >= 200 && resendStatus < 300;
  let parsedBody: unknown = null;
  try {
    parsedBody = resendBody ? JSON.parse(resendBody) : null;
  } catch {
    parsedBody = resendBody.slice(0, 400);
  }

  return jsonOk({
    ok,
    sentTo: to,
    from,
    origin,
    driver: "resend",
    resendStatus,
    resendBody: parsedBody,
    hint: ok
      ? "Resend が受領しました。受信箱と迷惑メールフォルダを確認してください。"
      : interpretResendError(resendStatus, resendBody),
  });
}

/** Resend のエラーレスポンスを日本語で噛み砕いて返す */
function interpretResendError(status: number, body: string): string {
  const lower = body.toLowerCase();
  if (status === 401 || status === 403) {
    return "API キーが無効、または送信権限がありません。Firebase の RESEND_API_KEY を見直してください。";
  }
  if (status === 422 || lower.includes("domain") || lower.includes("verify")) {
    return "送信元ドメインが Resend で未認証、または SMTP_FROM の値がドメイン認証済みでないアドレスです。Resend の Domains で motive-iji.com（または認証済み subdomain）が緑✓になっているか、SMTP_FROM のアドレスがそのドメイン配下か確認してください。";
  }
  if (status === 429) {
    return "Resend のレート上限に達しました。少し待って再試行してください。";
  }
  if (status === 0) {
    return "Resend API に到達できませんでした。";
  }
  return `Resend が ${status} を返しました。詳細レスポンスを参照して修正してください。`;
}
