import { requireRole } from "@/lib/require-user";

export default async function PartnerSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // PARTNER がメインのページ。管理者・管理者アシスタントも閲覧できる想定。
  await requireRole(["PARTNER", "ADMIN", "ADMIN_ASSISTANT"]);
  return <>{children}</>;
}
