import { requireRole } from "@/lib/require-user";

export default async function AdminSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ADMIN と ADMIN_ASSISTANT のみが /admin/* を開ける。
  // 他ロールが URL を直接踏んだ場合は /dashboard に戻す（API は別途 401/403 で守る）。
  await requireRole(["ADMIN", "ADMIN_ASSISTANT"]);
  return <>{children}</>;
}
