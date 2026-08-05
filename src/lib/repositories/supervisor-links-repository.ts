import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { getMatchById } from "@/lib/repositories/match-repository";
import { getProgramById } from "@/lib/repositories/program-repository";
import { getUserById } from "@/lib/repositories/user-repository";
import { isIndividualCompanionPlan } from "@/lib/company-plan";

const COLLECTION = "supervisorLinks";

export type SupervisorLinkRow = {
  id: string;
  supervisorId: string;
  clientId: string;
  companyId: string;
  programId: string | null;
  createdAt: string;
  createdBy: string | null;
};

function linkDocId(supervisorId: string, clientId: string) {
  return `${supervisorId}_${clientId}`;
}

function normalizeCompanyId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function rowFromRaw(id: string, raw: Record<string, unknown>): SupervisorLinkRow {
  return {
    id,
    supervisorId: String(raw.supervisorId ?? ""),
    clientId: String(raw.clientId ?? ""),
    companyId: normalizeCompanyId(raw.companyId),
    programId: typeof raw.programId === "string" && raw.programId.trim() ? raw.programId.trim() : null,
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    createdBy: typeof raw.createdBy === "string" ? raw.createdBy : null,
  };
}

export async function hasSupervisorLink(
  supervisorId: string,
  clientId: string,
): Promise<boolean> {
  if (!supervisorId || !clientId) return false;
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return false;
    const snap = await db.collection(COLLECTION).doc(linkDocId(supervisorId, clientId)).get();
    return snap.exists;
  }
  const delegate = (
    prisma as unknown as {
      supervisorLink?: { findUnique?: Function };
    }
  ).supervisorLink;
  if (!delegate?.findUnique) return false;
  try {
    const row = await delegate.findUnique({
      where: { supervisorId_clientId: { supervisorId, clientId } },
      select: { id: true },
    });
    return Boolean(row);
  } catch {
    return false;
  }
}

export async function listSupervisorLinksForSupervisor(
  supervisorId: string,
): Promise<SupervisorLinkRow[]> {
  if (!supervisorId) return [];
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    const snap = await db.collection(COLLECTION).where("supervisorId", "==", supervisorId).get();
    return snap.docs
      .map((d) => rowFromRaw(d.id, d.data() as Record<string, unknown>))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const delegate = (
    prisma as unknown as {
      supervisorLink?: { findMany?: Function };
    }
  ).supervisorLink;
  if (!delegate?.findMany) return [];
  try {
    const rows = await delegate.findMany({
      where: { supervisorId },
      orderBy: { createdAt: "desc" },
    });
    return (rows as Array<Record<string, unknown>>).map((r) =>
      rowFromRaw(String(r.id ?? ""), r),
    );
  } catch {
    return [];
  }
}

export async function listSupervisorLinksForCompany(
  companyId: string,
): Promise<SupervisorLinkRow[]> {
  const cid = normalizeCompanyId(companyId);
  if (!cid) return [];
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    const snap = await db.collection(COLLECTION).where("companyId", "==", cid).get();
    return snap.docs
      .map((d) => rowFromRaw(d.id, d.data() as Record<string, unknown>))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const delegate = (
    prisma as unknown as {
      supervisorLink?: { findMany?: Function };
    }
  ).supervisorLink;
  if (!delegate?.findMany) return [];
  try {
    const rows = await delegate.findMany({
      where: { companyId: cid },
      orderBy: { createdAt: "desc" },
    });
    return (rows as Array<Record<string, unknown>>).map((r) =>
      rowFromRaw(String(r.id ?? ""), r),
    );
  } catch {
    return [];
  }
}

export async function createSupervisorLink(input: {
  supervisorId: string;
  clientId: string;
  programId?: string | null;
  createdBy?: string | null;
}): Promise<{ ok: true; link: SupervisorLinkRow } | { ok: false; error: string; status?: number }> {
  const supervisorId = input.supervisorId.trim();
  const clientId = input.clientId.trim();
  if (!supervisorId || !clientId || supervisorId === clientId) {
    return { ok: false, error: "上司と部下の指定が不正です。" };
  }

  const [supervisor, client] = await Promise.all([
    getUserById(supervisorId),
    getUserById(clientId),
  ]);
  if (!supervisor || (supervisor.role !== "CLIENT_ADMIN" && supervisor.role !== "CLIENT_HR")) {
    return { ok: false, error: "上司は CLIENT_ADMIN（または CLIENT_HR）である必要があります。" };
  }
  if (!client || client.role !== "CLIENT") {
    return { ok: false, error: "部下は CLIENT である必要があります。" };
  }

  const companyId = normalizeCompanyId((client as { companyId?: string | null }).companyId);
  const supervisorCompanyId = normalizeCompanyId(
    (supervisor as { companyId?: string | null }).companyId,
  );
  if (!companyId || !supervisorCompanyId || companyId !== supervisorCompanyId) {
    return { ok: false, error: "上司と部下は同じ企業に所属している必要があります。" };
  }

  let programId: string | null =
    typeof input.programId === "string" && input.programId.trim() ? input.programId.trim() : null;
  if (programId) {
    const program = await getProgramById(programId);
    if (!program || program.companyId !== companyId || !isIndividualCompanionPlan(program.plan)) {
      return { ok: false, error: "プログラムは同一企業の個別伴走である必要があります。" };
    }
  }

  if (await hasSupervisorLink(supervisorId, clientId)) {
    return { ok: false, error: "この上司と部下の紐づけは既に存在します。", status: 409 };
  }

  const now = new Date().toISOString();
  const id = linkDocId(supervisorId, clientId);
  const row: SupervisorLinkRow = {
    id,
    supervisorId,
    clientId,
    companyId,
    programId,
    createdAt: now,
    createdBy: input.createdBy ?? null,
  };

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return { ok: false, error: "Firestore 未設定です。" };
    await db.collection(COLLECTION).doc(id).set({
      supervisorId,
      clientId,
      companyId,
      programId,
      createdAt: now,
      createdBy: input.createdBy ?? null,
    });
    return { ok: true, link: row };
  }

  const delegate = (
    prisma as unknown as {
      supervisorLink?: { create?: Function };
    }
  ).supervisorLink;
  if (!delegate?.create) {
    return { ok: false, error: "この環境では上司紐づけを保存できません。" };
  }
  try {
    const created = await delegate.create({
      data: {
        id,
        supervisorId,
        clientId,
        companyId,
        programId,
        createdBy: input.createdBy ?? null,
      },
    });
    return {
      ok: true,
      link: rowFromRaw(String(created.id ?? id), created as Record<string, unknown>),
    };
  } catch {
    return { ok: false, error: "この上司と部下の紐づけは既に存在します。", status: 409 };
  }
}

export async function deleteSupervisorLink(
  linkId: string,
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const id = linkId.trim();
  if (!id) return { ok: false, error: "紐づけ ID が不正です。" };

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return { ok: false, error: "Firestore 未設定です。" };
    const ref = db.collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, error: "紐づけが見つかりません。", status: 404 };
    await ref.delete();
    return { ok: true };
  }

  const delegate = (
    prisma as unknown as {
      supervisorLink?: { delete?: Function };
    }
  ).supervisorLink;
  if (!delegate?.delete) {
    return { ok: false, error: "この環境では上司紐づけを削除できません。" };
  }
  try {
    await delegate.delete({ where: { id } });
    return { ok: true };
  } catch {
    return { ok: false, error: "紐づけが見つかりません。", status: 404 };
  }
}

/**
 * 部下（CLIENT）の個別伴走パートナールームを探す。
 * partner が PARTNER のマッチを優先し、CLIENT_ADMIN 上司マッチは除外する。
 */
export async function findPartnerRoomMatchForClient(
  clientId: string,
): Promise<{ id: string; programId: string | null; partnerName: string } | null> {
  if (!clientId) return null;

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const snap = await db.collection("matches").where("clientId", "==", clientId).get();
    const candidates: Array<{
      id: string;
      programId: string | null;
      partnerId: string;
      createdAt: string;
    }> = [];
    for (const doc of snap.docs) {
      const raw = doc.data() as Record<string, unknown>;
      if (raw.partnerPending === true) continue;
      const partnerId = String(raw.partnerId ?? "");
      if (!partnerId) continue;
      candidates.push({
        id: doc.id,
        partnerId,
        programId:
          typeof raw.programId === "string" && raw.programId.trim() ? raw.programId.trim() : null,
        createdAt: String(raw.createdAt ?? ""),
      });
    }
    candidates.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const c of candidates) {
      const partner = await getUserById(c.partnerId);
      if (!partner || partner.role !== "PARTNER") continue;
      if (c.programId) {
        const program = await getProgramById(c.programId);
        if (program && !isIndividualCompanionPlan(program.plan)) continue;
      }
      return {
        id: c.id,
        programId: c.programId,
        partnerName: partner.displayName,
      };
    }
    return null;
  }

  const rows = await prisma.match.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    select: { id: true, partnerId: true, programId: true },
    take: 50,
  });
  for (const row of rows) {
    const match = await getMatchById(row.id);
    if (!match || (match as { partnerPending?: boolean }).partnerPending) continue;
    const partner = await getUserById(row.partnerId);
    if (!partner || partner.role !== "PARTNER") continue;
    if (row.programId) {
      const program = await getProgramById(row.programId);
      if (program && !isIndividualCompanionPlan(program.plan)) continue;
    }
    return { id: row.id, programId: row.programId, partnerName: partner.displayName };
  }
  return null;
}
