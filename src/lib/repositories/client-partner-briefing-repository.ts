import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";
import { getMatchById } from "@/lib/repositories/match-repository";
import {
  getUserById,
  isDeletedUser,
  listClientsInCompany,
} from "@/lib/repositories/user-repository";

/** Firestore: パートナー共有用属性（ADMIN が書き込み／サーバーがパートナーにのみ提供） */
export const CLIENT_PARTNER_BRIEFING_FIRESTORE_COLLECTION = "clientPartnerBriefings";

export type BriefingFields = {
  age: number | null;
  jobTitle: string | null;
  isManagement: boolean | null;
};

export type CompanyClientBriefingRow = {
  userId: string;
  displayName: string;
  role: string;
} & BriefingFields;

const CLIENT_ROLES = ["CLIENT", "CLIENT_ADMIN", "CLIENT_HR"] as const;

function parseIsManagement(raw: unknown): boolean | null {
  if (raw === true || raw === false) return raw;
  return null;
}

function briefingHasStoredContent(b: BriefingFields): boolean {
  const jt = b.jobTitle?.trim() ?? "";
  return b.age !== null || jt !== "" || b.isManagement !== null;
}

function parseBriefingFields(data: Record<string, unknown> | undefined): BriefingFields {
  if (!data) return { age: null, jobTitle: null, isManagement: null };
  const ageRaw = data.age;
  const age =
    typeof ageRaw === "number" && Number.isInteger(ageRaw) && ageRaw >= 0 && ageRaw <= 120 ? ageRaw : null;
  const jt =
    typeof data.jobTitle === "string" ? (data.jobTitle.trim() === "" ? null : data.jobTitle.trim()) : null;
  return { age, jobTitle: jt, isManagement: parseIsManagement(data.isManagement) };
}

async function firebaseGetBriefingsForUserIds(userIds: string[]): Promise<Map<string, BriefingFields>> {
  const map = new Map<string, BriefingFields>();
  const db = getFirebaseFirestoreClient();
  if (!db || userIds.length === 0) return map;
  const col = db.collection(CLIENT_PARTNER_BRIEFING_FIRESTORE_COLLECTION);
  const snaps = await Promise.all(userIds.map((id) => col.doc(id).get()));
  for (let i = 0; i < userIds.length; i++) {
    const sid = userIds[i]!;
    const snap = snaps[i];
    if (!snap?.exists) {
      map.set(sid, { age: null, jobTitle: null, isManagement: null });
      continue;
    }
    map.set(sid, parseBriefingFields(snap.data() as Record<string, unknown>));
  }
  return map;
}

async function resolveClientBriefingPayload(clientId: string): Promise<
  | { ok: false }
  | {
      ok: true;
      companyName: string;
      clientDisplayName: string;
      fields: BriefingFields;
    }
> {
  if (isFirebaseDataBackend()) {
    const fullClient = await getUserById(clientId);
    if (!fullClient || isDeletedUser(fullClient)) return { ok: false };

    const settings = await getAppSettingsRow();
    const companyId = fullClient.companyId ?? null;
    const reg = settings.companies.find((c) => c.id === companyId);
    const companyName =
      reg?.name ?? (companyId ? `（企業ID: ${companyId}）` : "（企業未設定）");

    const briefMap = await firebaseGetBriefingsForUserIds([clientId]);
    const b = briefMap.get(clientId) ?? { age: null, jobTitle: null, isManagement: null };
    return {
      ok: true,
      companyName,
      clientDisplayName: fullClient.displayName,
      fields: b,
    };
  }

  const clientRow = await prisma.user.findFirst({
    where: { id: clientId, deletedAt: null },
    select: {
      displayName: true,
      companyId: true,
      clientPartnerBriefing: {
        select: { age: true, jobTitle: true, isManagement: true },
      },
    },
  });
  if (!clientRow) return { ok: false };

  const settings = await getAppSettingsRow();
  const reg = settings.companies.find((c) => c.id === clientRow.companyId);
  const companyName =
    reg?.name ??
    (clientRow.companyId ? `（企業ID: ${clientRow.companyId}）` : "（企業未設定）");

  const b = clientRow.clientPartnerBriefing;
  return {
    ok: true,
    companyName,
    clientDisplayName: clientRow.displayName,
    fields: {
      age: b?.age ?? null,
      jobTitle: b?.jobTitle ?? null,
      isManagement: b?.isManagement ?? null,
    },
  };
}

export async function listClientsWithBriefingForCompany(
  companyId: string,
): Promise<CompanyClientBriefingRow[]> {
  if (isFirebaseDataBackend()) {
    const clients = await listClientsInCompany(companyId);
    const briefingByUser = await firebaseGetBriefingsForUserIds(clients.map((u) => u.id));
    const rows = clients.map((u) => {
      const b = briefingByUser.get(u.id) ?? { age: null, jobTitle: null, isManagement: null };
      return {
        userId: u.id,
        displayName: u.displayName,
        role: u.role,
        age: b.age,
        jobTitle: b.jobTitle,
        isManagement: b.isManagement,
      };
    });
    rows.sort((a, b) => a.displayName.localeCompare(b.displayName, "ja"));
    return rows;
  }

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
        select: { age: true, jobTitle: true, isManagement: true },
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
    isManagement: u.clientPartnerBriefing?.isManagement ?? null,
  }));
}

/** 管理者のユーザー詳細ページ用：1 ユーザー分のパートナー共有属性のみ取得 */
export async function getStoredClientPartnerBriefingForUser(
  clientUserId: string,
): Promise<BriefingFields> {
  if (isFirebaseDataBackend()) {
    const map = await firebaseGetBriefingsForUserIds([clientUserId]);
    return map.get(clientUserId) ?? { age: null, jobTitle: null, isManagement: null };
  }
  const row = await prisma.clientPartnerBriefing.findUnique({
    where: { userId: clientUserId },
    select: { age: true, jobTitle: true, isManagement: true },
  });
  return {
    age: row?.age ?? null,
    jobTitle: row?.jobTitle ?? null,
    isManagement: row?.isManagement ?? null,
  };
}

export async function upsertBriefingForCompanyClient(input: {
  companyId: string;
  clientUserId: string;
  age: number | null;
  jobTitle: string | null;
  isManagement: boolean | null;
}): Promise<{ ok: true } | { ok: false; error: "INVALID_USER" }> {
  const eligible = await listClientsInCompany(input.companyId);
  const valid = eligible.some((u) => u.id === input.clientUserId);
  if (!valid) return { ok: false, error: "INVALID_USER" };

  const jobTitleNorm =
    input.jobTitle === null || input.jobTitle.trim() === "" ? null : input.jobTitle.trim();

  const fields: BriefingFields = {
    age: input.age,
    jobTitle: jobTitleNorm,
    isManagement: input.isManagement,
  };

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return { ok: false, error: "INVALID_USER" };
    const ref = db.collection(CLIENT_PARTNER_BRIEFING_FIRESTORE_COLLECTION).doc(input.clientUserId);
    if (!briefingHasStoredContent(fields)) {
      await ref.delete().catch(() => {});
      return { ok: true };
    }
    await ref.set(
      {
        userId: input.clientUserId,
        age: fields.age,
        jobTitle: fields.jobTitle,
        isManagement: fields.isManagement,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    return { ok: true };
  }

  if (!briefingHasStoredContent(fields)) {
    await prisma.clientPartnerBriefing.deleteMany({ where: { userId: input.clientUserId } });
    return { ok: true };
  }

  await prisma.clientPartnerBriefing.upsert({
    where: { userId: input.clientUserId },
    create: {
      userId: input.clientUserId,
      age: fields.age,
      jobTitle: fields.jobTitle,
      isManagement: fields.isManagement,
    },
    update: {
      age: fields.age,
      jobTitle: fields.jobTitle,
      isManagement: fields.isManagement,
    },
  });

  return { ok: true };
}

/** マッチルーム「クライアント情報」：パートナー本人または運用 ADMIN */
export async function getMatchClientBriefingForViewer(input: {
  matchId: string;
  viewerUserId: string;
  viewerRole: "PARTNER" | "ADMIN";
}): Promise<
  | { ok: false; error: "NOT_FOUND" | "FORBIDDEN" }
  | {
      ok: true;
      companyName: string;
      clientDisplayName: string;
      age: number | null;
      jobTitle: string | null;
      isManagement: boolean | null;
    }
> {
  const match = await getMatchById(input.matchId);
  if (!match) return { ok: false, error: "NOT_FOUND" };

  const partnerId = (match as { partnerId: string }).partnerId;
  const clientId = (match as { clientId: string }).clientId;
  if (!partnerId || !clientId) return { ok: false, error: "NOT_FOUND" };

  if (input.viewerRole === "PARTNER") {
    if (partnerId !== input.viewerUserId) return { ok: false, error: "FORBIDDEN" };
  }

  const payload = await resolveClientBriefingPayload(clientId);
  if (!payload.ok) return { ok: false, error: "NOT_FOUND" };

  return {
    ok: true,
    companyName: payload.companyName,
    clientDisplayName: payload.clientDisplayName,
    age: payload.fields.age,
    jobTitle: payload.fields.jobTitle,
    isManagement: payload.fields.isManagement,
  };
}

/** @deprecated 互換用。getMatchClientBriefingForViewer を利用 */
export async function getPartnerVisibleClientBriefingForMatch(input: {
  matchId: string;
  partnerUserId: string;
}) {
  return getMatchClientBriefingForViewer({
    matchId: input.matchId,
    viewerUserId: input.partnerUserId,
    viewerRole: "PARTNER",
  });
}

export function formatManagementRoleLabel(isManagement: boolean | null): string {
  if (isManagement === true) return "該当する";
  if (isManagement === false) return "該当しない";
  return "";
}
