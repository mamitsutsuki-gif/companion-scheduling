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

/** 企業ごとの既定プログラム用 ID（並行リクエストでも1件に収束する）。 */
export function defaultProgramDocId(companyId: string): string {
  return sanitizeProgramId(`prog-default-${sanitizeCompanyId(companyId)}`);
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

export function dedupeProgramsByPlan(programs: ProgramRow[]): ProgramRow[] {
  const byPlan = new Map<CompanyPlan, ProgramRow>();
  for (const p of [...programs].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (!byPlan.has(p.plan)) byPlan.set(p.plan, p);
  }
  return [...byPlan.values()];
}

/** 同一プランが複数あるときは最古の1件を正とする。 */
export function pickCanonicalProgram(
  programs: ProgramRow[],
  plan?: CompanyPlan,
): ProgramRow | null {
  const list = plan ? programs.filter((p) => p.plan === plan) : programs;
  if (list.length === 0) return null;
  return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]!;
}

/** 企業にプログラムが無ければ、企業プランから既定プログラムを1件作成する。 */
export async function ensureDefaultProgramForCompany(companyId: string): Promise<ProgramRow | null> {
  const cid = sanitizeCompanyId(companyId);
  if (!cid || !isFirebaseDataBackend()) return null;
  const db = getFirebaseFirestoreClient();
  if (!db) return null;

  const existing = await listProgramsForCompany(cid);
  if (existing.length > 0) {
    return [...existing].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]!;
  }

  const settings = await getAppSettingsRow();
  if (!settings.companies.some((c) => c.id === cid)) return null;
  const plan = resolveCompanyPlan(cid, settings.companies);
  const id = defaultProgramDocId(cid);
  const ref = db.collection("programs").doc(id);
  const existingDoc = await ref.get();
  if (existingDoc.exists) {
    return normalizeProgramRow(existingDoc.id, existingDoc.data() ?? {});
  }

  const now = new Date().toISOString();
  const row: ProgramRow = {
    id,
    companyId: cid,
    plan,
    name: companyPlanLabel(plan).trim().slice(0, 80),
    createdAt: now,
    updatedAt: now,
  };

  try {
    await ref.create(row);
  } catch {
    const again = await ref.get();
    if (again.exists) return normalizeProgramRow(again.id, again.data() ?? {});
    const listed = await listProgramsForCompany(cid);
    if (listed.length > 0) {
      return [...listed].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]!;
    }
    return null;
  }

  const companyOverride = await getCompanyAppSettingsOverride(cid);
  if (companyOverride) {
    await copyCompanySettingsToProgram(cid, id, companyOverride);
  }
  return row;
}

export async function countMatchesForProgram(programId: string): Promise<number> {
  const pid = sanitizeProgramId(programId);
  if (!pid || !isFirebaseDataBackend()) return 0;
  const db = getFirebaseFirestoreClient();
  if (!db) return 0;
  const snap = await db.collection("matches").where("programId", "==", pid).get();
  return snap.size;
}

export async function deleteProgram(
  programId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const pid = sanitizeProgramId(programId);
  if (!pid || !isFirebaseDataBackend()) {
    return { ok: false, error: "プログラムが見つかりません。" };
  }
  const program = await getProgramById(pid);
  if (!program) return { ok: false, error: "プログラムが見つかりません。" };

  const db = getFirebaseFirestoreClient();
  if (!db) return { ok: false, error: "Firestore 未設定です。" };

  const matchSnap = await db.collection("matches").where("programId", "==", pid).get();
  for (const doc of matchSnap.docs) {
    const raw = doc.data() as Record<string, unknown>;
    const partnerPending =
      raw.partnerPending === true || !String(raw.partnerId ?? "").trim();
    if (!partnerPending) {
      return {
        ok: false,
        error: "パートナー割当済みのマッチがあるため、このプログラムは削除できません。",
      };
    }
  }

  for (const doc of matchSnap.docs) {
    await doc.ref.delete().catch(() => undefined);
  }
  await db.collection("programs").doc(pid).delete().catch(() => undefined);
  await deleteProgramAppSettingsOverride(pid);
  return { ok: true };
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
