import { clearSessionCookie } from "@/lib/session";
import { jsonOk } from "@/lib/json";

export async function POST() {
  await clearSessionCookie();
  return jsonOk({ ok: true });
}
