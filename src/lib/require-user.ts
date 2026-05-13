import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { getUserById, touchUserLastSeen } from "@/lib/repositories/user-repository";

export async function requireUser() {
  const session = await readSession();
  if (!session) {
    redirect("/login");
  }
  const user = await getUserById(session.sub);
  if (!user) {
    redirect("/login");
  }
  // 最終アクセス時刻を更新（管理者の「塩漬けユーザー検知」用）。
  // 1 時間に 1 回までに自動制限されるため毎ページ書き込みは発生しない。
  // 例外は internal に握って ignore する（タッチ失敗で本処理は落とさない）。
  void touchUserLastSeen(session.sub).catch(() => undefined);
  return { ...user, role: user.role };
}

export async function requireRole(
  allowed: (
    | "ADMIN"
    | "PARTNER"
    | "CLIENT"
    | "CLIENT_ADMIN"
    | "CLIENT_HR"
    | "ADMIN_ASSISTANT"
  )[],
) {
  const user = await requireUser();
  if (!allowed.includes(user.role)) {
    redirect("/dashboard");
  }
  return user;
}
