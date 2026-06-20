import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { resolveCoachingAccessForMatch } from "@/lib/coaching-access";
import { QUESTION_QUADRANTS, newQuestionId, normalizeQuestion } from "@/lib/coaching-questions";
import { getQuestionStore, saveQuestionStore } from "@/lib/repositories/coaching-repository";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ matchId: string }> };

const questionSchema = z.object({
  id: z.string().max(80).optional(),
  text: z.string().max(2000).optional(),
  purpose: z.string().max(2000).optional(),
  memo: z.string().max(2000).optional(),
  quadrant: z
    .enum(["both_know", "report_knows", "manager_knows", "neither_knows", "unassigned"])
    .optional(),
});

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCoachingAccessForMatch(matchId, { id: session.sub, role: session.role });
  if ("error" in access) {
    if (access.error === "plan_disabled") return jsonError("このプランでは利用できません。", 403);
    return jsonError("権限がありません。", 403);
  }
  const store = await getQuestionStore(access.targetUserId, access.companyId);
  return jsonOk({
    store,
    quadrants: QUESTION_QUADRANTS,
    permissions: { canEditClient: access.canEditClient },
  });
}

export async function PUT(request: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCoachingAccessForMatch(matchId, { id: session.sub, role: session.role });
  if ("error" in access || !access.canEditClient) return jsonError("編集権限がありません。", 403);

  const body = await request.json().catch(() => null);
  const parsed = questionSchema.safeParse(body?.question ?? body);
  if (!parsed.success) return jsonError("入力内容を確認してください。", 400);

  const store = await getQuestionStore(access.targetUserId, access.companyId);
  const id = parsed.data.id ?? newQuestionId();
  const prev = store.questions.find((q) => q.id === id);
  const merged = normalizeQuestion(
    {
      ...prev,
      ...parsed.data,
      id,
      updatedAt: new Date().toISOString(),
      createdAt: prev?.createdAt ?? new Date().toISOString(),
    },
    id,
  );
  if (!merged) return jsonError("質問文を入力してください。", 400);

  const nextQuestions = store.questions.filter((q) => q.id !== id);
  nextQuestions.unshift(merged);
  const saved = await saveQuestionStore({
    ...store,
    userId: access.targetUserId,
    companyId: access.companyId,
    questions: nextQuestions,
  });
  return jsonOk({ store: saved });
}

export async function DELETE(request: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCoachingAccessForMatch(matchId, { id: session.sub, role: session.role });
  if ("error" in access || !access.canEditClient) return jsonError("削除権限がありません。", 403);

  const entryId = new URL(request.url).searchParams.get("id") ?? "";
  if (!entryId) return jsonError("id が必要です。", 400);

  const store = await getQuestionStore(access.targetUserId, access.companyId);
  const saved = await saveQuestionStore({
    ...store,
    questions: store.questions.filter((q) => q.id !== entryId),
  });
  return jsonOk({ store: saved });
}
