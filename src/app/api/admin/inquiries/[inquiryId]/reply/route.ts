import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { requireAdminish } from "@/lib/admin-access";
import { listMyInquiries, replyToInquiry } from "@/lib/repositories/inquiry-repository";
import { notifyInquiryReplied } from "@/lib/notify-inquiry";
import { getUserById } from "@/lib/repositories/user-repository";

const bodySchema = z.object({
  replyBody: z.string().trim().min(1).max(5000),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ inquiryId: string }> },
) {
  const session = await readSession();
  const denied = requireAdminish(session);
  if (denied) return jsonError(denied.error, denied.status);

  const { inquiryId } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("回答内容を入力してください。");

  try {
    const inquiry = await replyToInquiry({
      inquiryId,
      repliedByUserId: session!.sub,
      replyBody: parsed.data.replyBody,
    });
    const history = await listMyInquiries(inquiry.userId);
    const admin = await getUserById(session!.sub);
    void notifyInquiryReplied({
      inquiry,
      history,
      adminDisplayName: admin?.displayName ?? "モチベイジクラウド サポート",
    });
    return jsonOk({ inquiry });
  } catch (err) {
    const e = err as Error & { http?: number };
    return jsonError(e.message ?? "回答の送信に失敗しました。", e.http ?? 500);
  }
}
