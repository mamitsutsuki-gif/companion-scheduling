import { requireUser } from "@/lib/require-user";
import { shouldShowGlobalFta } from "@/lib/company-plan";
import { redirect } from "next/navigation";

export default async function FtaLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  if (!shouldShowGlobalFta(me.role)) {
    redirect("/dashboard");
  }
  return children;
}
