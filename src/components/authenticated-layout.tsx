import { readSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { ApplicationChrome } from "@/components/application-chrome";
import { getUserById } from "@/lib/repositories/user-repository";
import { getEffectiveAppSettingsForUser } from "@/lib/effective-app-settings";
import { shouldShowGlobalFta } from "@/lib/company-plan";

export async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession();
  if (!session) redirect("/login");

  const profile = await getUserById(session.sub);
  if (!profile) redirect("/login");

  const effective = await getEffectiveAppSettingsForUser(session.sub);
  const showFtaNav = shouldShowGlobalFta(profile.role, effective.companyPlan);

  return (
    <ApplicationChrome
      profile={{ displayName: profile.displayName, role: profile.role }}
      showFtaNav={showFtaNav}
    >
      {children}
    </ApplicationChrome>
  );
}
