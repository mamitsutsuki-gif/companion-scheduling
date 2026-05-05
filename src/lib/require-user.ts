import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";

export async function requireUser() {
  const session = await readSession();
  if (!session) {
    redirect("/login");
  }
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      displayName: true,
      role: true,
    },
  });
  if (!user) {
    redirect("/login");
  }
  return { ...user, role: user.role };
}

export async function requireRole(allowed: ("ADMIN" | "PARTNER" | "CLIENT")[]) {
  const user = await requireUser();
  if (!allowed.includes(user.role)) {
    redirect("/dashboard");
  }
  return user;
}
