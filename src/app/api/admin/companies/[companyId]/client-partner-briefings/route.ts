import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import {
  listClientsWithBriefingForCompany,
  upsertBriefingForCompanyClient,
} from "@/lib/repositories/client-partner-briefing-repository";
import { z } from "zod";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ companyId: string }> };

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  /** 機密項目: 運用 ADMIN のみ一覧取得可（ADMIN_ASSISTANT / クライアント系からは見えない） */
  if (!session || session.role !== "ADMIN") {
    return jsonError("権限がありません。", 403);
  }
  const { companyId } = await ctx.params;
  if (!companyId) return jsonError("企業IDが指定されていません。", 400);

  /** テナント未登録の companyId で所属ユーザーがいる場合も一覧できるようにする */
  const clients = await listClientsWithBriefingForCompany(companyId);
  return jsonOk({
    clients,
  });
}

const patchSchema = z.object({
  updates: z
    .array(
      z.object({
        clientUserId: z.string().min(1),
        /** 整数 0–120 または null（未入力扱い） */
        age: z.union([z.number().int().min(0).max(120), z.null()]),
        /** 役職。null または空相当で削除 */
        jobTitle: z.union([z.string().max(200), z.null()]),
      }),
    )
    .max(500),
});

/**
 * ADMIN のみ。この情報は機密として扱う。
 */
export async function PATCH(request: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session || session.role !== "ADMIN") return jsonError("権限がありません。", 403);
  const { companyId } = await ctx.params;
  if (!companyId) return jsonError("企業IDが指定されていません。", 400);

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  for (const row of parsed.data.updates) {
    const res = await upsertBriefingForCompanyClient({
      companyId,
      clientUserId: row.clientUserId,
      age: row.age,
      jobTitle: row.jobTitle,
    });
    if (!res.ok) {
      return jsonError(
        "一部のユーザーIDが、この企業のクライアントとして確認できません。",
        400,
      );
    }
  }

  const clients = await listClientsWithBriefingForCompany(companyId);
  return jsonOk({ ok: true, clients });
}
