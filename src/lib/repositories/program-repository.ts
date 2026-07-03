import { nanoid } from "nanoid";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import {
  companyPlanLabel,
  normalizeCompanyPlan,
  resolveCompanyPlan,
  type CompanyPlan,
} from "@/lib/company-plan";
import {
  getAppSettingsRow,
  getCompanyAppSettingsOverride,
  normalizeCompanyAppSettingsOverride,
  type CompanyAppSettingsOverride,
} from "@/lib/repositories/app-settings-repository";

export type ProgramRow = {
  id: string;
  companyId: string;
  name: string;
  plan: CompanyPlan;
  createdAt: string;
  updatedAt: string;
};

export type ProgramAppSettingsOverride = Omit<CompanyAppSettingsOverride, "companyId"> & {
  programId: string;
};

function sanitizeProgramId(id: string | null | undefined): string {
  return (id ?? "")
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
}

function sanitizeCompanyId(id: string | null | undefined): string {
  return (id ?? "")
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 60);
}

export function newProgramId() {
  return `prog-${nanoid(10)}`;
}

function normalizeProgramRow(id: string, input: unknown): ProgramRow | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const companyId = sanitizeCompanyId(typeof raw.companyId === "string" ? raw.companyId : "");
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 80) : "";
  const plan = normalizeCompanyPlan(raw.plan);
  if (!companyId || !name) return null;
  return {
    id,
    companyId,
    name,
    plan,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export async function listProgramsForCompany(companyId: string): Promise<ProgramRow[]> {
  const cid = sanitizeCompanyId(companyId);
  if (!cid) return [];
  if (!isFirebaseDataBackend()) return [];
  const db = getFirebaseFirestoreClient();
  if (!db) return [];
  const snap = await db.collection("programs").where("companyId", "==", cid).get();
  return snap.docs
    .map((d) => normalizeProgramRow(d.id, d.data()))
    .filter((p): p is ProgramRow => p !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export async function getProgramById(programId: string): Promise<ProgramRow | null> {
  const pid = sanitizeProgramId(programId);
  if (!pid) return null;
  if (!isFirebaseDataBackend()) return null;
  const db = getFirebaseFirestoreClient();
  if (!db) return null;
  const snap = await db.collection("programs").doc(pid).get();
  if (!snap.exists) return null;
  return normalizeProgramRow(snap.id, snap.data() ?? {});
}

export async function createProgram(input: {
  companyId: string;
  plan: CompanyPlan;
  name?: string;
}): Promise<ProgramRow | null> {
  const cid = sanitizeCompanyId(input.companyId);
  if (!cid || !isFirebaseDataBackend()) return null;
  const db = getFirebaseFirestoreClient();
  if (!db) return null;
  const settings = await getAppSettingsRow();
  if (!settings.companies.some((c) => c.id === cid)) return null;

  const id = newProgramId();
  const now = new Date().toISOString();
  const row: ProgramRow = {
    id,
    companyId: cid,
    plan: input.plan,
    name: (input.name ?? companyPlanLabel(input.plan)).trim().slice(0, 80),
    createdAt: now,
    updatedAt: now,
  };
  await db.collection("programs").doc(id).set(row);
  return row;
}

/** 企業にプログラムが無ければ、企業プランから既定プログラムを1件作成する。 */
export async function ensureDefaultProgramForCompany(companyId: string): Promise<ProgramRow | null> {
  const cid = sanitizeCompanyId(companyId);
  if (!cid) return null;
  const existing = await listProgramsForCompany(cid);
  if (existing.length > 0) return existing[0]!;

  const settings = await getAppSettingsRow();
  const plan = resolveCompanyPlan(cid, settings.companies);
  const program = await createProgram({ companyId: cid, plan });
  if (!program) return null;

  const companyOverride = await getCompanyAppSettingsOverride(cid);
  if (companyOverride) {
    await copyCompanySettingsToProgram(cid, program.id, companyOverride);
  }
  return program;
}

async function copyCompanySettingsToProgram(
  companyId: string,
  programId: string,
  companyOverride: CompanyAppSettingsOverride,
): Promise<void> {
  const { companyId: _c, updatedAt: _u, ...rest } = companyOverride;
  await upsertProgramAppSettingsOverride(programId, { ...rest });
  void _c;
  void _u;
  void companyId;
}

export async function getProgramAppSettingsOverride(
  programId: string | null | undefined,
): Promise<ProgramAppSettingsOverride | null> {
  const pid = sanitizeProgramId(programId);
  if (!pid || !isFirebaseDataBackend()) return null;
  const db = getFirebaseFirestoreClient();
  if (!db) return null;
  const snap = await db.collection("programAppSettings").doc(pid).get();
  if (!snap.exists) return null;
  const normalized = normalizeCompanyAppSettingsOverride(pid, snap.data() ?? {});
  const { companyId: _drop, ...rest } = normalized;
  void _drop;
  return { ...rest, programId: pid };
}

/** プログラム上書きをまるごと削除する（=企業・全体設定に戻す）。 */
export async function deleteProgramAppSettingsOverride(programId: string): Promise<void> {
  const pid = sanitizeProgramId(programId);
  if (!pid || !isFirebaseDataBackend()) return;
  const db = getFirebaseFirestoreClient();
  if (!db) return;
  await db.collection("programAppSettings").doc(pid).delete().catch(() => undefined);
}

export async function upsertProgramAppSettingsOverride(
  programId: string,
  patch: Parameters<typeof import("@/lib/repositories/app-settings-repository").upsertCompanyAppSettingsOverride>[1],
): Promise<ProgramAppSettingsOverride | null> {
  const pid = sanitizeProgramId(programId);
  if (!pid || !isFirebaseDataBackend()) return null;
  const program = await getProgramById(pid);
  if (!program) return null;

  const { upsertCompanyAppSettingsOverride } = await import(
    "@/lib/repositories/app-settings-repository"
  );
  // programAppSettings は companyAppSettings と同じ正規化・マージロジックを流用する。
  // 一時的に company 用 upsert の実装を program コレクション向けに複製する。
  const db = getFirebaseFirestoreClient();
  if (!db) return null;
  const ref = db.collection("programAppSettings").doc(pid);

  const {
    clearPartnerProjectOverview,
    clearClientProjectOverview,
    partnerProjectOverview: patchPartnerPo,
    clientProjectOverview: patchClientPo,
    shareFtaWithinCompany: patchShareFta,
    planFeatureOverrides: patchPlanFeatures,
    clearPlanFeatureOverrides,
    meetingProvider: patchMeetingProvider,
    clearMeetingProvider,
    coachingSessionModesByRound: patchCoachingSessionModes,
    clearCoachingSessionModes,
    coachingPlanSettings: patchCoachingPlanSettings,
    clearCoachingPlanSettings,
    ...restPatch
  } = patch;

  const normalized = normalizeCompanyAppSettingsOverride(pid, restPatch);
  const writeData: Record<string, unknown> = {
    programId: pid,
    updatedAt: new Date().toISOString(),
  };
  for (const [k, v] of Object.entries(normalized)) {
    if (k === "companyId" || k === "updatedAt") continue;
    if (v !== undefined) writeData[k] = v;
  }

  const { FieldValue } = await import("firebase-admin/firestore");
  const { normalizePartnerProjectOverview, normalizeClientProjectOverview } = await import(
    "@/lib/repositories/app-settings-repository"
  );
  const { normalizePlanFeatureOverrides, normalizeMeetingProvider } = await import(
    "@/lib/company-plan"
  );
  const { normalizeCoachingSessionModesByRound } = await import("@/lib/coaching-session-mode");
  const { normalizeCoachingPlanSettingsOverrides } = await import("@/lib/company-plan");

  if (patch.clearFields && patch.clearFields.length > 0) {
    for (const key of patch.clearFields) {
      writeData[key] = FieldValue.delete();
    }
  }
  if (clearPartnerProjectOverview) {
    writeData.partnerProjectOverview = FieldValue.delete();
  } else if (patchPartnerPo !== undefined) {
    const po = patchPartnerPo === null ? null : normalizePartnerProjectOverview(patchPartnerPo);
    writeData.partnerProjectOverview = po ?? FieldValue.delete();
  }
  if (clearClientProjectOverview) {
    writeData.clientProjectOverview = FieldValue.delete();
  } else if (patchClientPo !== undefined) {
    const co = patchClientPo === null ? null : normalizeClientProjectOverview(patchClientPo);
    writeData.clientProjectOverview = co ?? FieldValue.delete();
  }
  if (patchShareFta !== undefined) {
    writeData.shareFtaWithinCompany = patchShareFta;
  }
  if (clearPlanFeatureOverrides) {
    writeData.planFeatureOverrides = FieldValue.delete();
  } else if (patchPlanFeatures !== undefined) {
    const pfo =
      patchPlanFeatures === null ? null : normalizePlanFeatureOverrides(patchPlanFeatures);
    writeData.planFeatureOverrides = pfo ?? FieldValue.delete();
  }
  if (clearMeetingProvider) {
    writeData.meetingProvider = FieldValue.delete();
  } else if (patchMeetingProvider !== undefined) {
    writeData.meetingProvider = normalizeMeetingProvider(patchMeetingProvider);
  }
  if (clearCoachingSessionModes) {
    writeData.coachingSessionModesByRound = FieldValue.delete();
  } else if (patchCoachingSessionModes !== undefined) {
    const modes =
      patchCoachingSessionModes === null
        ? null
        : normalizeCoachingSessionModesByRound(patchCoachingSessionModes);
    writeData.coachingSessionModesByRound =
      modes && Object.keys(modes).length > 0 ? modes : FieldValue.delete();
  }
  if (clearCoachingPlanSettings) {
    writeData.coachingPlanSettings = FieldValue.delete();
  } else if (patchCoachingPlanSettings !== undefined) {
    const cps =
      patchCoachingPlanSettings === null
        ? null
        : normalizeCoachingPlanSettingsOverrides(patchCoachingPlanSettings);
    writeData.coachingPlanSettings = cps ?? FieldValue.delete();
  }

  await ref.set(writeData, { merge: true });
  return getProgramAppSettingsOverride(pid);
}

export async function resolveProgramIdForCompany(
  companyId: string,
  programId?: string | null,
): Promise<string | null> {
  const pid = sanitizeProgramId(programId);
  if (pid) {
    const program = await getProgramById(pid);
    if (program && program.companyId === sanitizeCompanyId(companyId)) return pid;
    return null;
  }
  const program = await ensureDefaultProgramForCompany(companyId);
  return program?.id ?? null;
}
