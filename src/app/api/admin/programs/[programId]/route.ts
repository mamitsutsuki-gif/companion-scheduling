import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import {
  countMatchesForProgram,
  deleteProgram,
  getProgramById,
} from "@/lib/repositories/program-repository";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ programId: string }> };

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "ADMIN_ASSISTANT")) {
    return jsonError("権限がありません。", 403);
  }
  const { programId } = await ctx.params;
  const program = await getProgramById(programId);
  if (!program) return jsonError("プログラムが見つかりません。", 404);
  const matchCount = await countMatchesForProgram(programId);
  return jsonOk({ program, matchCount });
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session || session.role !== "ADMIN") return jsonError("権限がありません。", 403);
  const { programId } = await ctx.params;
  const result = await deleteProgram(programId);
  if (!result.ok) return jsonError(result.error, 400);
  return jsonOk({ ok: true });
}
