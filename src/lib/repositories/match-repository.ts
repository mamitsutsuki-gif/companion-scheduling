import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";
import { companyLabelFromRegistry } from "@/lib/company-display";
import { companyPlanLabel, isIndividualCompanionPlan } from "@/lib/company-plan";
import { getProgramById } from "@/lib/repositories/program-repository";
import { PENDING_PARTNER_DISPLAY_NAME } from "@/lib/match-partner-pending";
import { canBeMatchPartnerForPlan } from "@/lib/individual-companion-match";
import type { CompanyPlan } from "@/lib/company-plan";

type MatchUser = { id: string; displayName: string; email?: string; companyId?: string | null };

function normalizeCompanyId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type MatchClientWithCompany = MatchUser & { companyName?: string | null };

export type MatchRow = {
  id: string;
  partnerId: string;
  clientId: string;
  programId: string | null;
  programName: string | null;
  programPlanLabel: string | null;
  partnerPending: boolean;
  createdAt: string;
  partner: MatchUser;
  client: MatchClientWithCompany;
};

function readProgramId(raw: Record<string, unknown>): string | null {
  const id = typeof raw.programId === "string" ? raw.programId.trim() : "";
  return id.length > 0 ? id : null;
}

async function programMeta(programId: string | null) {
  if (!programId) return { programName: null as string | null, programPlanLabel: null as string | null };
  const program = await getProgramById(programId);
  if (!program) return { programName: null, programPlanLabel: null };
  return { programName: program.name, programPlanLabel: companyPlanLabel(program.plan) };
}

export async function backfillMatchProgramId(matchId: string, programId: string) {
  if (!isFirebaseDataBackend()) return;
  const db = getFirebaseFirestoreClient();
  if (!db) return;
  await db.collection("matches").doc(matchId).set({ programId }, { merge: true });
}

export async function findMatchForClientAndProgram(
  clientId: string,
  programId: string,
  opts?: { allowLegacyBackfill?: boolean },
): Promise<{ id: string; partnerPending: boolean } | null> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const snap = await db.collection("matches").where("clientId", "==", clientId).get();
    let legacy: { id: string; partnerPending: boolean } | null = null;
    for (const doc of snap.docs) {
      const raw = doc.data() as Record<string, unknown>;
      const pid = readProgramId(raw);
      if (pid === programId) {
        return { id: doc.id, partnerPending: readPartnerPending(raw) };
      }
      // 割当済みのレガシーマッチは他プランへ付け替えない（特にコーチング研修への漏洩防止）
      if (!pid && !legacy && readPartnerPending(raw)) {
        legacy = { id: doc.id, partnerPending: true };
      }
    }
    if (legacy && opts?.allowLegacyBackfill !== false) {
      const program = await getProgramById(programId);
      // コーチング研修へ既存マッチを書き換えることは禁止（他プランの割当済みペアを汚染しない）
      if (program?.plan === "coaching_management_training") {
        return null;
      }
      await backfillMatchProgramId(legacy.id, programId);
      return legacy;
    }
    return null;
  }
  return null;
}

function readPartnerPending(raw: Record<string, unknown>): boolean {
  if (raw.partnerPending === true) return true;
  return !String(raw.partnerId ?? "").trim();
}

function partnerFromDoc(raw: Record<string, unknown>, users: Map<string, MatchUser>): MatchUser {
  const pending = readPartnerPending(raw);
  if (pending) {
    return { id: "", displayName: PENDING_PARTNER_DISPLAY_NAME };
  }
  return (
    users.get(String(raw.partnerId ?? "")) ?? {
      id: String(raw.partnerId ?? ""),
      displayName: "不明",
    }
  );
}

async function getUserMap(ids: string[]) {
  const db = getFirebaseFirestoreClient();
  if (!db) return new Map<string, MatchUser>();
  const uniq = [...new Set(ids)];
  const snaps = await Promise.all(uniq.map((id) => db.collection("users").doc(id).get()));
  const map = new Map<string, MatchUser>();
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const data = snap.data() as Record<string, unknown>;
    map.set(snap.id, {
      id: snap.id,
      displayName: String(data.displayName ?? "ユーザー"),
      email: typeof data.email === "string" ? data.email : undefined,
      companyId: normalizeCompanyId(data.companyId),
    });
  }
  return map;
}

export async function listMatchesForRole(input: { role: Role; userId: string }) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    const all = await db.collection("matches").get();
    type MatchDoc = {
      id: string;
      partnerId: string;
      clientId: string;
      programId: string | null;
      partnerPending: boolean;
      createdAt: string;
    };
    const docs: MatchDoc[] = all.docs
      .map((d) => {
        const raw = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          partnerId: String(raw.partnerId ?? ""),
          clientId: String(raw.clientId ?? ""),
          programId: readProgramId(raw),
          partnerPending: readPartnerPending(raw),
          createdAt: String(raw.createdAt ?? new Date().toISOString()),
        };
      })
      .filter((m) => {
        if (input.role === "ADMIN" || input.role === "ADMIN_ASSISTANT") return true;
        if (input.role === "PARTNER") return !m.partnerPending && m.partnerId === input.userId;
        // 個別伴走: CLIENT_ADMIN が上司として partnerId に入っているルームも自分の一覧に出す
        if (input.role === "CLIENT_ADMIN" && !m.partnerPending && m.partnerId === input.userId) {
          return true;
        }
        return m.clientId === input.userId;
      });

    const users = await getUserMap(
      docs.flatMap((d) => [String(d.partnerId ?? ""), String(d.clientId ?? "")]).filter(Boolean),
    );
    const settings = await getAppSettingsRow();
    const programIds = [...new Set(docs.map((d) => d.programId).filter((id): id is string => Boolean(id)))];
    const programCache = new Map<string, Awaited<ReturnType<typeof getProgramById>>>();
    await Promise.all(
      programIds.map(async (pid) => {
        programCache.set(pid, await getProgramById(pid));
      }),
    );

    // 上司ルームは個別伴走プログラムのときだけ一覧に残す（読み取り側の防御）
    // programId 欠落のレガシー上司マッチも残す
    const visibleDocs = docs.filter((m) => {
      if (input.role !== "CLIENT_ADMIN") return true;
      if (m.partnerPending || m.partnerId !== input.userId) return true;
      if (m.clientId === input.userId) return true;
      if (!m.programId) return true;
      const program = programCache.get(m.programId);
      return !program || isIndividualCompanionPlan(program.plan);
    });

    return visibleDocs
      .map((m) => {
        const raw = { partnerId: m.partnerId, partnerPending: m.partnerPending };
        const partner = partnerFromDoc(raw, users);
        const clientRaw = users.get(String(m.clientId ?? "")) ?? {
          id: String(m.clientId ?? ""),
          displayName: "不明",
        };
        const client: MatchClientWithCompany = {
          ...clientRaw,
          companyName: companyLabelFromRegistry(clientRaw.companyId, settings.companies),
        };
        const program = m.programId ? programCache.get(m.programId) : null;
        return {
          id: m.id,
          partnerId: m.partnerPending ? "" : partner.id,
          clientId: client.id,
          programId: m.programId,
          programName: program?.name ?? null,
          programPlanLabel: program ? companyPlanLabel(program.plan) : null,
          partnerPending: m.partnerPending,
          createdAt: String(m.createdAt ?? new Date().toISOString()),
          partner,
          client,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const settings = await getAppSettingsRow();

  if (input.role === "ADMIN" || input.role === "ADMIN_ASSISTANT") {
    const rows = await prisma.match.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        partner: { select: { id: true, displayName: true, email: true } },
        client: { select: { id: true, displayName: true, email: true, companyId: true } },
      },
    });
    return rows.map((r) => ({
      ...r,
      client: {
        ...r.client,
        companyName: companyLabelFromRegistry(
          (r.client as { companyId?: string | null }).companyId,
          settings.companies,
        ),
      },
    }));
  }

  const where =
    input.role === "PARTNER"
      ? { partnerId: input.userId }
      : input.role === "CLIENT_ADMIN"
        ? { OR: [{ clientId: input.userId }, { partnerId: input.userId }] }
        : { clientId: input.userId };
  const rows = await prisma.match.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      partner: { select: { id: true, displayName: true } },
      client: { select: { id: true, displayName: true, companyId: true } },
    },
  });

  const mapped = [];
  for (const r of rows) {
    if (
      input.role === "CLIENT_ADMIN" &&
      r.partnerId === input.userId &&
      r.clientId !== input.userId
    ) {
      const program = r.programId ? await getProgramById(r.programId) : null;
      if (program && !isIndividualCompanionPlan(program.plan)) continue;
    }
    mapped.push({
      ...r,
      client: {
        ...r.client,
        companyName: companyLabelFromRegistry(
          (r.client as { companyId?: string | null }).companyId,
          settings.companies,
        ),
      },
    });
  }
  return mapped;
}

function validateSupervisorPartnerPair(input: {
  partnerRole: string | undefined;
  partnerCompanyId: string | null;
  clientRole: string | undefined;
  clientCompanyId: string | null;
  programPlan: CompanyPlan;
}): { ok: true } | { ok: false; error: string } {
  if (!canBeMatchPartnerForPlan(input.partnerRole, input.programPlan)) {
    if (isIndividualCompanionPlan(input.programPlan)) {
      return {
        ok: false,
        error: "パートナー側は PARTNER、または個別伴走の上司（CLIENT_ADMIN）を指定してください。",
      };
    }
    return { ok: false, error: "パートナー側のユーザーが不正です。" };
  }
  if (input.partnerRole === "CLIENT_ADMIN") {
    if (input.clientRole !== "CLIENT") {
      return { ok: false, error: "上司マッチでは部下側は CLIENT を指定してください。" };
    }
    if (!input.partnerCompanyId || !input.clientCompanyId || input.partnerCompanyId !== input.clientCompanyId) {
      return { ok: false, error: "上司と部下は同じ企業に所属している必要があります。" };
    }
  }
  return { ok: true };
}

export async function createMatchAsAdmin(
  partnerId: string,
  clientId: string,
  programId: string,
) {
  const pending = await findPendingMatchForClient(clientId, programId);
  if (pending) {
    const assigned = await assignPartnerToPendingMatch(pending.id, partnerId);
    if (!assigned.ok) return assigned;
    return { ok: true as const, matchId: pending.id };
  }

  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return { ok: false as const, error: "Firestore 未設定です。" };
    const partner = await db.collection("users").doc(partnerId).get();
    const client = await db.collection("users").doc(clientId).get();
    const program = await getProgramById(programId);
    if (!program) return { ok: false as const, error: "プログラムが見つかりません。" };
    {
      const r = client.data()?.role as string | undefined;
      if (
        !client.exists ||
        (r !== "CLIENT" && r !== "CLIENT_ADMIN" && r !== "CLIENT_HR")
      ) {
        return { ok: false as const, error: "クライアント側のユーザーが不正です。" };
      }
    }
    if (!partner.exists) {
      return { ok: false as const, error: "パートナー側のユーザーが不正です。" };
    }
    const partnerRole = partner.data()?.role as string | undefined;
    const partnerCompanyId = normalizeCompanyId(partner.data()?.companyId);
    const clientCompanyId = normalizeCompanyId(client.data()?.companyId);
    const pair = validateSupervisorPartnerPair({
      partnerRole,
      partnerCompanyId,
      clientRole: client.data()?.role as string | undefined,
      clientCompanyId,
      programPlan: program.plan,
    });
    if (!pair.ok) return { ok: false as const, error: pair.error };
    if (!clientCompanyId || clientCompanyId !== program.companyId) {
      return { ok: false as const, error: "クライアントの所属企業とプログラムが一致しません。" };
    }

    const dup = await db
      .collection("matches")
      .where("partnerId", "==", partnerId)
      .where("clientId", "==", clientId)
      .where("programId", "==", programId)
      .limit(1)
      .get();
    if (!dup.empty) return { ok: false as const, error: "この組み合わせのマッチは既に存在します。", status: 409 };

    const existingForProgram = await findMatchForClientAndProgram(clientId, programId);
    if (existingForProgram) {
      return {
        ok: false as const,
        error: "このクライアントには同じプログラムのルームが既にあります。未割当ルームへパートナーを割り当ててください。",
        status: 409,
      };
    }

    const ref = db.collection("matches").doc();
    await ref.set({
      partnerId,
      clientId,
      programId,
      createdAt: new Date().toISOString(),
    });
    return { ok: true as const, matchId: ref.id };
  }

  const program = await getProgramById(programId);
  if (!program) return { ok: false as const, error: "プログラムが見つかりません。" };
  const [partner, client] = await prisma.$transaction([
    prisma.user.findUnique({ where: { id: partnerId } }),
    prisma.user.findUnique({ where: { id: clientId } }),
  ]);
  if (!partner) return { ok: false as const, error: "パートナー側のユーザーが不正です。" };
  if (
    !client ||
    (client.role !== "CLIENT" &&
      client.role !== "CLIENT_ADMIN" &&
      client.role !== "CLIENT_HR")
  )
    return { ok: false as const, error: "クライアント側のユーザーが不正です。" };
  const pair = validateSupervisorPartnerPair({
    partnerRole: partner.role,
    partnerCompanyId: normalizeCompanyId((partner as { companyId?: string | null }).companyId),
    clientRole: client.role,
    clientCompanyId: normalizeCompanyId((client as { companyId?: string | null }).companyId),
    programPlan: program.plan,
  });
  if (!pair.ok) return { ok: false as const, error: pair.error };
  const existingSameProgram = await prisma.match.findFirst({
    where: { partnerId, clientId, programId: programId || null },
    select: { id: true },
  });
  if (existingSameProgram) {
    return { ok: false as const, error: "この組み合わせのマッチは既に存在します。", status: 409 };
  }
  try {
    const match = await prisma.match.create({
      data: { partnerId, clientId, programId: programId || null },
    });
    return { ok: true as const, matchId: match.id };
  } catch {
    return { ok: false as const, error: "この組み合わせのマッチは既に存在します。", status: 409 };
  }
}

export async function getMatchById(matchId: string) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const snap = await db.collection("matches").doc(matchId).get();
    if (!snap.exists) return null;
    const raw = snap.data() as Record<string, unknown>;
    const partnerPending = readPartnerPending(raw);
    const userIds = [String(raw.clientId ?? "")];
    if (!partnerPending) userIds.push(String(raw.partnerId ?? ""));
    const users = await getUserMap(userIds.filter(Boolean));
    const client = users.get(String(raw.clientId ?? ""));
    if (!client) return null;
    const partner = partnerFromDoc(raw, users);
    const programId = readProgramId(raw);
    const meta = await programMeta(programId);
    return {
      id: snap.id,
      partnerId: partnerPending ? "" : partner.id,
      clientId: client.id,
      programId,
      programName: meta.programName,
      programPlanLabel: meta.programPlanLabel,
      partnerPending,
      partner,
      client,
      createdAt: String(raw.createdAt ?? new Date().toISOString()),
    };
  }

  const row = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      partner: true,
      client: true,
    },
  });
  if (!row) return null;
  return { ...row, partnerPending: false };
}

export async function findAnyMatchForClient(clientId: string): Promise<{ id: string } | null> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const snap = await db.collection("matches").where("clientId", "==", clientId).limit(1).get();
    if (snap.empty) return null;
    return { id: snap.docs[0]!.id };
  }
  const row = await prisma.match.findFirst({
    where: { clientId },
    select: { id: true },
  });
  return row ? { id: row.id } : null;
}

/** クライアントが参加しているマッチ ID 一覧（新しい順ではないが上限内で返す） */
export async function listMatchIdsForClient(clientId: string, limit = 20): Promise<string[]> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    const snap = await db.collection("matches").where("clientId", "==", clientId).get();
    return snap.docs.slice(0, Math.max(1, limit)).map((d) => d.id);
  }
  const rows = await prisma.match.findMany({
    where: { clientId },
    select: { id: true },
    take: Math.max(1, limit),
  });
  return rows.map((r) => r.id);
}

export async function findPendingMatchForClient(
  clientId: string,
  programId?: string | null,
): Promise<{ id: string } | null> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    const snap = await db.collection("matches").where("clientId", "==", clientId).get();
    for (const doc of snap.docs) {
      const raw = doc.data() as Record<string, unknown>;
      if (!readPartnerPending(raw)) continue;
      if (programId) {
        const pid = readProgramId(raw);
        if (pid !== programId) continue;
      }
      return { id: doc.id };
    }
    return null;
  }
  return null;
}

export async function createPendingCoachingMatchForClient(
  clientId: string,
  programId: string,
): Promise<{ ok: true; matchId: string } | { ok: false; error: string }> {
  if (!isFirebaseDataBackend()) {
    return { ok: false, error: "この環境では未割当ルームを作成できません。" };
  }
  const db = getFirebaseFirestoreClient();
  if (!db) return { ok: false, error: "Firestore 未設定です。" };

  const program = await getProgramById(programId);
  if (!program || program.plan !== "coaching_management_training") {
    return { ok: false, error: "コーチング研修プログラムが不正です。" };
  }

  const client = await db.collection("users").doc(clientId).get();
  const role = client.data()?.role as string | undefined;
  if (
    !client.exists ||
    (role !== "CLIENT" && role !== "CLIENT_ADMIN" && role !== "CLIENT_HR")
  ) {
    return { ok: false, error: "クライアントユーザーが不正です。" };
  }
  const clientCompanyId = normalizeCompanyId(client.data()?.companyId);
  if (!clientCompanyId || clientCompanyId !== program.companyId) {
    return { ok: false, error: "クライアントの所属企業とプログラムが一致しません。" };
  }

  const existing = await findMatchForClientAndProgram(clientId, programId, {
    allowLegacyBackfill: false,
  });
  if (existing) return { ok: false, error: "このプログラムのルームは既に存在します。" };

  const ref = db.collection("matches").doc();
  await ref.set({
    partnerId: "",
    clientId,
    programId,
    partnerPending: true,
    createdAt: new Date().toISOString(),
  });
  return { ok: true, matchId: ref.id };
}

export async function assignPartnerToPendingMatch(
  matchId: string,
  partnerId: string,
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  if (!isFirebaseDataBackend()) {
    return { ok: false, error: "この環境では未割当ルームを更新できません。" };
  }
  const db = getFirebaseFirestoreClient();
  if (!db) return { ok: false, error: "Firestore 未設定です。" };

  const partner = await db.collection("users").doc(partnerId).get();
  if (!partner.exists) {
    return { ok: false, error: "パートナー側のユーザーが不正です。" };
  }

  const matchRef = db.collection("matches").doc(matchId);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) return { ok: false, error: "マッチが見つかりません。", status: 404 };
  const raw = matchSnap.data() as Record<string, unknown>;
  if (!readPartnerPending(raw)) {
    return { ok: false, error: "このルームは既にパートナーが割り当てられています。", status: 409 };
  }

  const programId = readProgramId(raw);
  const program = programId ? await getProgramById(programId) : null;
  if (!program) return { ok: false, error: "プログラムが見つかりません。" };

  const clientId = String(raw.clientId ?? "");
  const client = await db.collection("users").doc(clientId).get();
  const pair = validateSupervisorPartnerPair({
    partnerRole: partner.data()?.role as string | undefined,
    partnerCompanyId: normalizeCompanyId(partner.data()?.companyId),
    clientRole: client.data()?.role as string | undefined,
    clientCompanyId: normalizeCompanyId(client.data()?.companyId),
    programPlan: program.plan,
  });
  if (!pair.ok) return { ok: false, error: pair.error };

  const dup = await db
    .collection("matches")
    .where("partnerId", "==", partnerId)
    .where("clientId", "==", clientId)
    .where("programId", "==", programId)
    .limit(1)
    .get();
  if (!dup.empty) {
    return { ok: false, error: "この組み合わせのマッチは既に存在します。", status: 409 };
  }

  await matchRef.update({
    partnerId,
    partnerPending: false,
  });
  return { ok: true };
}

/**
 * 参加対象外の「未割当コーチング研修ルーム」だけを削除する。
 * パートナー割当済みマッチは絶対に消さない。
 */
export async function deleteOrphanPendingCoachingMatchesForClient(
  clientId: string,
  allowedCoachingProgramIds: Set<string>,
): Promise<number> {
  if (!isFirebaseDataBackend()) return 0;
  const db = getFirebaseFirestoreClient();
  if (!db) return 0;
  const snap = await db.collection("matches").where("clientId", "==", clientId).get();
  let deleted = 0;
  for (const doc of snap.docs) {
    const raw = doc.data() as Record<string, unknown>;
    if (!readPartnerPending(raw)) continue;
    const pid = readProgramId(raw);
    if (!pid) continue;
    const program = await getProgramById(pid);
    if (!program || program.plan !== "coaching_management_training") continue;
    if (allowedCoachingProgramIds.has(pid)) continue;
    const result = await clearMatchAsAdmin(doc.id);
    if (result.ok) deleted += 1;
  }
  return deleted;
}

export async function clearMatchAsAdmin(matchId: string) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return { ok: false as const, error: "Firestore 未設定です。" };
    const matchRef = db.collection("matches").doc(matchId);
    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) return { ok: false as const, error: "マッチが見つかりません。", status: 404 };

    const msgSnap = await db.collection("messages").where("matchId", "==", matchId).get();
    const negSnap = await db.collection("negotiations").where("matchId", "==", matchId).get();

    const refs = [matchRef, ...msgSnap.docs.map((d) => d.ref), ...negSnap.docs.map((d) => d.ref)];
    const batchSize = 450;
    for (let i = 0; i < refs.length; i += batchSize) {
      const batch = db.batch();
      refs.slice(i, i + batchSize).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
    return { ok: true as const };
  }

  try {
    await prisma.match.delete({ where: { id: matchId } });
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "マッチが見つかりません。", status: 404 };
  }
}

export async function hasMatchBetween(
  partnerId: string,
  clientId: string,
  programId?: string | null,
) {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return false;
    let query = db
      .collection("matches")
      .where("partnerId", "==", partnerId)
      .where("clientId", "==", clientId);
    if (programId) {
      query = query.where("programId", "==", programId);
    }
    const snap = await query.limit(1).get();
    return !snap.empty;
  }
  const row = await prisma.match.findFirst({
    where: {
      partnerId,
      clientId,
      ...(programId ? { programId } : {}),
    },
    select: { id: true },
  });
  return Boolean(row);
}
