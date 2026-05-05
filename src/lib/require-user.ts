import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { getUserById } from "@/lib/repositories/user-repository";

export async function requireUser() {
  const session = await readSession();
  if (!session) {
    redirect("/login");
  }
  const user = await getUserById(session.sub);
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
