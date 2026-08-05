import type { Role } from "@prisma/client";
import { getUserById } from "@/lib/repositories/user-repository";

/**
 * セッション Cookie のロールは発行時点のスナップショット。
 * 管理者がロールを変更しても再ログインまで古い値が残るため、
 * 権限判定では DB のロールを正本として使う。
 */
export async function resolveActorRole(actor: { id: string; role: Role }): Promise<Role> {
  const user = await getUserById(actor.id).catch(() => null);
  const dbRole = (user as { role?: Role } | null)?.role;
  return dbRole ?? actor.role;
}
