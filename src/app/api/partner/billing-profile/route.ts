import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import {
  getPartnerBillingProfile,
  upsertPartnerBillingProfile,
} from "@/lib/repositories/partner-billing-profile-repository";

const putSchema = z.object({
  address: z.string().max(1000).default(""),
  phone: z.string().max(200).default(""),
  bankAccount: z.string().max(1000).default(""),
});

export async function GET() {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "PARTNER") {
    return jsonError("パートナー専用の情報です。", 403);
  }
  const profile = await getPartnerBillingProfile(session.sub);
  return jsonOk({ profile });
}

export async function PUT(request: Request) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (session.role !== "PARTNER") {
    return jsonError("パートナー専用の情報です。", 403);
  }
  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  const profile = await upsertPartnerBillingProfile({
    partnerId: session.sub,
    address: parsed.data.address,
    phone: parsed.data.phone,
    bankAccount: parsed.data.bankAccount,
  });
  return jsonOk({ profile });
}
