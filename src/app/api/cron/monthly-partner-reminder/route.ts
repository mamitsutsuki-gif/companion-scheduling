import { runMonthlyPartnerAvailabilityReminderCron } from "@/lib/monthly-partner-reminder-cron";
import { jsonError, jsonOk } from "@/lib/json";

export const dynamic = "force-dynamic";

/** 毎日実行。12日 / 27日（日本時間）のみ対象パートナーへ予定登録リマインドを送る。 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return jsonError("CRON_SECRET が未設定です。", 503);

  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const q = new URL(request.url).searchParams.get("secret") ?? "";
  if (bearer !== secret && q !== secret) return jsonError("認証に失敗しました。", 401);

  const result = await runMonthlyPartnerAvailabilityReminderCron();
  return jsonOk(result);
}
