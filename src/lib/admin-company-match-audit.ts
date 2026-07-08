import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { listProgramsForCompany } from "@/lib/repositories/program-repository";

export type CompanyMatchAuditClientRow = {
  userId: string;
  displayName: string;
  role: string;
  enrolledProgramIds: string[];
  matchCount: number;
  assignedCount: number;
  pendingCount: number;
  needsReview: boolean;
  matches: Array<{
    id: string;
    programId: string | null;
    partnerPending: boolean;
    partnerId: string;
    createdAt: string;
  }>;
};

export type CompanyMatchAuditResult = {
  companyId: string;
  programCount: number;
  programs: Array<{ id: string; name: string; plan: string; createdAt: string }>;
  clients: CompanyMatchAuditClientRow[];
  clientsNeedingReview: number;
};

const CLIENT_ROLES = new Set(["CLIENT", "CLIENT_ADMIN", "CLIENT_HR"]);

export async function auditCompanyMatches(companyId: string): Promise<CompanyMatchAuditResult> {
  const cid = (companyId ?? "").trim();
  const programs = await listProgramsForCompany(cid);
  const empty: CompanyMatchAuditResult = {
    companyId: cid,
    programCount: programs.length,
    programs: programs.map((p) => ({
      id: p.id,
      name: p.name,
      plan: p.plan,
      createdAt: p.createdAt,
    })),
    clients: [],
    clientsNeedingReview: 0,
  };

  if (!cid || !isFirebaseDataBackend()) return empty;
  const db = getFirebaseFirestoreClient();
  if (!db) return empty;

  const usersSnap = await db.collection("users").where("companyId", "==", cid).get();
  const clients = usersSnap.docs
    .map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
    .filter((u) => CLIENT_ROLES.has(String(u.data.role ?? "")))
    .map((u) => ({
      id: u.id,
      displayName: String(u.data.displayName ?? "ユーザー"),
      role: String(u.data.role ?? ""),
      enrolledProgramIds: Array.isArray(u.data.enrolledProgramIds)
        ? (u.data.enrolledProgramIds as string[]).filter((id) => typeof id === "string" && id.trim())
        : [],
    }));

  const clientIds = new Set(clients.map((c) => c.id));
  const matchesSnap = await db.collection("matches").get();
  const byClient = new Map<string, CompanyMatchAuditClientRow["matches"]>();

  for (const d of matchesSnap.docs) {
    const raw = d.data() as Record<string, unknown>;
    const clientId = String(raw.clientId ?? "");
    if (!clientIds.has(clientId)) continue;
    const partnerId = String(raw.partnerId ?? "");
    const partnerPending = raw.partnerPending === true || !partnerId.trim();
    const programId =
      typeof raw.programId === "string" && raw.programId.trim() ? raw.programId.trim() : null;
    const row = {
      id: d.id,
      programId,
      partnerPending,
      partnerId,
      createdAt: String(raw.createdAt ?? ""),
    };
    const list = byClient.get(clientId) ?? [];
    list.push(row);
    byClient.set(clientId, list);
  }

  const clientRows: CompanyMatchAuditClientRow[] = clients
    .map((c) => {
      const matches = (byClient.get(c.id) ?? []).sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
      const assignedCount = matches.filter((m) => !m.partnerPending).length;
      const pendingCount = matches.filter((m) => m.partnerPending).length;
      const needsReview = matches.length > 1 || pendingCount > 1;
      return {
        userId: c.id,
        displayName: c.displayName,
        role: c.role,
        enrolledProgramIds: c.enrolledProgramIds,
        matchCount: matches.length,
        assignedCount,
        pendingCount,
        needsReview,
        matches,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "ja"));

  return {
    companyId: cid,
    programCount: programs.length,
    programs: programs.map((p) => ({
      id: p.id,
      name: p.name,
      plan: p.plan,
      createdAt: p.createdAt,
    })),
    clients: clientRows,
    clientsNeedingReview: clientRows.filter((c) => c.needsReview).length,
  };
}
