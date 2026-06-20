import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { resolveCompanionAccessForMatch } from "@/lib/companion-access";
import {
  deletePdcaEntry,
  getPdcaStore,
  newPdcaEntryId,
  upsertPdcaEntry,
} from "@/lib/repositories/companion-repository";
import { normalizePdcaEntry, pdcaSkillCounts } from "@/lib/companion-pdca";
import { getCompanySkillDefinitions, getSkillCheckProfile } from "@/lib/repositories/skill-check-repository";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ matchId: string }> };

const entrySchema = z.object({
  id: z.string().max(80).optional(),
  sessionNumber: z.number().int().min(1).max(60).nullable().optional(),
  periodLabel: z.string().max(120).optional(),
  focusTheme: z.string().max(500).optional(),
  focusSkillIds: z.array(z.string().max(80)).max(5).optional(),
  plan: z.string().max(4000).optional(),
  doText: z.string().max(4000).optional(),
  check: z.string().max(4000).optional(),
  act: z.string().max(4000).optional(),
  clientNotes: z.string().max(4000).optional(),
  coachComment: z.string().max(4000).optional(),
});

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCompanionAccessForMatch(matchId, { id: session.sub, role: session.role });
  if ("error" in access) {
    if (access.error === "not_found") return jsonError("マッチが見つかりません。", 404);
    if (access.error === "plan_disabled") return jsonError("このプランでは利用できません。", 403);
    return jsonError("権限がありません。", 403);
  }
  const [store, skills, skillProfile] = await Promise.all([
    getPdcaStore(access.targetUserId, access.companyId),
    getCompanySkillDefinitions(access.companyId),
    getSkillCheckProfile(access.targetUserId),
  ]);
  return jsonOk({
    store,
    skillCounts: pdcaSkillCounts(store.entries),
    skills,
    focusSkillIds: skillProfile?.focusSkillIds ?? [],
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
  const access = await resolveCompanionAccessForMatch(matchId, { id: session.sub, role: session.role });
  if ("error" in access) return jsonError("権限がありません。", 403);

  const body = await request.json().catch(() => null);
  const parsed = entrySchema.safeParse(body?.entry ?? body);
  if (!parsed.success) return jsonError("入力内容を確認してください。", 400);

  const existing = await getPdcaStore(access.targetUserId, access.companyId);
  const id = parsed.data.id ?? newPdcaEntryId();
  const prev = existing.entries.find((e) => e.id === id);
  const merged = normalizePdcaEntry(
    {
      ...prev,
      ...parsed.data,
      id,
      coachComment:
        parsed.data.coachComment !== undefined
          ? access.canEditCoach
            ? parsed.data.coachComment
            : prev?.coachComment ?? ""
          : prev?.coachComment ?? "",
      plan:
        parsed.data.plan !== undefined
          ? access.canEditClient
            ? parsed.data.plan
            : prev?.plan ?? ""
          : prev?.plan ?? "",
      doText:
        parsed.data.doText !== undefined
          ? access.canEditClient
            ? parsed.data.doText
            : prev?.doText ?? ""
          : prev?.doText ?? "",
      check:
        parsed.data.check !== undefined
          ? access.canEditClient
            ? parsed.data.check
            : prev?.check ?? ""
          : prev?.check ?? "",
      act:
        parsed.data.act !== undefined
          ? access.canEditClient
            ? parsed.data.act
            : prev?.act ?? ""
          : prev?.act ?? "",
      clientNotes:
        parsed.data.clientNotes !== undefined
          ? access.canEditClient
            ? parsed.data.clientNotes
            : prev?.clientNotes ?? ""
          : prev?.clientNotes ?? "",
      focusTheme:
        parsed.data.focusTheme !== undefined
          ? access.canEditClient
            ? parsed.data.focusTheme
            : prev?.focusTheme ?? ""
          : prev?.focusTheme ?? "",
      focusSkillIds:
        parsed.data.focusSkillIds !== undefined
          ? access.canEditClient
            ? parsed.data.focusSkillIds
            : prev?.focusSkillIds ?? []
          : prev?.focusSkillIds ?? [],
      periodLabel:
        parsed.data.periodLabel !== undefined
          ? access.canEditClient
            ? parsed.data.periodLabel
            : prev?.periodLabel ?? ""
          : prev?.periodLabel ?? "",
      sessionNumber:
        parsed.data.sessionNumber !== undefined
          ? access.canEditClient
            ? parsed.data.sessionNumber
            : prev?.sessionNumber ?? null
          : prev?.sessionNumber ?? null,
    },
    id,
  );
  if (!merged) return jsonError("保存できませんでした。", 400);
  if (!access.canEditClient && !access.canEditCoach) return jsonError("編集権限がありません。", 403);

  const store = await upsertPdcaEntry(access.targetUserId, access.companyId, merged);
  return jsonOk({ store, skillCounts: pdcaSkillCounts(store.entries) });
}

export async function DELETE(request: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCompanionAccessForMatch(matchId, { id: session.sub, role: session.role });
  if ("error" in access || !access.canEditClient) return jsonError("削除権限がありません。", 403);
  const url = new URL(request.url);
  const entryId = url.searchParams.get("entryId") ?? "";
  if (!entryId) return jsonError("entryId が必要です。", 400);
  const store = await deletePdcaEntry(access.targetUserId, access.companyId, entryId);
  return jsonOk({ store, skillCounts: pdcaSkillCounts(store.entries) });
}
