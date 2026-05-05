import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { ApplicationChrome } from "@/components/application-chrome";

export async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession();
  if (!session) redirect("/login");

  const profile = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { displayName: true, role: true },
  });
  if (!profile) redirect("/login");

  return <ApplicationChrome profile={profile}>{children}</ApplicationChrome>;
}
