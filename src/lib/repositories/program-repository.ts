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

/**
 * 企業にプログラムを1件追加する。
 * **同一プランは1企業につき1つまで**（個別伴走を2つ、など不可）。
 * 別プランの同居（個別伴走 + コーチング研修）は可。
 */
export async function createProgram(input: {
  companyId: string;
  plan: CompanyPlan;
  name?: string;
}): Promise<{ ok: true; program: ProgramRow } | { ok: false; error: string }> {
  const cid = sanitizeCompanyId(input.companyId);
  if (!cid || !isFirebaseDataBackend()) {
    return { ok: false, error: "プログラムを作成できません。" };
  }
  const db = getFirebaseFirestoreClient();
  if (!db) return { ok: false, error: "Firestore 未設定です。" };
  const settings = await getAppSettingsRow();
  if (!settings.companies.some((c) => c.id === cid)) {
    return { ok: false, error: "登録されていない企業IDです。" };
  }

  const plan = normalizeCompanyPlan(input.plan);
  const existing = await listProgramsForCompany(cid);
  const samePlan = existing.find((p) => p.plan === plan);
  if (samePlan) {
    return {
      ok: false,
      error: `この企業には既に「${companyPlanLabel(plan)}」のプログラムがあります（1企業・1プランにつき1つまで）。別プランの追加のみ可能です。`,
    };
  }

  const id = newProgramId();
  const now = new Date().toISOString();
  const defaultName =
    plan === "individual_companion" ? "コーチング体験" : companyPlanLabel(plan);
  const row: ProgramRow = {
    id,
    companyId: cid,
    plan,
    name: (input.name ?? defaultName).trim().slice(0, 80),
    createdAt: now,
    updatedAt: now,
  };
  await db.collection("programs").doc(id).set(row);
  return { ok: true, program: row };
}

export async function renameProgram(
  programId: string,
  name: string,
): Promise<{ ok: true; program: ProgramRow } | { ok: false; error: string }> {
  const pid = (programId ?? "").trim();
  const nextName = name.trim().slice(0, 80);
  if (!pid || !nextName) return { ok: false, error: "名称を入力してください。" };
  if (!isFirebaseDataBackend()) return { ok: false, error: "プログラムを更新できません。" };
  const db = getFirebaseFirestoreClient();
  if (!db) return { ok: false, error: "Firestore 未設定です。" };
  const existing = await getProgramById(pid);
  if (!existing) return { ok: false, error: "プログラムが見つかりません。" };
  const now = new Date().toISOString();
  await db.collection("programs").doc(pid).set({ name: nextName, updatedAt: now }, { merge: true });
  return { ok: true, program: { ...existing, name: nextName, updatedAt: now } };
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

/** 企業にプログラムが無ければ、企業レジストリのプランから既定プログラムを1件作成する。
 * 既に他プランのプログラムだけある場合は、レジストリプランのプログラムを優先し、
 * 無ければ新規作成する（別プランの最古プログラムへフォールバックしない）。
 */
export async function ensureDefaultProgramForCompany(companyId: string): Promise<ProgramRow | null> {
  const cid = sanitizeCompanyId(companyId);
  if (!cid || !isFirebaseDataBackend()) return null;
  const db = getFirebaseFirestoreClient();
  if (!db) return null;

  const settings = await getAppSettingsRow();
  if (!settings.companies.some((c) => c.id === cid)) return null;
  const plan = resolveCompanyPlan(cid, settings.companies);

  const existing = await listProgramsForCompany(cid);
  const preferred = pickCanonicalProgram(existing, plan);
  if (preferred) return preferred;

  const id = defaultProgramDocId(cid);
  const ref = db.collection("programs").doc(id);
  const existingDoc = await ref.get();
  if (existingDoc.exists) {
    const row = normalizeProgramRow(existingDoc.id, existingDoc.data() ?? {});
    if (row && row.plan === plan) return row;
    // 既定ドキュメントが別プランなら、新しい ID でレジストリプラン用を作成する
    const created = await createProgram({ companyId: cid, plan });
    return created.ok ? created.program : null;
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
    if (again.exists) {
      const normalized = normalizeProgramRow(again.id, again.data() ?? {});
      if (normalized && normalized.plan === plan) return normalized;
    }
    const created = await createProgram({ companyId: cid, plan });
    return created.ok ? created.program : pickCanonicalProgram(await listProgramsForCompany(cid), plan);
  }

  const companyOverride = await getCompanyAppSettingsOverride(cid);
  if (companyOverride) {
    await copyCompanySettingsToProgram(cid, id, companyOverride);
  }
  return row;
}

/** 企業に指定プランのプログラムがあれば返す（無ければ null。勝手に別プランへ落とさない） */
export async function findProgramForCompanyPlan(
  companyId: string,
  plan: CompanyPlan,
): Promise<ProgramRow | null> {
  const cid = sanitizeCompanyId(companyId);
  if (!cid) return null;
  const programs = await listProgramsForCompany(cid);
  return pickCanonicalProgram(programs, plan);
}

/** 個別伴走系（Exec / Pro / 旧）のいずれかのプログラムを返す（優先: Exec → Pro → 旧） */
export async function findAnyIndividualCompanionProgram(
  companyId: string,
): Promise<ProgramRow | null> {
  const cid = sanitizeCompanyId(companyId);
  if (!cid) return null;
  const programs = await listProgramsForCompany(cid);
  const order = [
    "individual_companion_exec",
    "individual_companion_pro",
    "individual_companion",
  ] as const;
  for (const plan of order) {
    const hit = pickCanonicalProgram(programs, plan);
    if (hit) return hit;
  }
  return null;
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
        error:
          "パートナー割当済みのマッチがあるため、このプログラムは削除できません。同一プランの重複がある場合は「重複を統合」で正本へ移してから削除してください。",
      };
    }
  }

  for (const doc of matchSnap.docs) {
    await doc.ref.delete().catch(() => undefined);
  }

  // 参加対象から削除 ID を除去（同じプランの正本があれば差し替え）
  await remappedEnrollmentsAfterProgramRemoval(program).catch(() => undefined);

  await db.collection("programs").doc(pid).delete().catch(() => undefined);
  await deleteProgramAppSettingsOverride(pid);
  return { ok: true };
}

async function remappedEnrollmentsAfterProgramRemoval(removed: ProgramRow): Promise<void> {
  const { listClientsInCompany, setUserEnrolledProgramIds, getUserById } = await import(
    "@/lib/repositories/user-repository"
  );
  const siblings = await listProgramsForCompany(removed.companyId);
  const canonical =
    pickCanonicalProgram(
      siblings.filter((p) => p.id !== removed.id && p.plan === removed.plan),
      removed.plan,
    ) ?? null;
  const clients = await listClientsInCompany(removed.companyId);
  for (const c of clients) {
    const u = await getUserById(c.id);
    const current = Array.isArray((u as { enrolledProgramIds?: string[] } | null)?.enrolledProgramIds)
      ? ((u as { enrolledProgramIds?: string[] }).enrolledProgramIds ?? [])
      : [];
    if (!current.includes(removed.id)) continue;
    const next = current
      .filter((id) => id !== removed.id)
      .concat(canonical && !current.includes(canonical.id) ? [canonical.id] : []);
    await setUserEnrolledProgramIds(c.id, [...new Set(next)]);
  }
}

export type ProgramUsageStats = {
  programId: string;
  matchCount: number;
  assignedMatchCount: number;
  pendingMatchCount: number;
};

/** プログラムごとのマッチ件数（割当済 / 未割当） */
export async function getProgramUsageStats(programId: string): Promise<ProgramUsageStats> {
  const empty: ProgramUsageStats = {
    programId,
    matchCount: 0,
    assignedMatchCount: 0,
    pendingMatchCount: 0,
  };
  const pid = sanitizeProgramId(programId);
  if (!pid || !isFirebaseDataBackend()) return { ...empty, programId: pid };
  const db = getFirebaseFirestoreClient();
  if (!db) return { ...empty, programId: pid };
  const snap = await db.collection("matches").where("programId", "==", pid).get();
  let assigned = 0;
  let pending = 0;
  for (const doc of snap.docs) {
    const raw = doc.data() as Record<string, unknown>;
    const partnerPending =
      raw.partnerPending === true || !String(raw.partnerId ?? "").trim();
    if (partnerPending) pending += 1;
    else assigned += 1;
  }
  return {
    programId: pid,
    matchCount: snap.size,
    assignedMatchCount: assigned,
    pendingMatchCount: pending,
  };
}

/**
 * 同一プランの重複プログラムを、最古の1件（正本）へ統合する。
 * - マッチの programId を正本へ付け替え（クライアント・パートナー関係は維持）
 * - enrolledProgramIds の重複 ID を正本へ置換
 * - 余分なプログラム文書と設定を削除
 * - 月額上限キーがあれば正本へ寄せる
 *
 * 企業単位・明示実行のみ。全社一括は行わない（実クライアント企業の安全のため）。
 */
export async function consolidateDuplicateProgramsForCompany(companyId: string): Promise<
  | {
      ok: true;
      consolidatedPlans: CompanyPlan[];
      keptProgramIds: string[];
      removedProgramIds: string[];
      matchesReassigned: number;
      enrollmentsUpdated: number;
    }
  | { ok: false; error: string }
> {
  const cid = sanitizeCompanyId(companyId);
  if (!cid || !isFirebaseDataBackend()) {
    return { ok: false, error: "企業が見つかりません。" };
  }
  const db = getFirebaseFirestoreClient();
  if (!db) return { ok: false, error: "Firestore 未設定です。" };

  const programs = await listProgramsForCompany(cid);
  const byPlan = new Map<CompanyPlan, ProgramRow[]>();
  for (const p of programs) {
    const list = byPlan.get(p.plan) ?? [];
    list.push(p);
    byPlan.set(p.plan, list);
  }

  const consolidatedPlans: CompanyPlan[] = [];
  const keptProgramIds: string[] = [];
  const removedProgramIds: string[] = [];
  let matchesReassigned = 0;
  let enrollmentsUpdated = 0;

  const idRemap = new Map<string, string>();

  for (const [plan, list] of byPlan) {
    if (list.length <= 1) {
      if (list[0]) keptProgramIds.push(list[0].id);
      continue;
    }
    const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const canonical = sorted[0]!;
    const dupes = sorted.slice(1);
    consolidatedPlans.push(plan);
    keptProgramIds.push(canonical.id);

    for (const d of dupes) {
      idRemap.set(d.id, canonical.id);
      const matchSnap = await db.collection("matches").where("programId", "==", d.id).get();
      for (const doc of matchSnap.docs) {
        await doc.ref.set(
          { programId: canonical.id, updatedAt: new Date().toISOString() },
          { merge: true },
        );
        matchesReassigned += 1;
      }
      removedProgramIds.push(d.id);
    }
  }

  if (consolidatedPlans.length === 0) {
    return { ok: false, error: "同一プランの重複プログラムはありません。" };
  }

  const { listClientsInCompany, setUserEnrolledProgramIds, getUserById } = await import(
    "@/lib/repositories/user-repository"
  );
  const clients = await listClientsInCompany(cid);
  for (const c of clients) {
    const u = await getUserById(c.id);
    const current = Array.isArray((u as { enrolledProgramIds?: string[] } | null)?.enrolledProgramIds)
      ? ((u as { enrolledProgramIds?: string[] }).enrolledProgramIds ?? [])
      : [];
    if (current.length === 0) continue;
    let changed = false;
    const next: string[] = [];
    for (const id of current) {
      const mapped = idRemap.get(id) ?? id;
      if (mapped !== id) changed = true;
      if (!next.includes(mapped)) next.push(mapped);
    }
    if (changed) {
      await setUserEnrolledProgramIds(c.id, next);
      enrollmentsUpdated += 1;
    }
  }

  // 月額上限: 重複 programId の値を正本へ寄せる
  try {
    const { getMonthlyGlobalSettings, upsertMonthlyGlobalSettings } = await import(
      "@/lib/repositories/monthly-session-repository"
    );
    const settings = await getMonthlyGlobalSettings();
    const limits = { ...settings.monthlyLimitsByProgramId };
    let limitsChanged = false;
    for (const [fromId, toId] of idRemap) {
      if (limits[fromId] === undefined) continue;
      if (limits[toId] === undefined || limits[toId] === 0) {
        limits[toId] = limits[fromId]!;
      }
      delete limits[fromId];
      limitsChanged = true;
    }
    if (limitsChanged) {
      await upsertMonthlyGlobalSettings({ monthlyLimitsByProgramId: limits });
    }
  } catch {
    // 月額設定が無くても統合自体は続行
  }

  for (const removedId of removedProgramIds) {
    await deleteProgramAppSettingsOverride(removedId);
    await db.collection("programs").doc(removedId).delete().catch(() => undefined);
  }

  return {
    ok: true,
    consolidatedPlans,
    keptProgramIds: [...new Set(keptProgramIds)],
    removedProgramIds,
    matchesReassigned,
    enrollmentsUpdated,
  };
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
