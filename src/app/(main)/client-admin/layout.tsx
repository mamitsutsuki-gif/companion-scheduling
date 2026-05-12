import { requireRole } from "@/lib/require-user";

export default async function ClientAdminSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // CLIENT_ADMIN がメインのページ。管理者・管理者アシスタントも閲覧できる想定。
  await requireRole(["CLIENT_ADMIN", "ADMIN", "ADMIN_ASSISTANT"]);
  return <>{children}</>;
}
