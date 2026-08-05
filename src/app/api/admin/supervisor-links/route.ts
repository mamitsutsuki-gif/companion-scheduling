import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getUserById } from "@/lib/repositories/user-repository";
import {
  createSupervisorLink,
  deleteSupervisorLink,
  listSupervisorLinksForCompany,
} from "@/lib/repositories/supervisor-links-repository";

export const dynamic = "force-dynamic";

const postSchema = z.object({
  supervisorId: z.string().min(1),
  clientId: z.string().min(1),
  programId: z.string().min(1).optional().nullable(),
  companyId: z.string().min(1).optional(),
});

const deleteSchema = z.object({
  linkId: z.string().min(1),
});

export async function GET(request: Request) {
  const session = await readSession();
  if (!session || session.role !== "ADMIN") return jsonError("権限がありません。", 403);

  const companyId = new URL(request.url).searchParams.get("companyId")?.trim() || "";
  if (!companyId) return jsonError("companyId が必要です。");

  const links = await listSupervisorLinksForCompany(companyId);
  const enriched = await Promise.all(
    links.map(async (l) => {
      const [supervisor, client] = await Promise.all([
        getUserById(l.supervisorId),
        getUserById(l.clientId),
      ]);
      return {
        ...l,
        supervisorName: supervisor?.displayName ?? "不明",
        supervisorEmail: (supervisor as { email?: string } | null)?.email ?? "",
        clientName: client?.displayName ?? "不明",
        clientEmail: (client as { email?: string } | null)?.email ?? "",
      };
    }),
  );

  return jsonOk({ links: enriched });
}

export async function POST(request: Request) {
  const session = await readSession();
  if (!session || session.role !== "ADMIN") return jsonError("権限がありません。", 403);

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  const result = await createSupervisorLink({
    supervisorId: parsed.data.supervisorId,
    clientId: parsed.data.clientId,
    programId: parsed.data.programId ?? null,
    createdBy: session.sub,
  });
  if (!result.ok) return jsonError(result.error, result.status ?? 400);

  // companyId 指定時は所属一致の再確認（UI からの誤送信防止）
  if (parsed.data.companyId && result.link.companyId !== parsed.data.companyId) {
    await deleteSupervisorLink(result.link.id);
    return jsonError("指定企業と紐づけ先の企業が一致しません。");
  }

  return jsonOk({ ok: true, link: result.link });
}

export async function DELETE(request: Request) {
  const session = await readSession();
  if (!session || session.role !== "ADMIN") return jsonError("権限がありません。", 403);

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  const result = await deleteSupervisorLink(parsed.data.linkId);
  if (!result.ok) return jsonError(result.error, result.status ?? 400);
  return jsonOk({ ok: true });
}
