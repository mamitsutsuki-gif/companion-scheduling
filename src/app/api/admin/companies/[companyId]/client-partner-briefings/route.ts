import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";
import {
  listClientsWithBriefingForCompany,
  upsertBriefingForCompanyClient,
} from "@/lib/repositories/client-partner-briefing-repository";
import { isFirebaseDataBackend } from "@/lib/firebase-admin";
import { z } from "zod";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ companyId: string }> };

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "ADMIN_ASSISTANT")) {
    return jsonError("権限がありません。", 403);
  }
  const { companyId } = await ctx.params;
  if (!companyId) return jsonError("企業IDが指定されていません。", 400);

  const settings = await getAppSettingsRow();
  if (!settings.companies.some((c) => c.id === companyId)) {
    return jsonError("登録されていない企業IDです。", 400);
  }

  const clients = await listClientsWithBriefingForCompany(companyId);
  return jsonOk({
    clients,
    dataBackendFirebase: isFirebaseDataBackend(),
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

  const settings = await getAppSettingsRow();
  if (!settings.companies.some((c) => c.id === companyId)) {
    return jsonError("登録されていない企業IDです。", 400);
  }

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
      const msg =
        res.error === "NOT_SUPPORTED"
          ? "このデータストア構成では保存できません。"
          : "一部のユーザーIDが、この企業のクライアントとして確認できません。";
      return jsonError(msg, 400);
    }
  }

  const clients = await listClientsWithBriefingForCompany(companyId);
  return jsonOk({ ok: true, clients });
}
