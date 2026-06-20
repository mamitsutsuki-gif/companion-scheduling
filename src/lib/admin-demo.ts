import {
  companyPlanLabel,
  resolvePlanFeatures,
  shouldShowGlobalFta,
  type CompanyPlan,
  type PlanFeatures,
} from "@/lib/company-plan";
import { getEffectiveAppSettingsForMatch } from "@/lib/effective-app-settings";
import { getMatchById } from "@/lib/repositories/match-repository";
import { getUserById } from "@/lib/repositories/user-repository";
import { listSessionPlanForMatch } from "@/lib/repositories/match-sessions-repository";
import { listConfirmedSessionsForCompany } from "@/lib/repositories/confirmed-sessions-admin-repository";
import { getRoleplayStore } from "@/lib/repositories/coaching-repository";
import { roleplaySideComplete } from "@/lib/coaching-roleplay";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";
import { companyLabelFromRegistry } from "@/lib/company-display";

export type DemoRole = "CLIENT" | "CLIENT_ADMIN" | "PARTNER";

export type DemoNavItem = { label: string; active?: boolean };

export type DemoSessionRow = {
  sessionNumber: number;
  label: string;
  status: "scheduled" | "done" | "pending";
};

export type DemoRolePreview = {
  role: DemoRole;
  roleLabel: string;
  nav: DemoNavItem[];
  highlights: string[];
  matchRoomTabs: string[];
  sessions: DemoSessionRow[];
  focusLines: string[];
  clientAdminSessions?: Array<{
    clientDisplayName: string;
    sessionNumber: number;
    startAt: string;
    endAt: string;
  }>;
};

export type AdminDemoMatchPreview = {
  matchId: string;
  companyId: string | null;
  companyName: string;
  planLabel: string;
  companyPlan: CompanyPlan;
  clientName: string;
  partnerName: string;
  totalSessions: number;
  previews: Record<DemoRole, DemoRolePreview>;
};

export type AdminDemoCompanyOption = {
  id: string;
  name: string;
  plan: CompanyPlan;
  planLabel: string;
  matchCount: number;
};

export type AdminDemoMatchOption = {
  id: string;
  clientName: string;
  partnerName: string;
  companyId: string | null;
  companyName: string;
};

function formatJa(iso: string, opts: Intl.DateTimeFormatOptions = {}) {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      ...opts,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function matchRoomTabs(planFeatures: PlanFeatures, role: DemoRole | "ADMIN"): string[] {
  const tabs: string[] = ["プロジェクト概要"];
  if (role === "PARTNER" && planFeatures.clientInfo) tabs.push("クライアント情報");
  if (planFeatures.chat) tabs.push("チャット");
  if (planFeatures.schedule) tabs.push("日程調整");
  if (planFeatures.sessions) tabs.push("1on1セッション");
  if (planFeatures.skillCheck) tabs.push("スキルチェック");
  if (planFeatures.lifelineChart) tabs.push("ライフラインチャート");
  if (planFeatures.fta && (role === "PARTNER" || role === "CLIENT")) tabs.push("自分FTA");
  if (planFeatures.pdca) tabs.push("PDCA");
  if (planFeatures.reflection) tabs.push("振り返り");
  if (planFeatures.summaryReport) tabs.push("サマリーレポート");
  if (planFeatures.coachingQuestions) tabs.push("質問リスト");
  if (planFeatures.coachingIcebreaker) tabs.push("アイスブレイク");
  if (planFeatures.coachingOneOnOneFormat) tabs.push("1on1フォーマット");
  return tabs;
}

function sessionRowsFromPlan(
  plan: Awaited<ReturnType<typeof listSessionPlanForMatch>>,
  now: Date,
): DemoSessionRow[] {
  return plan.map((row) => {
    let status: DemoSessionRow["status"] = "pending";
    let label = "日程未確定";
    if (row.confirmed && row.startAt && row.endAt) {
      const end = new Date(row.endAt);
      if (end <= now) {
        status = "done";
        label = `${formatJa(row.startAt)} 実施済`;
      } else {
        status = "scheduled";
        label = `${formatJa(row.startAt)} 予定`;
      }
    }
    return { sessionNumber: row.sessionNumber, label, status };
  });
}

function buildFocusLines(args: {
  role: DemoRole;
  partnerName: string;
  clientName: string;
  plan: Awaited<ReturnType<typeof listSessionPlanForMatch>>;
  isCoaching: boolean;
  roleplayStore: Awaited<ReturnType<typeof getRoleplayStore>> | null;
  now: Date;
}): string[] {
  const lines: string[] = [];
  const other = args.role === "PARTNER" ? `${args.clientName}さん` : `${args.partnerName}さん`;
  const upcoming = args.plan
    .filter((s) => s.confirmed && s.startAt && new Date(s.startAt) > args.now)
    .sort((a, b) => new Date(a.startAt!).getTime() - new Date(b.startAt!).getTime())[0];
  if (upcoming?.startAt) {
    lines.push(`次回 1on1: 第${upcoming.sessionNumber}回（${formatJa(upcoming.startAt)}）— ${other}`);
  }
  if (args.isCoaching && args.roleplayStore) {
    for (let i = 1; i <= 3; i++) {
      const s = args.roleplayStore.sessions[i - 1];
      if (!s) continue;
      const side = args.role === "PARTNER" ? "partner" : "client";
      if (!roleplaySideComplete(s, side)) {
        lines.push(`第${i}回のロールプレイ評価が未入力です`);
        break;
      }
    }
  }
  if (lines.length === 0) {
    lines.push(args.role === "PARTNER" ? "担当クライアントとのルームから日程・セッションを進められます" : "マッチルームから 1on1 の日程調整・振り返りができます");
  }
  return lines.slice(0, 3);
}

function roleHighlights(role: DemoRole, planLabel: string, planFeatures: PlanFeatures): string[] {
  if (role === "CLIENT") {
    const items = [
      "ホームで「次にやること」と次回 1on1 を確認",
      "マッチルームでチャット・日程調整・各回の振り返り",
      `導入プラン: ${planLabel}`,
    ];
    if (planFeatures.reflection) items.push("振り返りシートや PDCA など成果物を入力（パートナーと共有）");
    return items;
  }
  if (role === "CLIENT_ADMIN") {
    return [
      "自社クライアントの 1on1 確定日程を一覧で確認（パートナー名は非表示）",
      "スキルチェック結果を社内で俯瞰",
      "個別のマッチルームには入らず、運用状況の把握が中心",
    ];
  }
  return [
    "担当クライアントとのマッチルームで日程提案・チャット",
    "各回のパートナーレポート提出（クライアント振り返りは閲覧可）",
    `導入プラン: ${planLabel}`,
  ];
}

function navForRole(role: DemoRole, showFta: boolean): DemoNavItem[] {
  const base: DemoNavItem[] = [{ label: "ホーム", active: true }, { label: "通知" }];
  if (role === "CLIENT_ADMIN") {
    return [
      { label: "ホーム", active: false },
      { label: "通知" },
      { label: "1on1セッション一覧", active: true },
      { label: "スキルチェック" },
    ];
  }
  if (showFta && role === "CLIENT") base.push({ label: "自分FTA" });
  if (role === "PARTNER") {
    base.push({ label: "請求書" }, { label: "会議リンク設定" });
  }
  return base;
}

export async function listAdminDemoMatchesForAdmin(adminUserId: string): Promise<{
  companies: AdminDemoCompanyOption[];
  matchesByCompany: Record<string, AdminDemoMatchOption[]>;
  unassignedMatches: AdminDemoMatchOption[];
}> {
  const settings = await getAppSettingsRow();
  const { listMatchesForRole } = await import("@/lib/repositories/match-repository");
  const matches = (await listMatchesForRole({ role: "ADMIN", userId: adminUserId })) as Array<{
    id: string;
    client: { displayName: string; companyId?: string | null; companyName?: string | null };
    partner: { displayName: string };
  }>;

  const matchesByCompany: Record<string, AdminDemoMatchOption[]> = {};
  const unassignedMatches: AdminDemoMatchOption[] = [];

  for (const m of matches) {
    const cid = (m.client.companyId ?? "").trim();
    const row: AdminDemoMatchOption = {
      id: m.id,
      clientName: m.client.displayName,
      partnerName: m.partner.displayName,
      companyId: cid || null,
      companyName: cid
        ? (companyLabelFromRegistry(cid, settings.companies) ?? cid)
        : "（企業未割当）",
    };
    if (!cid) {
      unassignedMatches.push(row);
      continue;
    }
    if (!matchesByCompany[cid]) matchesByCompany[cid] = [];
    matchesByCompany[cid].push(row);
  }

  const companies: AdminDemoCompanyOption[] = settings.companies.map((c) => ({
    id: c.id,
    name: c.name,
    plan: c.plan ?? "workplace_activation",
    planLabel: companyPlanLabel(c.plan),
    matchCount: matchesByCompany[c.id]?.length ?? 0,
  }));

  return { companies, matchesByCompany, unassignedMatches };
}

export async function buildAdminDemoMatchPreview(matchId: string): Promise<AdminDemoMatchPreview | null> {
  const match = await getMatchById(matchId);
  if (!match) return null;

  const [client, partner, effective, plan, settings] = await Promise.all([
    getUserById(match.clientId),
    getUserById(match.partnerId),
    getEffectiveAppSettingsForMatch(matchId),
    listSessionPlanForMatch(matchId),
    getAppSettingsRow(),
  ]);
  if (!client || !partner) return null;

  const companyId = ((client as { companyId?: string | null }).companyId ?? "").trim() || null;
  const companyName = companyId
    ? (companyLabelFromRegistry(companyId, settings.companies) ?? companyId)
    : "（企業未割当）";
  const planFeatures = resolvePlanFeatures(
    effective.companyPlan,
    effective.planFeatureOverrides,
  );
  const isCoaching = effective.companyPlan === "coaching_management_training";
  const roleplayStore = isCoaching ? await getRoleplayStore(matchId) : null;
  const now = new Date();
  const sessions = sessionRowsFromPlan(plan, now);
  const clientShowFta = shouldShowGlobalFta("CLIENT", effective.companyPlan);
  const partnerShowFta = shouldShowGlobalFta("PARTNER", effective.companyPlan);

  let clientAdminSessions: DemoRolePreview["clientAdminSessions"];
  if (companyId) {
    const rows = await listConfirmedSessionsForCompany(companyId);
    clientAdminSessions = rows.slice(0, 8).map((r) => ({
      clientDisplayName: r.clientDisplayName,
      sessionNumber: r.sessionNumber,
      startAt: r.startAt,
      endAt: r.endAt,
    }));
  }

  const clientName = client.displayName;
  const partnerName = partner.displayName;
  const planLabel = companyPlanLabel(effective.companyPlan);

  const base = {
    matchId,
    companyId,
    companyName,
    planLabel,
    companyPlan: effective.companyPlan,
    clientName,
    partnerName,
    totalSessions: effective.totalSessions,
  };

  const previews: Record<DemoRole, DemoRolePreview> = {
    CLIENT: {
      role: "CLIENT",
      roleLabel: "クライアント",
      nav: navForRole("CLIENT", clientShowFta),
      highlights: roleHighlights("CLIENT", planLabel, planFeatures),
      matchRoomTabs: matchRoomTabs(planFeatures, "CLIENT"),
      sessions,
      focusLines: buildFocusLines({
        role: "CLIENT",
        partnerName,
        clientName,
        plan,
        isCoaching,
        roleplayStore,
        now,
      }),
    },
    CLIENT_ADMIN: {
      role: "CLIENT_ADMIN",
      roleLabel: "クライアント管理者",
      nav: navForRole("CLIENT_ADMIN", false),
      highlights: roleHighlights("CLIENT_ADMIN", planLabel, planFeatures),
      matchRoomTabs: [],
      sessions: [],
      focusLines: [
        companyId
          ? `${companyName} 所属クライアントの 1on1 日程を横断確認`
          : "所属企業が未設定のため、このロールの一覧は表示されません",
      ],
      clientAdminSessions,
    },
    PARTNER: {
      role: "PARTNER",
      roleLabel: "パートナー",
      nav: navForRole("PARTNER", partnerShowFta),
      highlights: roleHighlights("PARTNER", planLabel, planFeatures),
      matchRoomTabs: matchRoomTabs(planFeatures, "PARTNER"),
      sessions,
      focusLines: buildFocusLines({
        role: "PARTNER",
        partnerName,
        clientName,
        plan,
        isCoaching,
        roleplayStore,
        now,
      }),
    },
  };

  return { ...base, previews };
}
