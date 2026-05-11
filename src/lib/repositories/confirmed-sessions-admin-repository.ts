import { prisma } from "@/lib/prisma";
import { getFirebaseFirestoreClient, isFirebaseDataBackend } from "@/lib/firebase-admin";
import { listClientsInCompany } from "@/lib/repositories/user-repository";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";
import { companyLabelFromRegistry } from "@/lib/company-display";

export type AdminConfirmedSessionRow = {
  matchId: string;
  negotiationId: string;
  sessionNumber: number;
  round: number;
  partnerDisplayName: string;
  clientDisplayName: string;
  /** クライアントが所属している企業の登録 ID（未設定の場合は null） */
  clientCompanyId: string | null;
  /** 企業表示ラベル（「企業名（ID）」）。未登録 ID や未設定は null */
  clientCompanyName: string | null;
  startAt: string;
  endAt: string;
};

export type CompanyConfirmedSessionRow = {
  /** クライアント管理者が見られる範囲では partner の名前を**意図的に隠す** */
  sessionNumber: number;
  round: number;
  clientDisplayName: string;
  startAt: string;
  endAt: string;
};

type UserBrief = { displayName: string; companyId: string | null };

async function userInfoMap(ids: string[]): Promise<Map<string, UserBrief>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  const db = getFirebaseFirestoreClient();
  const map = new Map<string, UserBrief>();
  if (!db) return map;
  await Promise.all(
    uniq.map(async (id) => {
      const snap = await db.collection("users").doc(id).get();
      if (!snap.exists) return;
      const data = snap.data() as Record<string, unknown>;
      const cid = data.companyId;
      map.set(id, {
        displayName: String(data.displayName ?? "ユーザー"),
        companyId: typeof cid === "string" && cid.trim().length > 0 ? cid : null,
      });
    }),
  );
  return map;
}

type Candidate = {
  matchId: string;
  negotiationId: string;
  sessionNumber: number;
  round: number;
  startAt: string;
  endAt: string;
  partnerId: string;
  clientId: string;
};

function pickLatestRoundPerSession(candidates: Candidate[]): Candidate[] {
  const byKey = new Map<string, Candidate>();
  for (const c of candidates) {
    const key = `${c.matchId}:${c.sessionNumber}`;
    const prev = byKey.get(key);
    if (!prev || c.round > prev.round) byKey.set(key, c);
  }
  return [...byKey.values()];
}

export async function listEffectiveConfirmedSessionsForAdmin(): Promise<AdminConfirmedSessionRow[]> {
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (!db) return [];
    const [matchesSnap, negSnap] = await Promise.all([
      db.collection("matches").get(),
      db.collection("negotiations").where("status", "==", "CONFIRMED").get(),
    ]);
    const matchPartner = new Map<string, { partnerId: string; clientId: string }>();
    for (const d of matchesSnap.docs) {
      const raw = d.data() as Record<string, unknown>;
      matchPartner.set(d.id, {
        partnerId: String(raw.partnerId ?? ""),
        clientId: String(raw.clientId ?? ""),
      });
    }

    const candidates: Candidate[] = [];
    for (const d of negSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      const matchId = String(data.matchId ?? "");
      const pair = matchPartner.get(matchId);
      if (!pair) continue;
      const slots = Array.isArray(data.slots) ? (data.slots as Record<string, unknown>[]) : [];
      const confirmed = slots.find((s) => Boolean(s.isConfirmed));
      if (!confirmed) continue;
      candidates.push({
        matchId,
        negotiationId: d.id,
        sessionNumber: Math.max(1, Number(data.sessionNumber ?? 1)),
        round: Number(data.round ?? 1),
        startAt: String(confirmed.startAt ?? ""),
        endAt: String(confirmed.endAt ?? ""),
        partnerId: pair.partnerId,
        clientId: pair.clientId,
      });
    }

    const effective = pickLatestRoundPerSession(candidates);
    const ids = new Set<string>();
    for (const c of effective) {
      ids.add(c.partnerId);
      ids.add(c.clientId);
    }
    const [users, settings] = await Promise.all([userInfoMap([...ids]), getAppSettingsRow()]);

    return effective
      .map((c) => {
        const partner = users.get(c.partnerId);
        const client = users.get(c.clientId);
        return {
          matchId: c.matchId,
          negotiationId: c.negotiationId,
          sessionNumber: c.sessionNumber,
          round: c.round,
          partnerDisplayName: partner?.displayName ?? "—",
          clientDisplayName: client?.displayName ?? "—",
          clientCompanyId: client?.companyId ?? null,
          clientCompanyName: companyLabelFromRegistry(client?.companyId, settings.companies),
          startAt: c.startAt,
          endAt: c.endAt,
        };
      })
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  }

  const negs = await prisma.negotiation.findMany({
    where: { status: "CONFIRMED" },
    include: {
      slots: true,
      match: {
        include: {
          partner: true,
          client: { select: { id: true, displayName: true, companyId: true } },
        },
      },
    },
  });

  const candidates: Candidate[] = negs
    .map((n) => {
      const slot = n.slots.find((s) => s.isConfirmed);
      if (!slot) return null;
      return {
        matchId: n.matchId,
        negotiationId: n.id,
        sessionNumber: Math.max(1, n.sessionNumber ?? 1),
        round: n.round,
        startAt: slot.startAt.toISOString(),
        endAt: slot.endAt.toISOString(),
        partnerId: n.match.partnerId,
        clientId: n.match.clientId,
      };
    })
    .filter((x): x is Candidate => x !== null);

  const effective = pickLatestRoundPerSession(candidates);
  const settings = await getAppSettingsRow();

  return effective
    .map((c) => {
      const n = negs.find((x) => x.id === c.negotiationId);
      if (!n) return null;
      const cid =
        (n.match.client as unknown as { companyId?: string | null }).companyId ?? null;
      return {
        matchId: c.matchId,
        negotiationId: c.negotiationId,
        sessionNumber: c.sessionNumber,
        round: c.round,
        partnerDisplayName: n.match.partner.displayName,
        clientDisplayName: n.match.client.displayName,
        clientCompanyId: typeof cid === "string" && cid.trim().length > 0 ? cid : null,
        clientCompanyName: companyLabelFromRegistry(cid, settings.companies),
        startAt: c.startAt,
        endAt: c.endAt,
      };
    })
    .filter((x): x is AdminConfirmedSessionRow => x !== null)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/**
 * クライアント管理者向け：自社（同じ companyId）のクライアントのみ、
 * 確定済みセッション一覧を返す。**パートナーの名前は含めない**。
 */
export async function listConfirmedSessionsForCompany(
  companyId: string,
): Promise<CompanyConfirmedSessionRow[]> {
  if (!companyId) return [];
  const clients = await listClientsInCompany(companyId);
  const allowedClientIds = new Set(clients.map((c) => c.id));
  if (allowedClientIds.size === 0) return [];
  const all = await listEffectiveConfirmedSessionsForAdmin();
  // 既に表示名は揃っているが、念のため client が同社か再チェックするため
  // matches を取得して clientId をマッピング。
  const clientIdByMatch = new Map<string, string>();
  if (isFirebaseDataBackend()) {
    const db = getFirebaseFirestoreClient();
    if (db) {
      const ms = await db.collection("matches").get();
      for (const d of ms.docs) {
        const r = d.data() as Record<string, unknown>;
        clientIdByMatch.set(d.id, String(r.clientId ?? ""));
      }
    }
  } else {
    const rows = await prisma.match.findMany({ select: { id: true, clientId: true } });
    for (const r of rows) clientIdByMatch.set(r.id, r.clientId);
  }

  return all
    .filter((row) => allowedClientIds.has(clientIdByMatch.get(row.matchId) ?? ""))
    .map((row) => ({
      sessionNumber: row.sessionNumber,
      round: row.round,
      clientDisplayName: row.clientDisplayName,
      startAt: row.startAt,
      endAt: row.endAt,
    }));
}
