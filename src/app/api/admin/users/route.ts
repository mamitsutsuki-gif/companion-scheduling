import { revalidatePath } from "next/cache";
import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { requireAdminish, requireAdminWriter } from "@/lib/admin-access";
import {
  deleteUserAsAdmin,
  getUserById,
  listAdminVisibleUsers,
  setUserCompany,
  updateUserAvailability,
  updateUserDisplayName,
  updateUserRole,
} from "@/lib/repositories/user-repository";
import {
  getAppSettingsRow,
  getEffectiveAppSettings,
} from "@/lib/repositories/app-settings-repository";
import { normalizeAvailabilitySelections } from "@/lib/availability";
import { ensureCoachingRoomForClient } from "@/lib/match-partner-pending";

const querySchema = z.object({
  role: z
    .enum(["ADMIN", "PARTNER", "CLIENT", "CLIENT_ADMIN", "CLIENT_HR", "ADMIN_ASSISTANT"])
    .optional(),
});

export async function GET(request: Request) {
  const session = await readSession();
  const denied = requireAdminish(session);
  if (denied) return jsonError(denied.error, denied.status);

  const params = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!params.success) return jsonError("クエリが不正です。");

  const users = await listAdminVisibleUsers(params.data.role);

  return jsonOk({ users });
}

const patchSchema = z
  .object({
    userId: z.string().min(1),
    role: z
    .enum(["ADMIN", "PARTNER", "CLIENT", "CLIENT_ADMIN", "CLIENT_HR", "ADMIN_ASSISTANT"])
    .optional(),
    displayName: z.string().min(1).max(80).optional(),
    availabilitySlotIds: z.array(z.string().min(1).max(80)).max(64).optional(),
    companyId: z.string().trim().max(80).nullable().optional(),
  })
  .refine(
    (v) =>
      v.role !== undefined ||
      v.displayName !== undefined ||
      v.availabilitySlotIds !== undefined ||
      v.companyId !== undefined,
    "role / displayName / availabilitySlotIds / companyId のいずれかを指定してください。",
  );

export async function PATCH(request: Request) {
  const session = await readSession();
  const denied = requireAdminWriter(session);
  if (denied) return jsonError(denied.error, denied.status);

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");
  if (
    parsed.data.role &&
    parsed.data.userId === session!.sub &&
    parsed.data.role !== "ADMIN"
  ) {
    return jsonError("自分の管理者権限は外せません。", 400);
  }

  if (parsed.data.role && parsed.data.role !== "ADMIN") {
    const target = await getUserById(parsed.data.userId);
    if (target?.role === "ADMIN") {
      const admins = await listAdminVisibleUsers("ADMIN");
      if (admins.length <= 1) {
        return jsonError(
          "最後の管理者の権限は外せません。先に別のユーザーを管理者にしてください。",
          400,
        );
      }
    }
  }

  let resultUser: unknown = null;

  if (parsed.data.role) {
    const updated = await updateUserRole(parsed.data.userId, parsed.data.role).catch(() => null);
    if (!updated) return jsonError("ユーザー更新に失敗しました。", 400);
    resultUser = updated;
  }

  if (parsed.data.displayName !== undefined) {
    const updated = await updateUserDisplayName(parsed.data.userId, parsed.data.displayName).catch(
      () => null,
    );
    if (!updated) return jsonError("表示名の更新に失敗しました。", 400);
    resultUser = updated;
  }

  if (parsed.data.availabilitySlotIds !== undefined) {
    // 当該ユーザーが企業に属するなら、その企業の選択肢で正規化する。
    // パートナー・管理者やまだ企業未割当の場合はグローバル設定が使われる。
    const targetUser = await getUserById(parsed.data.userId);
    const companyId = (targetUser as { companyId?: string | null } | null)?.companyId ?? null;
    const settings = await getEffectiveAppSettings({ companyId });
    const ids = normalizeAvailabilitySelections(
      parsed.data.availabilitySlotIds,
      settings.availabilitySlotOptions,
    );
    const updated = await updateUserAvailability(parsed.data.userId, ids).catch(() => null);
    if (!updated) return jsonError("対応可能時間の更新に失敗しました。", 400);
    resultUser = updated;
  }

  if (parsed.data.companyId !== undefined) {
    const trimmed = parsed.data.companyId ? parsed.data.companyId.trim() : null;
    // セキュリティ: 企業ID は「アプリ設定 → 企業 (テナント)」に登録された ID のみ許可。
    // 直接 PATCH を叩かれても、未登録の値は弾く。
    if (trimmed) {
      const settings = await getAppSettingsRow();
      const known = new Set(settings.companies.map((c) => c.id));
      if (!known.has(trimmed)) {
        return jsonError(
          "未登録の企業IDは指定できません。先に『アプリ設定 → 企業（テナント）』で登録してください。",
          400,
        );
      }
    }
    const updated = await setUserCompany(parsed.data.userId, trimmed || null).catch(() => null);
    if (!updated) return jsonError("企業ID の更新に失敗しました。", 400);
    resultUser = updated;
    if (trimmed) {
      await ensureCoachingRoomForClient(parsed.data.userId).catch(() => null);
    }
    revalidatePath("/dashboard");
    revalidatePath("/admin/matches");
    revalidatePath("/admin/companies");
  }

  return jsonOk({ ok: true, user: resultUser });
}

const deleteSchema = z.object({
  userId: z.string().min(1),
});

export async function DELETE(request: Request) {
  const session = await readSession();
  const denied = requireAdminWriter(session);
  if (denied) return jsonError(denied.error, denied.status);

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");
  if (parsed.data.userId === session!.sub) return jsonError("自分自身は削除できません。", 400);

  const target = await getUserById(parsed.data.userId);
  if (target?.role === "ADMIN") {
    const admins = await listAdminVisibleUsers("ADMIN");
    if (admins.length <= 1) {
      return jsonError(
        "最後の管理者は削除できません。先に別のユーザーを管理者にしてください。",
        400,
      );
    }
  }

  const result = await deleteUserAsAdmin(parsed.data.userId);
  if (!result.ok) return jsonError(result.error, result.status ?? 400);
  return jsonOk({ ok: true });
}
