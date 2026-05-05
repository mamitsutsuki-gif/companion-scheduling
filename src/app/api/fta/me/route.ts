import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/json";
import { normalizeFtaChart } from "@/lib/fta";
import { getFtaByUserId, upsertFtaByUserId } from "@/lib/repositories/fta-repository";
import { readSession } from "@/lib/session";

const putSchema = z.object({
  chart: z.unknown(),
});
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const chart = await getFtaByUserId(session.sub);
  return jsonOk({ chart });
}

export async function PUT(request: Request) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");
  const chart = normalizeFtaChart(parsed.data.chart);
  const saved = await upsertFtaByUserId(session.sub, chart);
  return jsonOk({ ok: true, chart: saved });
}
