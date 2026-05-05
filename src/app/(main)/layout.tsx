import { AuthenticatedLayout } from "@/components/authenticated-layout";

export default async function MainRoutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
}
