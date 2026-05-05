import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { getUserById } from "@/lib/repositories/user-repository";

export async function GET() {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);

  const user = await getUserById(session.sub);
  if (!user) return jsonError("ユーザーが見つかりません。", 404);

  if (session.role === "ADMIN") return jsonOk({ user });
  return jsonOk({ user: { id: user.id, displayName: user.displayName, role: user.role } });
}
