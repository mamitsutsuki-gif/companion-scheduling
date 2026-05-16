import { prisma } from "@/lib/prisma";
import { isFirebaseDataBackend } from "@/lib/firebase-admin";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";

export type CompanyClientBriefingRow = {
  userId: string;
  displayName: string;
  role: string;
  age: number | null;
  jobTitle: string | null;
};

const CLIENT_ROLES = ["CLIENT", "CLIENT_ADMIN", "CLIENT_HR"] as const;

export async function listClientsWithBriefingForCompany(
  companyId: string,
): Promise<CompanyClientBriefingRow[]> {
  if (isFirebaseDataBackend()) return [];

  const users = await prisma.user.findMany({
    where: {
      companyId,
      role: { in: [...CLIENT_ROLES] },
      deletedAt: null,
    },
    select: {
      id: true,
      displayName: true,
      role: true,
      clientPartnerBriefing: {
        select: { age: true, jobTitle: true },
      },
    },
    orderBy: { displayName: "asc" },
  });

  return users.map((u) => ({
    userId: u.id,
    displayName: u.displayName,
    role: u.role,
    age: u.clientPartnerBriefing?.age ?? null,
    jobTitle: u.clientPartnerBriefing?.jobTitle ?? null,
  }));
}

export async function upsertBriefingForCompanyClient(input: {
  companyId: string;
  clientUserId: string;
  age: number | null;
  jobTitle: string | null;
}): Promise<{ ok: true } | { ok: false; error: "INVALID_USER" | "NOT_SUPPORTED" }> {
  if (isFirebaseDataBackend()) return { ok: false, error: "NOT_SUPPORTED" };

  const user = await prisma.user.findFirst({
    where: {
      id: input.clientUserId,
      companyId: input.companyId,
      role: { in: [...CLIENT_ROLES] },
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!user) return { ok: false, error: "INVALID_USER" };

  const jobTitle =
    input.jobTitle === null || input.jobTitle.trim() === "" ? null : input.jobTitle.trim();

  if (input.age === null && !jobTitle) {
    await prisma.clientPartnerBriefing.deleteMany({ where: { userId: input.clientUserId } });
    return { ok: true };
  }

  await prisma.clientPartnerBriefing.upsert({
    where: { userId: input.clientUserId },
    create: {
      userId: input.clientUserId,
      age: input.age,
      jobTitle,
    },
    update: { age: input.age, jobTitle },
  });

  return { ok: true };
}

export async function getPartnerVisibleClientBriefingForMatch(input: {
  matchId: string;
  partnerUserId: string;
}): Promise<
  | { ok: false; error: "NOT_FOUND" | "FORBIDDEN" | "UNSUPPORTED_BACKEND" }
  | {
      ok: true;
      companyName: string;
      clientDisplayName: string;
      age: number | null;
      jobTitle: string | null;
    }
> {
  if (isFirebaseDataBackend()) return { ok: false, error: "UNSUPPORTED_BACKEND" };

  const match = await prisma.match.findUnique({
    where: { id: input.matchId },
    select: { partnerId: true, clientId: true },
  });
  if (!match) return { ok: false, error: "NOT_FOUND" };
  if (match.partnerId !== input.partnerUserId) return { ok: false, error: "FORBIDDEN" };

  const client = await prisma.user.findFirst({
    where: { id: match.clientId, deletedAt: null },
    select: {
      displayName: true,
      companyId: true,
      clientPartnerBriefing: { select: { age: true, jobTitle: true } },
    },
  });
  if (!client) return { ok: false, error: "NOT_FOUND" };

  const settings = await getAppSettingsRow();
  const reg = settings.companies.find((c) => c.id === client.companyId);
  const companyName =
    reg?.name ??
    (client.companyId ? `（企業ID: ${client.companyId}）` : "（企業未設定）");

  return {
    ok: true,
    companyName,
    clientDisplayName: client.displayName,
    age: client.clientPartnerBriefing?.age ?? null,
    jobTitle: client.clientPartnerBriefing?.jobTitle ?? null,
  };
}
