import { requireUser } from "@/lib/require-user";
import { getEffectiveAppSettingsForUser } from "@/lib/effective-app-settings";
import { shouldShowGlobalFta } from "@/lib/company-plan";
import { redirect } from "next/navigation";

export default async function FtaLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  const effective = await getEffectiveAppSettingsForUser(me.id);
  if (!shouldShowGlobalFta(me.role, effective.companyPlan)) {
    redirect("/dashboard");
  }
  return children;
}
