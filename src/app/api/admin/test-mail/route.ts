import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { resolveMailFrom, sendMail } from "@/lib/mail";
import { resolveUserEmailForNotifications } from "@/lib/repositories/user-repository";

/**
 * 管理者向けメール送信テスト用エンドポイント。
 *   POST /api/admin/test-mail            → ログイン中の管理者のメールアドレス宛てにテスト送信
 *   POST /api/admin/test-mail { "to": ".." } → 任意のアドレスに送信（同じテナント内の確認用）
 *
 * 目的: Resend の送信ドメイン認証 / 環境変数 (RESEND_API_KEY, SMTP_FROM, APP_ORIGIN) が
 *   本番（Firebase App Hosting）で正しく設定されているかをワンクリックで検証する。
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
  const hasResend = Boolean(process.env.RESEND_API_KEY?.trim());
  const hasSmtp = Boolean(process.env.SMTP_HOST?.trim());

  const subject = "【テスト】モチベイジクラウド メール送信確認";
  const text = [
    "これはメール送信機能のテストメールです。",
    "",
    `送信元: ${from}`,
    `送信ドライバ: ${hasResend ? "Resend API" : hasSmtp ? "SMTP" : "（コンソールのみ）"}`,
    `APP_ORIGIN: ${origin}`,
    `送信時刻: ${new Date().toISOString()}`,
    "",
    "このメールが届いていれば、Resend の送信ドメイン認証および環境変数の設定は正しく完了しています。",
    "本番運用では、チャット・日程確定・請求書ステータス更新などのイベント時に自動でメールが送信されます。",
  ].join("\n");

  const ok = await sendMail({ to, subject, text });

  return jsonOk({
    ok,
    sentTo: to,
    from,
    origin,
    driver: hasResend ? "resend" : hasSmtp ? "smtp" : "console",
    hint: ok
      ? "メールサーバーは受領しました。実際の受信フォルダ（迷惑メールフォルダも含む）で確認してください。"
      : "送信に失敗しました。サーバーログで [mail] のエラー詳細を確認し、RESEND_API_KEY / 送信ドメイン認証 / SMTP_FROM の設定を見直してください。",
  });
}
