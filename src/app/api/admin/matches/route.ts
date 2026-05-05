import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { clearMatchAsAdmin, createMatchAsAdmin } from "@/lib/repositories/match-repository";

const postSchema = z.object({
  partnerId: z.string().min(1),
  clientId: z.string().min(1),
});

const deleteSchema = z.object({
  matchId: z.string().min(1).optional(),
  matchIds: z.array(z.string().min(1)).min(1).optional(),
});

export async function POST(request: Request) {
  const session = await readSession();
  if (!session || session.role !== "ADMIN") return jsonError("権限がありません。", 403);

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.partnerId === parsed.data.clientId) {
    return jsonError("入力内容が不正です。");
  }

  const result = await createMatchAsAdmin(parsed.data.partnerId, parsed.data.clientId);
  if (!result.ok) return jsonError(result.error, result.status ?? 400);
  return jsonOk({ ok: true, matchId: result.matchId });
}

export async function DELETE(request: Request) {
  const session = await readSession();
  if (!session || session.role !== "ADMIN") return jsonError("権限がありません。", 403);

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");
  const ids = parsed.data.matchIds ?? (parsed.data.matchId ? [parsed.data.matchId] : []);
  if (ids.length === 0) return jsonError("削除対象がありません。");

  for (const id of ids) {
    const result = await clearMatchAsAdmin(id);
    if (!result.ok) return jsonError(result.error, result.status ?? 400);
  }
  return jsonOk({ ok: true, deleted: ids.length });
}
