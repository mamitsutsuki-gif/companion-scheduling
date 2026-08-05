import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { resolveCompanionAccessForMatch } from "@/lib/companion-access";
import {
  deleteActionBrakeEntry,
  getActionBrakeStore,
  newActionBrakeEntryId,
  upsertActionBrakeEntry,
} from "@/lib/repositories/companion-repository";
import { ACTION_BRAKE_TEXT_MAX, normalizeActionBrakeEntry } from "@/lib/companion-action-brake";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ matchId: string }> };

const entrySchema = z.object({
  id: z.string().max(80).optional(),
  title: z.string().max(200).optional(),
  pdcaEntryId: z.string().max(80).nullable().optional(),
  eventText: z.string().max(ACTION_BRAKE_TEXT_MAX).optional(),
  emotionText: z.string().max(ACTION_BRAKE_TEXT_MAX).optional(),
  actionTakenText: z.string().max(ACTION_BRAKE_TEXT_MAX).optional(),
  resultText: z.string().max(ACTION_BRAKE_TEXT_MAX).optional(),
  automaticThoughtText: z.string().max(ACTION_BRAKE_TEXT_MAX).optional(),
  thoughtRewriteText: z.string().max(ACTION_BRAKE_TEXT_MAX).optional(),
  habitNotesText: z.string().max(ACTION_BRAKE_TEXT_MAX).optional(),
});

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCompanionAccessForMatch(
    matchId,
    { id: session.sub, role: session.role },
    { feature: "actionBrakeAnalysis" },
  );
  if ("error" in access) {
    if (access.error === "not_found") return jsonError("マッチが見つかりません。", 404);
    if (access.error === "plan_disabled") return jsonError("このプランでは利用できません。", 403);
    return jsonError("権限がありません。", 403);
  }
  const store = await getActionBrakeStore(access.targetUserId, access.companyId);
  return jsonOk({
    store,
    permissions: {
      canEditClient: access.canEditClient,
      canEditCoach: access.canEditCoach,
    },
  });
}

export async function PUT(request: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCompanionAccessForMatch(
    matchId,
    { id: session.sub, role: session.role },
    { feature: "actionBrakeAnalysis" },
  );
  if ("error" in access) return jsonError("権限がありません。", 403);
  if (!access.canEditClient && !access.canEditCoach) {
    return jsonError("編集権限がありません。", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = entrySchema.safeParse(body?.entry ?? body);
  if (!parsed.success) return jsonError("入力内容を確認してください。", 400);

  const existing = await getActionBrakeStore(access.targetUserId, access.companyId);
  const id = parsed.data.id ?? newActionBrakeEntryId();
  const prev = existing.entries.find((e) => e.id === id);
  const merged = normalizeActionBrakeEntry(
    {
      ...prev,
      ...parsed.data,
      id,
      createdAt: prev?.createdAt,
    },
    id,
  );
  if (!merged) return jsonError("入力内容を確認してください。", 400);

  const store = await upsertActionBrakeEntry(access.targetUserId, access.companyId, merged);
  return jsonOk({ store });
}

export async function DELETE(request: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCompanionAccessForMatch(
    matchId,
    { id: session.sub, role: session.role },
    { feature: "actionBrakeAnalysis" },
  );
  if ("error" in access) return jsonError("権限がありません。", 403);
  if (!access.canEditClient) return jsonError("削除権限がありません。", 403);

  const entryId = new URL(request.url).searchParams.get("entryId")?.trim() || "";
  if (!entryId) return jsonError("entryId が必要です。");
  const store = await deleteActionBrakeEntry(access.targetUserId, access.companyId, entryId);
  return jsonOk({ store });
}
