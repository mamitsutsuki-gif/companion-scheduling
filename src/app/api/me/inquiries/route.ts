import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { INQUIRY_CATEGORIES, isInquiryCategory } from "@/lib/inquiry-categories";
import {
  createInquiry,
  listMyInquiries,
  type InquirySubmitterRole,
} from "@/lib/repositories/inquiry-repository";
import { notifyInquirySubmitted } from "@/lib/notify-inquiry";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
});

function isInquiryRole(role: string): role is InquirySubmitterRole {
  return role === "CLIENT" || role === "PARTNER";
}

export async function GET() {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (!isInquiryRole(session.role)) {
    return jsonError("この機能はクライアント・パートナー専用です。", 403);
  }
  const inquiries = await listMyInquiries(session.sub);
  return jsonOk({ inquiries });
}

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (!isInquiryRole(session.role)) {
    return jsonError("この機能はクライアント・パートナー専用です。", 403);
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容を確認してください。");
  if (!isInquiryCategory(parsed.data.category)) {
    return jsonError(`問い合わせ種別を選択してください。（${INQUIRY_CATEGORIES.join(" / ")}）`);
  }

  try {
    const inquiry = await createInquiry({
      userId: session.sub,
      submitterRole: session.role,
      name: parsed.data.name,
      category: parsed.data.category,
      body: parsed.data.body,
    });
    const history = await listMyInquiries(session.sub);
    void notifyInquirySubmitted({ inquiry, history });
    return jsonOk({ inquiry });
  } catch (err) {
    const e = err as Error & { http?: number };
    return jsonError(e.message ?? "送信に失敗しました。", e.http ?? 500);
  }
}
