import { readSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { ApplicationChrome } from "@/components/application-chrome";
import { getUserById } from "@/lib/repositories/user-repository";

export async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession();
  if (!session) redirect("/login");

  const profile = await getUserById(session.sub);
  if (!profile) redirect("/login");

  return <ApplicationChrome profile={{ displayName: profile.displayName, role: profile.role }}>{children}</ApplicationChrome>;
}
