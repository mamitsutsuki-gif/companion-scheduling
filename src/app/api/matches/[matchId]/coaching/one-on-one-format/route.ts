import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { resolveCoachingAccessForMatch } from "@/lib/coaching-access";
import { getOneOnOneFormat, saveOneOnOneFormat } from "@/lib/repositories/coaching-repository";
import { normalizeFormatField } from "@/lib/coaching-one-on-one-format";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ matchId: string }> };

const patchSchema = z.object({
  notes: z.string().max(4000).optional(),
  fields: z
    .array(
      z.object({
        id: z.string().max(80),
        label: z.string().max(200),
        type: z.enum(["text", "textarea", "select", "number"]).optional(),
        value: z.string().max(8000).optional(),
      }),
    )
    .max(64)
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
  const doc = await getOneOnOneFormat(matchId);
  return jsonOk({
    doc,
    placeholder: true,
    permissions: {
      canEditClient: access.canEditClient,
      canEditPartner: access.canEditPartner,
    },
  });
}

export async function PUT(request: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const { matchId } = await ctx.params;
  const access = await resolveCoachingAccessForMatch(matchId, { id: session.sub, role: session.role });
  if ("error" in access) return jsonError("権限がありません。", 403);
  if (!access.canEditClient && !access.canEditPartner) return jsonError("編集権限がありません。", 403);

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonError("入力内容を確認してください。", 400);

  const current = await getOneOnOneFormat(matchId);
  const nextFields =
    parsed.data.fields !== undefined
      ? parsed.data.fields
          .map((f, i) => normalizeFormatField(f, f.id || `f-${i + 1}`))
          .filter((f): f is NonNullable<typeof f> => f !== null)
      : current.fields;
  const saved = await saveOneOnOneFormat({
    ...current,
    matchId,
    notes: parsed.data.notes !== undefined ? parsed.data.notes : current.notes,
    fields: nextFields,
  });
  return jsonOk({ doc: saved });
}
