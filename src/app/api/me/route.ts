import { readSession, clearSessionCookie } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getUserById, isDeletedUser, updateUserAvailability, updateUserDisplayName } from "@/lib/repositories/user-repository";
import {
  getAppSettingsRow,
  getEffectiveAppSettings,
} from "@/lib/repositories/app-settings-repository";
import { normalizeAvailabilitySelections } from "@/lib/availability";
import { z } from "zod";

export async function GET() {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);

  const user = await getUserById(session.sub);
  if (!user) return jsonError("ユーザーが見つかりません。", 404);
  if (isDeletedUser(user)) {
    await clearSessionCookie();
    return jsonError("このアカウントは削除されています。", 403);
  }

  const safe = {
    id: user.id,
    displayName: user.displayName,
    role: user.role,
    availabilitySlotIds: user.availabilitySlotIds,
    companyId: (user as { companyId?: string | null }).companyId ?? null,
  };
  if (session.role === "ADMIN" || session.role === "ADMIN_ASSISTANT") return jsonOk({ user });
  return jsonOk({ user: safe });
}

const patchSchema = z
  .object({
    availabilitySlotIds: z.array(z.string().min(1).max(80)).max(64).optional(),
    displayName: z.string().min(1).max(80).optional(),
  })
  .refine(
    (d) => d.availabilitySlotIds !== undefined || d.displayName !== undefined,
    "availabilitySlotIds または displayName のいずれかを指定してください。",
  );

export async function PATCH(request: Request) {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  let userOut:
    | {
        id: string;
        displayName: string;
        role: string;
        availabilitySlotIds: string[];
        companyId: string | null;
      }
    | null = null;

  if (parsed.data.displayName !== undefined) {
    const updated = await updateUserDisplayName(session.sub, parsed.data.displayName).catch(() => null);
    if (!updated) return jsonError("表示名の更新に失敗しました。", 400);
    userOut = {
      id: updated.id,
      displayName: updated.displayName,
      role: updated.role,
      availabilitySlotIds: updated.availabilitySlotIds ?? [],
      companyId: (updated as { companyId?: string | null }).companyId ?? null,
    };
  }

  if (parsed.data.availabilitySlotIds !== undefined) {
    // クライアント／クライアント管理者は所属企業の選択肢で正規化する。
    // パートナー・管理者は企業に紐づかないため従来通りグローバル設定で正規化する。
    let settings;
    if (session.role === "CLIENT" || session.role === "CLIENT_ADMIN") {
      const user = await getUserById(session.sub);
      const companyId = (user as { companyId?: string | null } | null)?.companyId ?? null;
      settings = await getEffectiveAppSettings({ companyId });
    } else {
      settings = await getAppSettingsRow();
    }
    const ids = normalizeAvailabilitySelections(
      parsed.data.availabilitySlotIds,
      settings.availabilitySlotOptions,
    );

    const updated = await updateUserAvailability(session.sub, ids).catch(() => null);
    if (!updated) return jsonError("対応可能時間の更新に失敗しました。", 400);
    userOut = {
      id: updated.id,
      displayName: updated.displayName,
      role: updated.role,
      availabilitySlotIds: updated.availabilitySlotIds,
      companyId: (updated as { companyId?: string | null }).companyId ?? null,
    };
  }

  if (!userOut) return jsonError("更新内容がありません。", 400);

  return jsonOk({
    ok: true,
    user: userOut,
  });
}
