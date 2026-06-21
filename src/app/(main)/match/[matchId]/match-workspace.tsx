"use client";

import {
  ScheduleConfirmedCard,
  SlotProposalCard,
  VoteSummaryCard,
} from "@/components/scheduling-chat-blocks";
import { PartnerChatTemplates } from "@/components/partner-chat-templates";
import { FtaEditor, FtaViewer } from "@/components/fta-chart";
import { SkillCheckPanel } from "@/components/skill-check-panel";
import { PdcaPanel } from "@/components/pdca-panel";
import { ReflectionPanel } from "@/components/reflection-panel";
import { LifelinePanel } from "@/components/lifeline-panel";
import { SummaryReportPanel } from "@/components/summary-report-panel";
import { CoachingQuestionsPanel } from "@/components/coaching-questions-panel";
import { CoachingIcebreakerPanel } from "@/components/coaching-icebreaker-panel";
import { CoachingOneOnOneFormatPanel } from "@/components/coaching-one-on-one-format-panel";
import type { FtaChart } from "@/lib/fta";
import { defaultFtaChart } from "@/lib/fta";
import {
  DEFAULT_COMPANY_PLAN,
  companyPlanLabel,
  getPlanFeatures,
  type CompanyPlan,
  type PlanFeatures,
} from "@/lib/company-plan";
import { MatchRoomGuideBanner } from "@/components/match-room-guide-banner";
import { ScheduleRulesDetail } from "@/components/schedule-rules-detail";
import {
  SCHEDULE_SUMMARY_CLIENT,
  SCHEDULE_SUMMARY_PARTNER,
  type SchedulingGuideAudience,
} from "@/lib/scheduling-rules-copy";
import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";

type Role =
  | "ADMIN"
  | "PARTNER"
  | "CLIENT"
  | "CLIENT_ADMIN"
  | "CLIENT_HR"
  | "ADMIN_ASSISTANT";

type Me = {
  id: string;
  role: Role;
  displayName: string;
};

type MessageKindName = "STANDARD" | "SLOT_PROPOSAL" | "SCHEDULE_CONFIRMED" | "VOTE_SUMMARY";

type MessageRow = {
  id: string;
  body: string;
  kind: MessageKindName;
  payload: unknown | null;
  createdAt: string;
  sender: { displayName: string; role: Role };
};

type RawMessageApi = Omit<MessageRow, "kind" | "payload"> & {
  kind?: MessageKindName;
  payload?: unknown | null;
};

type SlotRow = {
  id: string;
  startAt: string;
  endAt: string;
  clientVote: "YES" | "NO" | null;
  isConfirmed: boolean;
};

type NegotiationRow = {
  id: string;
  sessionNumber?: number;
  round: number;
  status:
    | "AWAITING_CLIENT_RESPONSE"
    | "NEEDS_NEW_PROPOSAL"
    | "AWAITING_PARTNER_CONFIRM"
    | "CONFIRMED"
    | "SUPERSEDED";
  slots: SlotRow[];
  confirmedZoomUrl?: string | null;
  confirmedZoomMeetingId?: string | null;
  confirmedZoomPass?: string | null;
  rescheduleRequestedAt?: string | null;
};

type MatchFtaPayload = {
  targetRole: "CLIENT" | "NONE";
  targetName: string;
  chart: unknown | null;
};

type AvailabilityPayload = {
  partner: { displayName: string; slotIds: string[]; labels: string[] };
  client: { displayName: string; slotIds: string[]; labels: string[] };
};

type ScheduleSettingsPayload = {
  slotDurationMinutes: number;
  totalSessions: number;
  timezone: string;
  slotEarliestHour: number;
  slotLatestHour: number;
  allowWeekends: boolean;
  effectiveCompanyId: string | null;
  effectiveCompanyName: string | null;
  overriddenFields: string[];
  companyPlan: CompanyPlan;
  planFeatures: PlanFeatures;
};

const DEFAULT_PLAN_FEATURES = getPlanFeatures(DEFAULT_COMPANY_PLAN);

type MatchTab =
  | "chat"
  | "schedule"
  | "fta"
  | "sessions"
  | "overview"
  | "clientInfo"
  | "skillCheck"
  | "pdca"
  | "reflection"
  | "summaryReport"
  | "lifelineChart"
  | "coachingQuestions"
  | "coachingIcebreaker"
  | "coachingOneOnOneFormat";

const TAB_HASH_MAP: Record<string, MatchTab> = {
  chat: "chat",
  schedule: "schedule",
  fta: "fta",
  sessions: "sessions",
  overview: "overview",
  "client-info": "clientInfo",
  "skill-check": "skillCheck",
  pdca: "pdca",
  reflection: "reflection",
  "summary-report": "summaryReport",
  "lifeline-chart": "lifelineChart",
  roleplay: "sessions",
  "coaching-roleplay": "sessions",
  questions: "coachingQuestions",
  "coaching-questions": "coachingQuestions",
  icebreaker: "coachingIcebreaker",
  "coaching-icebreaker": "coachingIcebreaker",
  "one-on-one-format": "coachingOneOnOneFormat",
  format: "coachingOneOnOneFormat",
};

function tabFromHash(hash: string): MatchTab | null {
  const h = hash.replace(/^#/, "").toLowerCase();
  return TAB_HASH_MAP[h] ?? null;
}

function hashFromTab(tab: MatchTab): string {
  if (tab === "clientInfo") return "client-info";
  if (tab === "skillCheck") return "skill-check";
  if (tab === "summaryReport") return "summary-report";
  if (tab === "lifelineChart") return "lifeline-chart";
  if (tab === "coachingQuestions") return "questions";
  if (tab === "coachingIcebreaker") return "icebreaker";
  if (tab === "coachingOneOnOneFormat") return "one-on-one-format";
  return tab;
}

function isClientSideRole(role: Me["role"]) {
  return role === "CLIENT" || role === "CLIENT_ADMIN" || role === "CLIENT_HR";
}

function canShowFtaTab(me: Me, settings: ScheduleSettingsPayload): boolean {
  if (!settings.planFeatures.fta) return false;
  if (me.role === "PARTNER" || me.role === "ADMIN" || me.role === "ADMIN_ASSISTANT") return true;
  return isClientSideRole(me.role);
}

function ftaTabLabel(me: Me, _settings: ScheduleSettingsPayload): string {
  return isClientSideRole(me.role) ? "自分FTA" : "クライアント自分FTA";
}

type SessionAbandonmentApi = {
  reason: "no_show" | "late_cancel";
  markedAt: string;
  markedBy: string;
};

type SessionPlanApiRow = {
  matchId: string;
  sessionNumber: number;
  confirmed: boolean;
  round: number | null;
  startAt: string | null;
  endAt: string | null;
  negotiationId: string | null;
  openable: boolean;
  hasClientFeedback: boolean;
  hasPartnerReport: boolean;
  abandonment?: SessionAbandonmentApi | null;
  zoomUrl?: string | null;
  zoomMeetingId?: string | null;
  zoomPass?: string | null;
};

type PartnerOverviewRow = {
  companyName: string;
  sessionPeriod: string;
  sessionFrequency: string;
  background: string;
  sessionFocus: string;
  expectations: string;
  other: string;
};

type ClientOverviewRow = {
  sessionPeriod: string;
  sessionFrequency: string;
  background: string;
  sessionFocus: string;
  expectations: string;
  other: string;
};

type ClientPartnerBriefingPayload = {
  companyName: string;
  clientDisplayName: string;
  age: number | null;
  jobTitle: string | null;
  isManagement: boolean | null;
};

function formatManagementForDisplay(isManagement: boolean | null): string {
  if (isManagement === true) return "該当する";
  if (isManagement === false) return "該当しない";
  return "";
}

function fieldBlock(label: string, value: string) {
  const v = value.trim();
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <h3 className="text-sm font-semibold text-slate-800">{label}</h3>
      <p className={`mt-2 whitespace-pre-wrap text-sm ${v ? "text-slate-700" : "text-slate-400"}`}>
        {v || "（未入力）"}
      </p>
    </div>
  );
}

function renderPartnerOverview(
  o: PartnerOverviewRow | null,
  options?: { showAdminHint?: boolean },
) {
  if (!o) {
    // クライアント／パートナーには細かい運用事情（企業ごとの設定で入力が必要…等）を見せない。
    // 管理者・管理者アシスタントには注釈付きの案内を出す。
    return options?.showAdminHint ? (
      <p className="text-sm text-slate-600">
        入力なし（管理画面から「プロジェクト概要（パートナー向け）」を入力できます）
      </p>
    ) : (
      <p className="text-sm text-slate-500">ただいま表示できる概要がありません。</p>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-1">
      {fieldBlock("企業名", o.companyName)}
      {fieldBlock("1on1セッション期間", o.sessionPeriod)}
      {fieldBlock("1on1セッション頻度", o.sessionFrequency)}
      {fieldBlock("導入背景", o.background)}
      {fieldBlock("1on1セッションで行うこと", o.sessionFocus)}
      {fieldBlock("期待すること", o.expectations)}
      {fieldBlock("その他", o.other)}
    </div>
  );
}

function renderClientOverview(
  o: ClientOverviewRow | null,
  options?: { showAdminHint?: boolean },
) {
  if (!o) {
    return options?.showAdminHint ? (
      <p className="text-sm text-slate-600">
        入力なし（管理画面から「プロジェクト概要（クライアント向け）」を入力できます）
      </p>
    ) : (
      <p className="text-sm text-slate-500">ただいま表示できる概要がありません。</p>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-1">
      {fieldBlock("1on1セッション期間", o.sessionPeriod)}
      {fieldBlock("1on1セッション頻度", o.sessionFrequency)}
      {fieldBlock("導入背景", o.background)}
      {fieldBlock("1on1セッションで行うこと", o.sessionFocus)}
      {fieldBlock("期待すること", o.expectations)}
      {fieldBlock("その他", o.other)}
    </div>
  );
}

const statusLabel: Record<NegotiationRow["status"], string> = {
  AWAITING_CLIENT_RESPONSE: "クライアント回答待ち",
  NEEDS_NEW_PROPOSAL: "すべて×／再提案が必要",
  AWAITING_PARTNER_CONFIRM: "パートナーによる確定待ち",
  CONFIRMED: "確定済み",
  SUPERSEDED: "再提案により破棄",
};

const roleBadge: Record<Role, string> = {
  ADMIN: "管理者",
  ADMIN_ASSISTANT: "管理者アシスタント",
  PARTNER: "パートナー",
  CLIENT: "クライアント",
  CLIENT_ADMIN: "クライアント管理者",
  CLIENT_HR: "クライアント人事",
};

function formatJa(iso: string, timeZone = "Asia/Tokyo") {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function withHonorificSan(name: string) {
  return `${name}さん`;
}

function isClientRole(role: Role) {
  return role === "CLIENT" || role === "CLIENT_ADMIN" || role === "CLIENT_HR";
}

function scrollToClientScheduleVote() {
  window.setTimeout(() => {
    document.getElementById("client-schedule-vote")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 80);
}

/** チャット上の日程候補カードと紐づく、回答待ちラウンド（negotiationId 一致時のみ） */
function resolveVoteNegotiationForMessage(
  msg: MessageRow,
  negotiations: NegotiationRow[],
): NegotiationRow | null {
  if (msg.kind !== "SLOT_PROPOSAL") return null;
  const negId = (msg.payload as { negotiationId?: string } | null)?.negotiationId;
  if (!negId) return null;
  const neg = negotiations.find((n) => n.id === negId);
  return neg?.status === "AWAITING_CLIENT_RESPONSE" ? neg : null;
}

function schedulingGuideAudience(role: Role): SchedulingGuideAudience | null {
  if (role === "PARTNER" || role === "ADMIN" || role === "ADMIN_ASSISTANT") return "partner";
  if (role === "CLIENT" || role === "CLIENT_ADMIN" || role === "CLIENT_HR") return "client";
  return null;
}

function chatSendFormLabel(role: Role): string {
  return role === "PARTNER"
    ? "メッセージ送信（クライアントにチャットを送付する）"
    : "メッセージ送信";
}

/** チャットタブ上部の日程ガイド（ロールごと）。 */
function ChatScheduleHints({ role }: { role: Role }) {
  const audience = schedulingGuideAudience(role);
  return (
    <>
      {audience === "partner" ? (
        <div className="app-surface-indigo rounded-2xl px-4 py-3">
          <p className="text-sm font-medium text-indigo-950">{SCHEDULE_SUMMARY_PARTNER}</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-semibold text-indigo-700 hover:underline">
              日程調整の詳しいご案内を開く
            </summary>
            <ScheduleRulesDetail
              audience="partner"
              className="mt-3 pr-1"
              scrollClassName="max-h-[min(60vh,24rem)] overflow-y-auto overflow-x-hidden"
            />
          </details>
        </div>
      ) : null}
      {audience === "client" ? (
        <div className="app-surface-indigo rounded-2xl px-4 py-3">
          <p className="text-sm font-medium text-indigo-950">{SCHEDULE_SUMMARY_CLIENT}</p>
          <p className="mt-2 text-xs text-indigo-900/85">
            日程候補がチャットに届いたら「ここから回答（日程調整タブへ）」から、日程調整画面で ◯・× を入力してください。
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-semibold text-indigo-700 hover:underline">
              日程調整の詳しいご案内を開く
            </summary>
            <ScheduleRulesDetail
              audience="client"
              className="mt-3 pr-1"
              scrollClassName="max-h-[min(60vh,24rem)] overflow-y-auto overflow-x-hidden"
            />
          </details>
        </div>
      ) : null}
    </>
  );
}

function ChatMsgRow({
  msg,
  me,
  chatLastReadAt,
  negotiations,
  activeNegotiation,
  onChatVote,
  voteSubmittingForSlot,
  navigateToTab,
}: {
  msg: MessageRow;
  me: Me;
  chatLastReadAt: number;
  negotiations: NegotiationRow[];
  activeNegotiation: NegotiationRow | null;
  onChatVote: (negotiationId: string, slotId: string, vote: "YES" | "NO") => void | Promise<void>;
  voteSubmittingForSlot: string | null;
  navigateToTab: (tab: MatchTab) => void;
}) {
  const ts = new Date(msg.createdAt).valueOf() || 0;
  const isUnread =
    ts > chatLastReadAt &&
    msg.sender.role !== "ADMIN" &&
    msg.sender.role !== "ADMIN_ASSISTANT" &&
    me.role !== msg.sender.role;
  const voteNegotiation =
    isClientRole(me.role) ? resolveVoteNegotiationForMessage(msg, negotiations) : null;
  const awaitingClientVote =
    isClientRole(me.role) && activeNegotiation?.status === "AWAITING_CLIENT_RESPONSE";
  const jumpToScheduleVote = () => {
    navigateToTab("schedule");
    scrollToClientScheduleVote();
  };
  const showScheduleVoteLink =
    msg.kind === "SLOT_PROPOSAL" &&
    isClientRole(me.role) &&
    (Boolean(voteNegotiation) || awaitingClientVote);
  const baseClass =
    msg.kind === "SLOT_PROPOSAL"
      ? "rounded-xl border border-indigo-100 bg-indigo-50/35 px-3 py-2 text-sm text-slate-900"
      : msg.kind === "SCHEDULE_CONFIRMED"
        ? "rounded-xl border border-emerald-100 bg-emerald-50/35 px-3 py-2 text-sm text-slate-900"
        : msg.kind === "VOTE_SUMMARY"
          ? "rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2 text-sm text-slate-900"
          : "rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-900";
  return (
    <article
      className={`${baseClass} ${isUnread ? "ring-2 ring-amber-300 shadow-md shadow-amber-100" : ""}`}
    >
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {withHonorificSan(msg.sender.displayName)}{" "}
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] tracking-normal text-indigo-800">
          {roleBadge[msg.sender.role as Role] ?? msg.sender.role}
        </span>
        {isUnread ? (
          <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] tracking-normal text-amber-900">
            未読
          </span>
        ) : null}
        {msg.kind === "SLOT_PROPOSAL" ? (
          <span className="ml-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] tracking-normal text-indigo-900">
            日程候補
          </span>
        ) : null}
        {msg.kind === "SCHEDULE_CONFIRMED" ? (
          <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] tracking-normal text-emerald-900">
            確定
          </span>
        ) : null}
        {msg.kind === "VOTE_SUMMARY" ? (
          <span className="ml-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] tracking-normal text-indigo-900">
            回答
          </span>
        ) : null}
      </div>

      {msg.kind === "SLOT_PROPOSAL" ? (
        <div className="mt-2 space-y-2">
          <SlotProposalCard
            payload={msg.payload}
            onJumpToScheduleVote={showScheduleVoteLink ? jumpToScheduleVote : undefined}
          />
          <p className="text-xs text-indigo-900/75">{msg.body}</p>
        </div>
      ) : msg.kind === "SCHEDULE_CONFIRMED" ? (
        <div className="mt-2 space-y-2">
          <ScheduleConfirmedCard payload={msg.payload} />
          <pre className="whitespace-pre-wrap font-sans text-xs text-emerald-900/80">{msg.body}</pre>
        </div>
      ) : msg.kind === "VOTE_SUMMARY" ? (
        <div className="mt-2">
          <VoteSummaryCard
            payload={msg.payload}
            body={msg.body}
            onJumpToConfirm={() => {
              navigateToTab("schedule");
              window.setTimeout(() => {
                const el = document.getElementById("partner-confirm-section");
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              }, 80);
            }}
          />
        </div>
      ) : (
        <pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{msg.body}</pre>
      )}

      <div className="mt-2 text-[11px] text-slate-400">{formatJa(msg.createdAt)}</div>
    </article>
  );
}

function ChatMessageThread({
  messages,
  me,
  chatLastReadAt,
  negotiations,
  activeNegotiation,
  onChatVote,
  voteSubmittingForSlot,
  navigateToTab,
  scrollClassName,
}: {
  messages: MessageRow[];
  me: Me;
  chatLastReadAt: number;
  negotiations: NegotiationRow[];
  activeNegotiation: NegotiationRow | null;
  onChatVote: (negotiationId: string, slotId: string, vote: "YES" | "NO") => void | Promise<void>;
  voteSubmittingForSlot: string | null;
  navigateToTab: (tab: MatchTab) => void;
  scrollClassName: string;
}) {
  return (
    <div
      className={`app-surface-raised space-y-3 overflow-y-auto rounded-2xl p-4 ${scrollClassName}`}
      data-chat-thread
    >
      {messages.map((msg) => (
        <ChatMsgRow
          key={msg.id}
          msg={msg}
          me={me}
          chatLastReadAt={chatLastReadAt}
          negotiations={negotiations}
          activeNegotiation={activeNegotiation}
          onChatVote={onChatVote}
          voteSubmittingForSlot={voteSubmittingForSlot}
          navigateToTab={navigateToTab}
        />
      ))}
      {messages.length === 0 ? <p className="text-sm text-slate-500">まだメッセージがありません。</p> : null}
    </div>
  );
}

function msUntilStart(iso: string) {
  const start = new Date(iso).getTime();
  if (!Number.isFinite(start)) return Number.NaN;
  return start - Date.now();
}

/**
 * match ページ最上部に出す「あなたの今の状態」バナーの内容を決定する。
 *
 * - クライアント／パートナー目線で「今この瞬間あなたが何をすべきか」を 1 行で示す
 * - 何もすることが無い時は null を返す（バナー非表示）
 * - 確定済みで開始 24h 以内のときはリマインダ
 * - 過去回で振り返り／レポート未提出のときは催促
 *
 * UI 側は returned object を見て severity に応じた配色で 1 枚だけ出す。
 */
type StatusBannerInfo = {
  message: string;
  severity: "info" | "todo" | "warn";
  ctaLabel?: string;
  ctaTab?: MatchTab;
  /** タブ切替後にスクロールする要素 id */
  scrollToId?: string;
};
function computeMatchBanner(args: {
  meRole: Role;
  negotiations: NegotiationRow[];
  sessionRows: SessionPlanApiRow[];
  totalSessions: number;
  now: Date;
}): StatusBannerInfo | null {
  const { meRole, negotiations, sessionRows, totalSessions, now } = args;
  if (meRole === "ADMIN" || meRole === "ADMIN_ASSISTANT") return null;
  const isClientSide = meRole === "CLIENT" || meRole === "CLIENT_ADMIN" || meRole === "CLIENT_HR";
  const isPartner = meRole === "PARTNER";

  // 最新ラウンドを session ごとに 1 件にまとめる
  const latestPerSession = new Map<number, NegotiationRow>();
  for (const n of negotiations) {
    const sn = Math.max(1, n.sessionNumber ?? 1);
    const prev = latestPerSession.get(sn);
    if (!prev || n.round > prev.round) latestPerSession.set(sn, n);
  }
  const activeNegotiations = Array.from(latestPerSession.values())
    .filter((n) => n.status !== "CONFIRMED" && n.status !== "SUPERSEDED")
    .sort((a, b) => (a.sessionNumber ?? 1) - (b.sessionNumber ?? 1));
  const active = activeNegotiations[0];

  if (active) {
    const sn = active.sessionNumber ?? 1;
    if (active.status === "AWAITING_CLIENT_RESPONSE" && isClientSide) {
      return {
        message: `あなたの番です — 第 ${sn} 回の候補日に ◯× で回答してください。`,
        severity: "todo",
        ctaLabel: "回答する",
        ctaTab: "schedule",
      };
    }
    if (active.status === "AWAITING_CLIENT_RESPONSE" && isPartner) {
      return {
        message: `クライアントの回答待ち — 第 ${sn} 回の候補日への ◯× を待っています。`,
        severity: "info",
        ctaLabel: "状況を確認",
        ctaTab: "schedule",
      };
    }
    if (active.status === "NEEDS_NEW_PROPOSAL" && isPartner) {
      return {
        message: `あなたの番です — 第 ${sn} 回はすべて × でした。新しい候補日を送ってください。`,
        severity: "warn",
        ctaLabel: "候補日を送る",
        ctaTab: "schedule",
      };
    }
    if (active.status === "NEEDS_NEW_PROPOSAL" && isClientSide) {
      return {
        message: `パートナーが新しい候補日を準備中 — 第 ${sn} 回の候補日が再送されるのをお待ちください。`,
        severity: "info",
        ctaLabel: "状況を確認",
        ctaTab: "schedule",
      };
    }
    if (active.status === "AWAITING_PARTNER_CONFIRM" && isPartner) {
      return {
        message: `あなたの番です — 第 ${sn} 回の日程を ◯ から決定してください。`,
        severity: "todo",
        ctaLabel: "日程を決定する",
        ctaTab: "schedule",
        scrollToId: "partner-confirm-section",
      };
    }
    if (active.status === "AWAITING_PARTNER_CONFIRM" && isClientSide) {
      return {
        message: `パートナーが日程を決定中 — 第 ${sn} 回の確定をお待ちください。`,
        severity: "info",
      };
    }
  }

  // 振り返り / レポート 未提出
  const unsubmitted = sessionRows.find(
    (s) =>
      s.confirmed &&
      s.endAt &&
      new Date(s.endAt) <= now &&
      !(s.abandonment) &&
      ((isClientSide && !s.hasClientFeedback) || (isPartner && !s.hasPartnerReport)),
  );
  if (unsubmitted) {
    return {
      message: isClientSide
        ? `第 ${unsubmitted.sessionNumber} 回の振り返り（フィードバック）がまだ提出されていません。`
        : `第 ${unsubmitted.sessionNumber} 回のパートナーレポートがまだ提出されていません。`,
      severity: "todo",
      ctaLabel: isClientSide ? "振り返りを書く" : "レポートを書く",
      ctaTab: "sessions",
    };
  }

  // 直近セッションのリマインダ (開始 24h 以内)
  const upcoming = sessionRows
    .filter((s) => s.confirmed && s.startAt && new Date(s.startAt) > now)
    .sort((a, b) => new Date(a.startAt!).getTime() - new Date(b.startAt!).getTime())[0];
  if (upcoming && upcoming.startAt) {
    const hrs = (new Date(upcoming.startAt).getTime() - now.getTime()) / 3_600_000;
    if (hrs <= 24) {
      const dt = new Intl.DateTimeFormat("ja-JP", {
        month: "numeric",
        day: "numeric",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(upcoming.startAt));
      return {
        message: `第 ${upcoming.sessionNumber} 回はまもなく開始です（${dt} 〜）。`,
        severity: "info",
        ctaLabel: "セッション詳細を開く",
        ctaTab: "sessions",
      };
    }
  }

  // パートナーで、まだ候補が出ていない session があれば「候補を送る」
  // （進行中の調整があるときは誤誘導になるため出さない）
  if (isPartner && activeNegotiations.length === 0) {
    const known = new Set(negotiations.map((n) => Math.max(1, n.sessionNumber ?? 1)));
    let need: number | null = null;
    for (let i = 1; i <= Math.max(totalSessions, 1); i++) {
      if (!known.has(i)) {
        need = i;
        break;
      }
    }
    if (need !== null) {
      return {
        message:
          need === 1
            ? `あなたの番です — 第 1 回（初回）の候補日を送ってください。`
            : `あなたの番です — 第 ${need} 回の候補日を送ってください。`,
        severity: need === 1 ? "warn" : "todo",
        ctaLabel: "候補日を送る",
        ctaTab: "schedule",
      };
    }
  }

  return null;
}

export function MatchWorkspace({ matchId }: { matchId: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [negotiations, setNegotiations] = useState<NegotiationRow[]>([]);
  const [scheduleSettings, setScheduleSettings] = useState<ScheduleSettingsPayload>({
    slotDurationMinutes: 30,
    totalSessions: 6,
    timezone: "Asia/Tokyo",
    slotEarliestHour: 8,
    slotLatestHour: 20,
    allowWeekends: false,
    effectiveCompanyId: null,
    effectiveCompanyName: null,
    overriddenFields: [],
    companyPlan: DEFAULT_COMPANY_PLAN,
    planFeatures: DEFAULT_PLAN_FEATURES,
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rescheduleSubmittingSession, setRescheduleSubmittingSession] = useState<number | null>(null);
  const [clientFta, setClientFta] = useState<MatchFtaPayload | null>(null);
  const [myFtaChart, setMyFtaChart] = useState<FtaChart>(defaultFtaChart());
  const [myFtaDirty, setMyFtaDirty] = useState(false);
  const [myFtaSaving, setMyFtaSaving] = useState(false);
  const [myFtaMsg, setMyFtaMsg] = useState<string | null>(null);
  const [ftaFocusSkillOptions, setFtaFocusSkillOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [availability, setAvailability] = useState<AvailabilityPayload | null>(null);
  const [sessionRows, setSessionRows] = useState<SessionPlanApiRow[]>([]);
  // 初期タブは URL ハッシュから決定する。
  // 例: 通知メールやアプリ内通知から `/match/<id>#schedule` で飛んできた場合に
  // 「日程調整」タブを自動で開く（以前はハッシュ無視で常に "chat" タブが開いていた）。
  const [activeTab, setActiveTab] = useState<MatchTab>(() => {
    if (typeof window === "undefined") return "chat";
    const tab = tabFromHash(window.location.hash || "");
    return tab ?? "chat";
  });
  // クライアント側マウント後にハッシュが変わったときも追随する（戻る/進む対応）。
  useEffect(() => {
    function onHashChange() {
      const tab = tabFromHash(window.location.hash || "");
      if (tab) setActiveTab(tab);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const [projectOverviewJson, setProjectOverviewJson] = useState<unknown>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [proposeSubmitting, setProposeSubmitting] = useState(false);
  const [proposeJustSent, setProposeJustSent] = useState(false);
  const [voteSubmittingForSlot, setVoteSubmittingForSlot] = useState<string | null>(null);
  const [chatLastReadAt, setChatLastReadAt] = useState<number>(0);
  const [chatFullscreen, setChatFullscreen] = useState(false);
  const [clientPartnerBriefing, setClientPartnerBriefing] = useState<ClientPartnerBriefingPayload | null>(
    null,
  );
  const [clientBriefingLoading, setClientBriefingLoading] = useState(false);

  const goTab = useCallback((tab: MatchTab) => {
    setActiveTab(tab);
    try {
      history.replaceState(null, "", `#${hashFromTab(tab)}`);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!me) return;
    if (me.role !== "PARTNER" && me.role !== "ADMIN" && activeTab === "clientInfo") {
      goTab("chat");
    }
  }, [me, activeTab, goTab]);

  useEffect(() => {
    if (activeTab !== "chat") setChatFullscreen(false);
  }, [activeTab]);

  useEffect(() => {
    if (!chatFullscreen) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setChatFullscreen(false);
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [chatFullscreen]);

  useEffect(() => {
    if (!chatFullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [chatFullscreen]);

  const timeOptions = useMemo(() => {
    const interval = Math.max(1, scheduleSettings.slotDurationMinutes);
    const earliest = scheduleSettings.slotEarliestHour * 60;
    // 候補は `start + interval <= latest` までしか取れない
    const latest = scheduleSettings.slotLatestHour * 60 - interval;
    const out: { value: string; label: string }[] = [];
    if (latest < earliest) return out;
    for (let total = earliest; total <= latest; total += interval) {
      const h = Math.floor(total / 60);
      const m = total % 60;
      const value = `${pad2(h)}:${pad2(m)}`;
      out.push({ value, label: value });
    }
    return out;
  }, [
    scheduleSettings.slotDurationMinutes,
    scheduleSettings.slotEarliestHour,
    scheduleSettings.slotLatestHour,
  ]);

  function isWeekendDateString(yyyymmdd: string) {
    if (!yyyymmdd) return false;
    const [y, m, d] = yyyymmdd.split("-").map((v) => Number(v));
    if (!y || !m || !d) return false;
    const dt = new Date(y, m - 1, d);
    const wd = dt.getDay();
    return wd === 0 || wd === 6;
  }

  function onProposeDateInputChange(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    if (scheduleSettings.allowWeekends || !v) return;
    if (isWeekendDateString(v)) {
      e.target.value = "";
      setError(
        "土曜・日曜はこのサービスでは候補として選べません。平日をご選択ください。",
      );
    }
  }

  const load = useCallback(async () => {
    setError(null);
    const [mRes, gRes, nRes, sRes] = await Promise.all([
      fetch("/api/me", { cache: "no-store" }),
      fetch(`/api/matches/${matchId}/messages`, { cache: "no-store" }),
      fetch(`/api/matches/${matchId}/negotiations`, { cache: "no-store" }),
      // matchId を付けることで、当該クライアントの企業に上書きされた設定がある場合
      // それを優先する。無ければグローバル設定にフォールバックする。
      fetch(`/api/settings?matchId=${encodeURIComponent(matchId)}`, { cache: "no-store" }),
    ]);
    const mJson = await mRes.json().catch(() => null);
    const gJson = await gRes.json().catch(() => null);
    const nJson = await nRes.json().catch(() => null);
    const sJson = await sRes.json().catch(() => null);

    if (!mRes.ok) return setError(mJson?.error ?? "ユーザー情報が取得できません。");
    if (!gRes.ok) return setError(gJson?.error ?? "チャットを読込めませんでした。");
    if (!nRes.ok) return setError(nJson?.error ?? "日程情報を読込めませんでした。");

    if (sRes.ok && typeof sJson?.slotDurationMinutes === "number") {
      setScheduleSettings({
        slotDurationMinutes: sJson.slotDurationMinutes,
        totalSessions: typeof sJson.totalSessions === "number" ? sJson.totalSessions : 6,
        timezone: typeof sJson.timezone === "string" ? sJson.timezone : "Asia/Tokyo",
        slotEarliestHour: typeof sJson.slotEarliestHour === "number" ? sJson.slotEarliestHour : 8,
        slotLatestHour: typeof sJson.slotLatestHour === "number" ? sJson.slotLatestHour : 20,
        allowWeekends: sJson.allowWeekends === true,
        effectiveCompanyId:
          typeof sJson.effectiveCompanyId === "string" ? sJson.effectiveCompanyId : null,
        effectiveCompanyName:
          typeof sJson.effectiveCompanyName === "string" ? sJson.effectiveCompanyName : null,
        overriddenFields: Array.isArray(sJson.overriddenFields)
          ? (sJson.overriddenFields as unknown[]).map((x) => String(x))
          : [],
        companyPlan:
          sJson.companyPlan === "individual_companion" ||
          sJson.companyPlan === "coaching_management_training" ||
          sJson.companyPlan === "workplace_activation"
            ? sJson.companyPlan
            : DEFAULT_COMPANY_PLAN,
        planFeatures:
          sJson.planFeatures && typeof sJson.planFeatures === "object"
            ? (sJson.planFeatures as PlanFeatures)
            : DEFAULT_PLAN_FEATURES,
      });
    }

    setMe(mJson.user);
    setMessages(
      ((gJson.messages ?? []) as RawMessageApi[]).map((m) => ({
        ...m,
        kind: m.kind ?? "STANDARD",
        payload: m.payload ?? null,
      })),
    );
    setNegotiations((nJson.negotiations ?? []) as NegotiationRow[]);
  }, [matchId]);

  const loadClientFta = useCallback(async () => {
    const res = await fetch(`/api/matches/${matchId}/fta`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.chart) {
      setClientFta({
        targetRole: json.targetRole,
        targetName: typeof json.targetName === "string" ? json.targetName : "",
        chart: json.chart,
      });
      return;
    }
    setClientFta(null);
  }, [matchId]);

  const loadMyFta = useCallback(async () => {
    const [ftaRes, skillRes] = await Promise.all([
      fetch("/api/fta/me", { cache: "no-store" }),
      fetch("/api/skill-check/me", { cache: "no-store" }),
    ]);
    const ftaJson = await ftaRes.json().catch(() => null);
    const skillJson = await skillRes.json().catch(() => null);
    if (ftaRes.ok && ftaJson?.chart) {
      setMyFtaChart(ftaJson.chart as FtaChart);
      setMyFtaDirty(false);
    }
    if (skillRes.ok && Array.isArray(skillJson?.focusSkillOptions)) {
      setFtaFocusSkillOptions(skillJson.focusSkillOptions);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    const res = await fetch(`/api/matches/${matchId}/sessions`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (res.ok && Array.isArray(json?.sessions)) {
      setSessionRows(json.sessions as SessionPlanApiRow[]);
    }
  }, [matchId]);

  const loadAvailability = useCallback(async () => {
    const res = await fetch(`/api/matches/${matchId}/availability`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.partner && json?.client) {
      setAvailability({
        partner: {
          displayName: String(json.partner.displayName ?? ""),
          slotIds: Array.isArray(json.partner.slotIds) ? json.partner.slotIds : [],
          labels: Array.isArray(json.partner.labels) ? json.partner.labels : [],
        },
        client: {
          displayName: String(json.client.displayName ?? ""),
          slotIds: Array.isArray(json.client.slotIds) ? json.client.slotIds : [],
          labels: Array.isArray(json.client.labels) ? json.client.labels : [],
        },
      });
    }
  }, [matchId]);

  const loadProjectOverview = useCallback(async () => {
    setOverviewLoading(true);
    const res = await fetch(`/api/matches/${matchId}/project-overview`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (res.ok) setProjectOverviewJson(json);
    else setProjectOverviewJson(null);
    setOverviewLoading(false);
  }, [matchId]);

  useEffect(() => {
    void load();
    void loadClientFta();
    void loadAvailability();
    void loadSessions();
  }, [load, loadClientFta, loadAvailability, loadSessions]);

  useEffect(() => {
    if (me && isClientSideRole(me.role) && scheduleSettings.planFeatures.fta) {
      void loadMyFta();
    }
  }, [me, scheduleSettings.planFeatures.fta, loadMyFta]);

  useEffect(() => {
    if (!myFtaDirty || myFtaSaving) return;
    const id = window.setTimeout(async () => {
      setMyFtaSaving(true);
      const res = await fetch("/api/fta/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chart: myFtaChart }),
      });
      const data = await res.json().catch(() => null);
      setMyFtaSaving(false);
      if (!res.ok) {
        setMyFtaMsg(data?.error ?? "自動保存に失敗しました。");
        return;
      }
      if (data?.chart) setMyFtaChart(data.chart as FtaChart);
      setMyFtaDirty(false);
      setMyFtaMsg("自動保存しました。");
      void loadClientFta();
    }, 2000);
    return () => window.clearTimeout(id);
  }, [myFtaChart, myFtaDirty, myFtaSaving, loadClientFta]);

  useEffect(() => {
    if (activeTab !== "overview") return;
    void loadProjectOverview();
  }, [activeTab, loadProjectOverview]);

  const loadClientPartnerBriefing = useCallback(async () => {
    setClientBriefingLoading(true);
    try {
      const res = await fetch(
        `/api/matches/${encodeURIComponent(matchId)}/client-partner-briefing`,
        { cache: "no-store" },
      );
      const json = (await res.json().catch(() => null)) as {
        companyName?: string;
        clientDisplayName?: string;
        age?: number | null;
        jobTitle?: string | null;
        isManagement?: boolean | null;
      } | null;
      if (
        res.ok &&
        json &&
        typeof json.companyName === "string" &&
        typeof json.clientDisplayName === "string"
      ) {
        setClientPartnerBriefing({
          companyName: json.companyName,
          clientDisplayName: json.clientDisplayName,
          age: typeof json.age === "number" ? json.age : null,
          jobTitle: typeof json.jobTitle === "string" ? json.jobTitle : null,
          isManagement:
            typeof json.isManagement === "boolean" ? json.isManagement : null,
        });
      } else {
        setClientPartnerBriefing(null);
      }
    } finally {
      setClientBriefingLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    if (activeTab !== "clientInfo") return;
    if (me?.role !== "PARTNER" && me?.role !== "ADMIN") return;
    void loadClientPartnerBriefing();
  }, [activeTab, me?.role, loadClientPartnerBriefing]);

  useEffect(() => {
    // 軽量ポーリング: チャット反映を高速化（1.2 秒）
    const id = window.setInterval(() => {
      void load();
    }, 1200);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    // セッション一覧は少し緩めに更新
    const id = window.setInterval(() => {
      void loadSessions();
    }, 3000);
    return () => window.clearInterval(id);
  }, [loadSessions]);

  useEffect(() => {
    // FTAは独立で短い間隔で取得し、チャット/日程APIの成否に影響されないようにする。
    const id = window.setInterval(() => {
      void loadClientFta();
    }, 2000);
    return () => window.clearInterval(id);
  }, [loadClientFta]);

  // 既読タイムスタンプを localStorage から復元
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(`chat:lastReadAt:${matchId}`);
      const n = v ? Number(v) : 0;
      setChatLastReadAt(Number.isFinite(n) ? n : 0);
    } catch {
      /* noop */
    }
  }, [matchId]);

  // チャットタブを開いた / メッセージを取得した時点で既読マーク
  useEffect(() => {
    if (activeTab !== "chat") return;
    if (messages.length === 0) return;
    const latest = messages.reduce((acc, m) => Math.max(acc, new Date(m.createdAt).valueOf() || 0), 0);
    if (latest > chatLastReadAt) {
      setChatLastReadAt(latest);
      try {
        window.localStorage.setItem(`chat:lastReadAt:${matchId}`, String(latest));
      } catch {
        /* noop */
      }
    }
  }, [activeTab, messages, chatLastReadAt, matchId]);

  // チャットタブを開いた時、サーバー側にも「このマッチの CHAT 通知を既読にした」と
  // 伝える（ダッシュボードの「次のアクション」未読カウントを下げるため）。
  // chatLastReadAt の更新条件と同様に「タブ=chat & messages がロード済み」で発火。
  // fire-and-forget。fetch エラーは UX に影響しないので catch して握り潰す。
  useEffect(() => {
    if (activeTab !== "chat") return;
    if (!me) return;
    if (me.role === "ADMIN" || me.role === "ADMIN_ASSISTANT") return;
    if (messages.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        await fetch(`/api/matches/${matchId}/chat-read`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
      } catch {
        /* ignore */
      }
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, me, messages.length, matchId]);

  const unreadChatCount = useMemo(() => {
    if (!me) return 0;
    return messages.filter((m) => {
      if (m.sender.role === "ADMIN" || m.sender.role === "ADMIN_ASSISTANT") return false;
      if (me.role === m.sender.role) return false;
      const ts = new Date(m.createdAt).valueOf() || 0;
      return ts > chatLastReadAt;
    }).length;
  }, [messages, chatLastReadAt, me]);

  /** 未確定の最新ラウンド。確定のみ残っていれば `null`。 */
  const activeNegotiation = useMemo(
    () =>
      negotiations.find((n) => n.status !== "CONFIRMED" && n.status !== "SUPERSEDED") ??
      null,
    [negotiations],
  );

  const sessionPlans = useMemo(() => {
    const total = Math.max(1, scheduleSettings.totalSessions);
    const latestConfirmedBySession = new Map<number, { round: number; slot: SlotRow }>();
    for (const n of negotiations) {
      if (n.status !== "CONFIRMED") continue;
      const sessionNumber = Math.max(1, n.sessionNumber ?? 1);
      const confirmed = n.slots.find((s) => s.isConfirmed);
      if (!confirmed) continue;
      const prev = latestConfirmedBySession.get(sessionNumber);
      if (!prev || n.round > prev.round) {
        latestConfirmedBySession.set(sessionNumber, { round: n.round, slot: confirmed });
      }
    }
    return Array.from({ length: total }, (_, i) => ({
      index: i + 1,
      slot: latestConfirmedBySession.get(i + 1)?.slot ?? null,
    }));
  }, [negotiations, scheduleSettings.totalSessions]);

  async function onSendChat(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setNotice(null);
    const fd = new FormData(form);
    const body = String(fd.get("body") ?? "").trim();
    if (!body || !me) return;
    // Optimistic post: 即座にチャット欄に反映する
    const tempId = `local-${Date.now()}`;
    const optimistic: MessageRow = {
      id: tempId,
      body,
      kind: "STANDARD",
      payload: null,
      createdAt: new Date().toISOString(),
      sender: { displayName: me.displayName, role: me.role },
    };
    setMessages((prev) => [...prev, optimistic]);
    form.reset();

    const res = await fetch(`/api/matches/${matchId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      // 失敗時は楽観挿入を取り消し
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setError(json?.error ?? "送信できませんでした。");
      return;
    }
    await load();
  }

  async function onVote(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activeNegotiation || activeNegotiation.status !== "AWAITING_CLIENT_RESPONSE") return;

    const fd = new FormData(e.currentTarget);
    const votes: Record<string, "YES" | "NO"> = {};
    for (const slot of activeNegotiation.slots) {
      const v = fd.get(`vote:${slot.id}`);
      if (v !== "YES" && v !== "NO") return setError("全候補に回答してください");
      votes[slot.id] = v;
    }

    const res = await fetch(
      `/api/matches/${matchId}/negotiations/${activeNegotiation.id}/vote`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ votes }),
      },
    );
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(json?.error ?? "回答送信に失敗しました。");
      return;
    }
    setNotice("回答を送信しました。");
    await load();
  }

  async function onConfirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activeNegotiation || activeNegotiation.status !== "AWAITING_PARTNER_CONFIRM") return;
    const fd = new FormData(e.currentTarget);
    const slotId = String(fd.get("slotId"));
    const res = await fetch(
      `/api/matches/${matchId}/negotiations/${activeNegotiation.id}/confirm`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId }),
      },
    );
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(json?.error ?? "確定処理に失敗しました。");
      return;
    }
    setNotice("確定しました。関係者へメール（.ics 添付）で通知しました。");
    await load();
  }

  async function onPropose(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (me?.role !== "PARTNER") return;
    if (proposeSubmitting) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const sessionNumber = Number(fd.get("sessionNumber") ?? 1);
    const starts: string[] = [];
    for (let i = 1; i <= 5; i += 1) {
      const raw = String(fd.get(`start${i}`) ?? "").trim();
      const date = String(fd.get(`startDate${i}`) ?? "").trim();
      const time = String(fd.get(`startTime${i}`) ?? "").trim();
      const merged = raw || (date && time ? `${date}T${time}` : "");
      if (!merged) continue;
      if (date && !scheduleSettings.allowWeekends && isWeekendDateString(date)) {
        setError(`${i} 件目: 土曜・日曜はこのサービスでは候補として指定できません。`);
        return;
      }
      const d = new Date(merged);
      if (Number.isNaN(d.valueOf())) {
        setError(`${i} 件目の日時が不正です。`);
        return;
      }
      if (d.getSeconds() !== 0 || d.getMinutes() % Math.max(1, scheduleSettings.slotDurationMinutes) !== 0) {
        setError(`候補は ${scheduleSettings.slotDurationMinutes} 分単位で入力してください。`);
        return;
      }
      starts.push(d.toISOString());
    }

    if (starts.length < 3 || starts.length > 5) {
      setError(`候補は3〜5件にしてください。（現在 ${starts.length} 件）`);
      return;
    }

    setProposeSubmitting(true);
    setError(null);
    setProposeJustSent(false);
    const res = await fetch(`/api/matches/${matchId}/negotiations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ starts, sessionNumber }),
    });
    const json = await res.json().catch(() => null);
    setProposeSubmitting(false);
    if (!res.ok) {
      setError(json?.error ?? "提案に失敗しました。");
      return;
    }
    // ✓ 送信完了表示 + 既入力をクリア（重複送信防止）
    form.reset();
    setProposeJustSent(true);
    setNotice("候補を提示しました（チャットに反映されました）。");
    window.setTimeout(() => setProposeJustSent(false), 6000);
    await load();
  }

  async function onChatVote(negotiationId: string, slotId: string, vote: "YES" | "NO") {
    const neg = negotiations.find((n) => n.id === negotiationId);
    if (!neg || neg.status !== "AWAITING_CLIENT_RESPONSE") return;
    if (
      me?.role !== "CLIENT" &&
      me?.role !== "CLIENT_ADMIN" &&
      me?.role !== "CLIENT_HR"
    )
      return;

    const votes: Record<string, "YES" | "NO"> = {};
    let allDecided = true;
    for (const s of neg.slots) {
      if (s.id === slotId) {
        votes[s.id] = vote;
      } else if (s.clientVote === "YES" || s.clientVote === "NO") {
        votes[s.id] = s.clientVote;
      } else {
        allDecided = false;
        break;
      }
    }
    if (!allDecided) {
      setNegotiations((prev) =>
        prev.map((n) =>
          n.id === negotiationId
            ? {
                ...n,
                slots: n.slots.map((s) => (s.id === slotId ? { ...s, clientVote: vote } : s)),
              }
            : n,
        ),
      );
      return;
    }
    setVoteSubmittingForSlot(slotId);
    const res = await fetch(`/api/matches/${matchId}/negotiations/${negotiationId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ votes }),
    });
    const json = await res.json().catch(() => null);
    setVoteSubmittingForSlot(null);
    if (!res.ok) {
      setError(json?.error ?? "回答送信に失敗しました。");
      return;
    }
    setNotice("回答を送信しました。");
    await load();
  }

  function isReschedulingSession(sessionNumber: number) {
    // 同じ session の最新 CONFIRMED に rescheduleRequestedAt があれば「再調整中」
    const sameSession = negotiations.filter((n) => Math.max(1, n.sessionNumber ?? 1) === sessionNumber);
    if (sameSession.length === 0) return false;
    const hasActive = sameSession.some(
      (n) => n.status !== "CONFIRMED" && n.status !== "SUPERSEDED",
    );
    if (hasActive) return true;
    const latestConfirmed = sameSession
      .filter((n) => n.status === "CONFIRMED")
      .sort((a, b) => b.round - a.round)[0];
    return Boolean(latestConfirmed?.rescheduleRequestedAt);
  }

  function getRescheduleEligibility(slot: SlotRow | null) {
    if (
      me?.role !== "PARTNER" &&
      me?.role !== "CLIENT" &&
      me?.role !== "CLIENT_ADMIN" &&
      me?.role !== "CLIENT_HR"
    )
      return { can: false, reason: "パートナー・クライアントのみ利用できます。" };
    if (activeNegotiation) return { can: false, reason: "調整中のラウンドがあるため、完了後に変更希望を送れます。" };
    if (!slot) return { can: false, reason: "未確定のため送信できません。" };
    const diff = msUntilStart(slot.startAt);
    if (!Number.isFinite(diff)) return { can: false, reason: "日時が不正のため送信できません。" };
    if (diff <= 0) return { can: false, reason: "開始後のため変更できません。" };
    if (diff <= 24 * 60 * 60 * 1000) return { can: false, reason: "開始24時間前を過ぎたため変更できません。" };
    return { can: true, reason: "" };
  }

  async function onRequestReschedule(sessionNumber: number) {
    setNotice(null);
    setError(null);
    setRescheduleSubmittingSession(sessionNumber);
    const res = await fetch(`/api/matches/${matchId}/reschedule-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionNumber }),
    });
    const json = await res.json().catch(() => null);
    setRescheduleSubmittingSession(null);
    if (!res.ok) {
      setError(json?.error ?? "変更希望の送信に失敗しました。");
      return;
    }
    setNotice(`第${sessionNumber}回の日程について変更希望を送信しました。相手に通知し、再調整を開始できます。`);
    await load();
  }

  if (!me) {
    return (
      <div className="px-6 py-10 text-sm text-slate-600">
        読込中…
      </div>
    );
  }

  return (
    <>
    <div className="mx-auto flex w-full max-w-none flex-1 flex-col gap-8 px-1 py-4 sm:gap-12 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4 sm:gap-4 sm:pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Match Detail</p>
          <p className="text-sm text-slate-600 sm:text-base">{withHonorificSan(me.displayName)} として表示中（メールなどは公開されません）</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
            {me.role === "ADMIN" || me.role === "ADMIN_ASSISTANT" ? (
              <>
                <span className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-800">MATCH #{matchId}</span>
                {scheduleSettings.effectiveCompanyId ? (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${
                      scheduleSettings.overriddenFields.length > 0
                        ? "bg-rose-50 text-rose-900"
                        : "bg-slate-100 text-slate-800"
                    }`}
                    title={
                      scheduleSettings.overriddenFields.length > 0
                        ? `この企業は次の項目を上書きしています: ${scheduleSettings.overriddenFields.join(", ")}`
                        : "この企業は全体設定をそのまま使っています"
                    }
                  >
                    設定:{" "}
                    {scheduleSettings.effectiveCompanyName ?? scheduleSettings.effectiveCompanyId}
                    {scheduleSettings.overriddenFields.length > 0 ? (
                      <span className="rounded-sm bg-rose-200/70 px-1 text-[10px] font-semibold text-rose-900">
                        上書きあり {scheduleSettings.overriddenFields.length}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-600">全体設定を使用</span>
                    )}
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                    設定: 全体（企業未割当）
                  </span>
                )}
                {scheduleSettings.effectiveCompanyId ? (
                  <Link
                    href={`/admin/companies/${encodeURIComponent(scheduleSettings.effectiveCompanyId)}/settings`}
                    title="管理者専用：この企業の設定編集ページへ"
                    className="inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-white px-2 py-1 text-[11px] font-semibold text-indigo-800 no-underline hover:bg-indigo-50"
                  >
                    ⚙ 設定を編集（管理者）
                  </Link>
                ) : null}
                {!scheduleSettings.effectiveCompanyId ? (
                  <Link
                    href="/admin/matches"
                    title="管理者専用：この match に紐づくクライアントの所属企業を割り当てる"
                    className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 no-underline hover:bg-amber-100"
                  >
                    ⚠ 所属企業を割り当てる（管理者）
                  </Link>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
          >
            再読込
          </button>
          <Link
            href="/dashboard"
            className="rounded-md border border-transparent px-3 py-1.5 text-sm text-indigo-800 underline-offset-4"
          >
            ← 一覧へ戻る
          </Link>
        </div>
      </header>

      {error ? <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="rounded-xl bg-indigo-50 px-4 py-2 text-sm text-indigo-900">{notice}</p> : null}

      {me.role === "PARTNER" ||
      me.role === "CLIENT" ||
      me.role === "CLIENT_ADMIN" ||
      me.role === "CLIENT_HR" ? (
        <MatchRoomGuideBanner
          userId={me.id}
          role={me.role}
          planFeatures={scheduleSettings.planFeatures}
          isCoachingPlan={scheduleSettings.companyPlan === "coaching_management_training"}
          onGoTab={(tab) => goTab(tab as MatchTab)}
        />
      ) : null}

      {/*
        「あなたの今の状態」バナー（クライアント / パートナーのみ）。
        - チャット・日程・1on1 タブを行き来しなくても、画面上部 1 行で
          「次にやる用事 / 待ち状態 / 直近セッションのリマインダ」が分かる。
        - severity に応じて色を変える (info: 青 / todo: 紫 / warn: 琥珀)。
        - 押下で該当タブにジャンプ。
      */}
      {(() => {
        const banner = computeMatchBanner({
          meRole: me.role,
          negotiations,
          sessionRows,
          totalSessions: scheduleSettings.totalSessions,
          now: new Date(),
        });
        if (!banner) return null;
        const palette =
          banner.severity === "warn"
            ? "border-amber-300 bg-amber-50 text-amber-950"
            : banner.severity === "todo"
              ? "border-indigo-300 bg-indigo-50 text-indigo-950"
              : "border-emerald-300 bg-emerald-50 text-emerald-950";
        const buttonClass =
          banner.severity === "warn"
            ? "app-btn-amber"
            : banner.severity === "todo"
              ? "app-btn-primary"
              : "app-btn-emerald";
        return (
          <div
            className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-sm ${palette}`}
          >
            <p className="min-w-0 break-words text-sm font-semibold sm:text-base">
              {banner.message}
            </p>
            {banner.ctaLabel && banner.ctaTab ? (
              <button
                type="button"
                onClick={() => {
                  goTab(banner.ctaTab!);
                  if (banner.scrollToId) {
                    window.setTimeout(() => {
                      document
                        .getElementById(banner.scrollToId!)
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }, 80);
                  }
                }}
                className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold no-underline ${buttonClass}`}
              >
                {banner.ctaLabel}
              </button>
            ) : null}
          </div>
        );
      })()}

      {availability ? (
        <section className="app-surface-emerald rounded-2xl px-5 py-4">
          <h2 className="text-lg font-semibold text-emerald-900">お互いの対応可能時間</h2>
          <p className="mt-1 text-sm text-emerald-900/80">
            アサイン用に登録された参考情報です。実際の日程はチャット下の「日程調整」で個別調整してください。
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="app-surface-inset-emerald px-4 py-3">
              <p className="text-sm font-semibold text-emerald-900">クライアント：{withHonorificSan(availability.client.displayName)}</p>
              {availability.client.labels.length === 0 ? (
                <p className="mt-1.5 text-sm text-slate-500">未設定</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {availability.client.labels.map((label, i) => (
                    <li
                      key={`c-${i}`}
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-sm text-emerald-900"
                    >
                      {label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="app-surface-inset-emerald px-4 py-3">
              <p className="text-sm font-semibold text-emerald-900">パートナー：{withHonorificSan(availability.partner.displayName)}</p>
              {availability.partner.labels.length === 0 ? (
                <p className="mt-1.5 text-sm text-slate-500">未設定</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {availability.partner.labels.map((label, i) => (
                    <li
                      key={`p-${i}`}
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-sm text-emerald-900"
                    >
                      {label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <div className="flex flex-col gap-0">
        <nav
          className="sticky top-0 z-20 -mx-1 border-b border-slate-200 bg-slate-50/95 px-1 pt-1 backdrop-blur-sm sm:static sm:mx-0 sm:border sm:border-b-0 sm:border-slate-200 sm:bg-slate-100 sm:px-2 sm:pt-2 sm:backdrop-blur-none rounded-t-xl"
          aria-label="ルームメニュー"
          role="tablist"
        >
          <div className="flex flex-nowrap items-end gap-1 overflow-x-auto pb-0 sm:gap-1.5">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "overview"}
              onClick={() => goTab("overview")}
              className={`shrink-0 rounded-t-lg px-3.5 py-2.5 text-base font-semibold transition sm:px-4 ${
                activeTab === "overview"
                  ? "relative z-[1] -mb-px border border-slate-200 border-b-white bg-white text-indigo-950 shadow-sm"
                  : "border border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900"
              }`}
            >
              プロジェクト概要
            </button>
            {scheduleSettings.planFeatures.clientInfo && (me.role === "PARTNER" || me.role === "ADMIN") ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "clientInfo"}
                onClick={() => goTab("clientInfo")}
                className={`shrink-0 rounded-t-lg px-3.5 py-2.5 text-base font-semibold transition sm:px-4 ${
                  activeTab === "clientInfo"
                    ? "relative z-[1] -mb-px border border-slate-200 border-b-white bg-white text-indigo-950 shadow-sm"
                    : "border border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900"
                }`}
              >
                クライアント情報
              </button>
            ) : null}
            {scheduleSettings.planFeatures.chat ? (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "chat"}
              onClick={() => goTab("chat")}
              className={`relative shrink-0 rounded-t-lg px-3.5 py-2.5 text-base font-semibold transition sm:px-4 ${
                activeTab === "chat"
                  ? "relative z-[1] -mb-px border border-slate-200 border-b-white bg-white text-indigo-950 shadow-sm"
                  : "border border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900"
              }`}
            >
              チャット
              {unreadChatCount > 0 ? (
                <span className="ml-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1.5 align-middle text-xs font-bold text-white">
                  {unreadChatCount > 99 ? "99+" : unreadChatCount}
                </span>
              ) : null}
            </button>
            ) : null}
            {scheduleSettings.planFeatures.schedule ? (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "schedule"}
              onClick={() => goTab("schedule")}
              className={`shrink-0 rounded-t-lg px-3.5 py-2.5 text-base font-semibold transition sm:px-4 ${
                activeTab === "schedule"
                  ? "relative z-[1] -mb-px border border-slate-200 border-b-white bg-white text-indigo-950 shadow-sm"
                  : "border border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900"
              }`}
            >
              日程調整
            </button>
            ) : null}
            {scheduleSettings.planFeatures.sessions ? (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "sessions"}
              onClick={() => goTab("sessions")}
              className={`shrink-0 rounded-t-lg px-3.5 py-2.5 text-base font-semibold transition sm:px-4 ${
                activeTab === "sessions"
                  ? "relative z-[1] -mb-px border border-slate-200 border-b-white bg-white text-indigo-950 shadow-sm"
                  : "border border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900"
              }`}
            >
              1on1セッション
            </button>
            ) : null}
            {scheduleSettings.planFeatures.skillCheck ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "skillCheck"}
                onClick={() => goTab("skillCheck")}
                className={`shrink-0 rounded-t-lg px-3.5 py-2.5 text-base font-semibold transition sm:px-4 ${
                  activeTab === "skillCheck"
                    ? "relative z-[1] -mb-px border border-slate-200 border-b-white bg-white text-indigo-950 shadow-sm"
                    : "border border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900"
                }`}
              >
                スキルチェック
              </button>
            ) : null}
            {scheduleSettings.planFeatures.lifelineChart ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "lifelineChart"}
                onClick={() => goTab("lifelineChart")}
                className={`shrink-0 rounded-t-lg px-3.5 py-2.5 text-base font-semibold transition sm:px-4 ${
                  activeTab === "lifelineChart"
                    ? "relative z-[1] -mb-px border border-slate-200 border-b-white bg-white text-indigo-950 shadow-sm"
                    : "border border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900"
                }`}
              >
                ライフライン
              </button>
            ) : null}
            {me && canShowFtaTab(me, scheduleSettings) ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "fta"}
                onClick={() => goTab("fta")}
                className={`shrink-0 rounded-t-lg px-3.5 py-2.5 text-base font-semibold transition sm:px-4 ${
                  activeTab === "fta"
                    ? "relative z-[1] -mb-px border border-slate-200 border-b-white bg-white text-indigo-950 shadow-sm"
                    : "border border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900"
                }`}
              >
                {ftaTabLabel(me, scheduleSettings)}
              </button>
            ) : null}
            {scheduleSettings.planFeatures.pdca ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "pdca"}
                onClick={() => goTab("pdca")}
                className={`shrink-0 rounded-t-lg px-3.5 py-2.5 text-base font-semibold transition sm:px-4 ${
                  activeTab === "pdca"
                    ? "relative z-[1] -mb-px border border-slate-200 border-b-white bg-white text-indigo-950 shadow-sm"
                    : "border border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900"
                }`}
              >
                PDCA
              </button>
            ) : null}
            {scheduleSettings.planFeatures.reflection ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "reflection"}
                onClick={() => goTab("reflection")}
                className={`shrink-0 rounded-t-lg px-3.5 py-2.5 text-base font-semibold transition sm:px-4 ${
                  activeTab === "reflection"
                    ? "relative z-[1] -mb-px border border-slate-200 border-b-white bg-white text-indigo-950 shadow-sm"
                    : "border border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900"
                }`}
              >
                振り返り
              </button>
            ) : null}
            {scheduleSettings.planFeatures.summaryReport &&
            (me.role === "ADMIN" || me.role === "ADMIN_ASSISTANT" || me.role === "PARTNER") ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "summaryReport"}
                onClick={() => goTab("summaryReport")}
                className={`shrink-0 rounded-t-lg px-3.5 py-2.5 text-base font-semibold transition sm:px-4 ${
                  activeTab === "summaryReport"
                    ? "relative z-[1] -mb-px border border-slate-200 border-b-white bg-white text-indigo-950 shadow-sm"
                    : "border border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900"
                }`}
              >
                総括レポート
              </button>
            ) : null}
            {scheduleSettings.planFeatures.coachingIcebreaker ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "coachingIcebreaker"}
                onClick={() => goTab("coachingIcebreaker")}
                className={`shrink-0 rounded-t-lg px-3.5 py-2.5 text-base font-semibold transition sm:px-4 ${
                  activeTab === "coachingIcebreaker"
                    ? "relative z-[1] -mb-px border border-slate-200 border-b-white bg-white text-indigo-950 shadow-sm"
                    : "border border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900"
                }`}
              >
                アイスブレイク
              </button>
            ) : null}
            {scheduleSettings.planFeatures.coachingQuestions ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "coachingQuestions"}
                onClick={() => goTab("coachingQuestions")}
                className={`shrink-0 rounded-t-lg px-3.5 py-2.5 text-base font-semibold transition sm:px-4 ${
                  activeTab === "coachingQuestions"
                    ? "relative z-[1] -mb-px border border-slate-200 border-b-white bg-white text-indigo-950 shadow-sm"
                    : "border border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900"
                }`}
              >
                質問リスト
              </button>
            ) : null}
            {scheduleSettings.planFeatures.coachingOneOnOneFormat ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "coachingOneOnOneFormat"}
                onClick={() => goTab("coachingOneOnOneFormat")}
                className={`shrink-0 rounded-t-lg px-3.5 py-2.5 text-base font-semibold transition sm:px-4 ${
                  activeTab === "coachingOneOnOneFormat"
                    ? "relative z-[1] -mb-px border border-slate-200 border-b-white bg-white text-indigo-950 shadow-sm"
                    : "border border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900"
                }`}
              >
                1on1フォーマット
              </button>
            ) : null}
          </div>
        </nav>

        <div className="-mx-1 rounded-b-xl border border-slate-200 border-t-0 bg-white px-4 py-6 shadow-sm sm:mx-0 sm:rounded-b-xl sm:rounded-tr-xl sm:px-8 sm:py-8 min-h-[min(50vh,28rem)]">
      {activeTab === "overview" ? (
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-slate-900">プロジェクト概要</h2>
          {scheduleSettings.planFeatures.planComingSoon ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              この企業は「{companyPlanLabel(scheduleSettings.companyPlan)}」です。機能詳細は準備中のため、現時点では概要とチャットのみご利用いただけます。
            </p>
          ) : null}
          {(me.role === "ADMIN" || me.role === "ADMIN_ASSISTANT") && !scheduleSettings.planFeatures.planComingSoon ? (
            <p className="text-sm text-slate-600">
              設定されたプロジェクト概要を、閲覧者の区分に応じて表示します（未入力時はメンバー向けには控えめな案内のみ表示されます）。
            </p>
          ) : null}
          {overviewLoading ? (
            <p className="text-sm text-slate-500">読込中…</p>
          ) : (
            (() => {
              const j = projectOverviewJson as Record<string, unknown> | null;
              if (!j || typeof j !== "object") {
                return (
                  <p className="text-sm text-slate-500">
                    {me.role === "ADMIN" || me.role === "ADMIN_ASSISTANT"
                      ? "表示する情報がありません。"
                      : "ただいま表示できる概要がありません。"}
                  </p>
                );
              }
              const isAdminView = me.role === "ADMIN" || me.role === "ADMIN_ASSISTANT";
              if (j.viewer === "partner") {
                return renderPartnerOverview(
                  (j.overview as PartnerOverviewRow | null) ?? null,
                  { showAdminHint: isAdminView },
                );
              }
              if (j.viewer === "client") {
                return renderClientOverview(
                  (j.overview as ClientOverviewRow | null) ?? null,
                  { showAdminHint: isAdminView },
                );
              }
              if (j.viewer === "admin") {
                return (
                  <div className="space-y-8">
                    <div>
                      <h3 className="text-lg font-semibold text-indigo-900">パートナー向け（閲覧）</h3>
                      <div className="mt-3">
                        {renderPartnerOverview(
                          (j.partnerOverview as PartnerOverviewRow | null) ?? null,
                          { showAdminHint: true },
                        )}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-emerald-900">クライアント向け（閲覧）</h3>
                      <div className="mt-3">
                        {renderClientOverview(
                          (j.clientOverview as ClientOverviewRow | null) ?? null,
                          { showAdminHint: true },
                        )}
                      </div>
                    </div>
                  </div>
                );
              }
              return <p className="text-sm text-red-600">表示できませんでした。</p>;
            })()
          )}
        </section>
      ) : null}

      {activeTab === "clientInfo" && (me.role === "PARTNER" || me.role === "ADMIN") ? (
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-slate-900">クライアント情報</h2>
          <p className="text-sm text-slate-600">
            {me.role === "ADMIN"
              ? "パートナーがマッチルームで参照する内容と同じです（閲覧のみ）。"
              : "担当クライアントの属性です。このタブの内容は、当該マッチにおけるあなた（パートナー）のみがご覧いただけます。"}
          </p>
          {clientBriefingLoading ? (
            <p className="text-sm text-slate-500">読込中…</p>
          ) : clientPartnerBriefing ? (
            <div className="grid gap-3 sm:max-w-xl">
              {fieldBlock("所属企業", clientPartnerBriefing.companyName)}
              {fieldBlock("名前", withHonorificSan(clientPartnerBriefing.clientDisplayName))}
              {fieldBlock(
                "役職",
                clientPartnerBriefing.jobTitle && clientPartnerBriefing.jobTitle.trim() !== ""
                  ? clientPartnerBriefing.jobTitle
                  : "",
              )}
              {fieldBlock(
                "年齢",
                clientPartnerBriefing.age !== null ? `${clientPartnerBriefing.age}歳` : "",
              )}
              {fieldBlock(
                "管理職",
                formatManagementForDisplay(clientPartnerBriefing.isManagement),
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">現在この情報は表示できません。</p>
          )}
        </section>
      ) : null}

      {activeTab === "chat" && !chatFullscreen ? (
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">チャット</h2>
              <p className="mt-1 text-sm text-slate-500">
                全画面で読みやすくする場合は「全画面表示」から。終了は Esc または「閉じる」です。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setChatFullscreen(true)}
                className="app-btn-primary rounded-lg px-3 py-2 text-sm font-semibold sm:text-base"
              >
                全画面表示
              </button>
            </div>
          </div>
          <ChatScheduleHints role={me.role} />
          <ChatMessageThread
            messages={messages}
            me={me}
            chatLastReadAt={chatLastReadAt}
            negotiations={negotiations}
            activeNegotiation={activeNegotiation}
            onChatVote={onChatVote}
            voteSubmittingForSlot={voteSubmittingForSlot}
            navigateToTab={goTab}
            scrollClassName="max-h-[min(44rem,calc(100vh-14rem))]"
          />
          <form onSubmit={onSendChat} className="app-surface-raised flex flex-col gap-3 rounded-2xl p-4">
            <label className="text-base font-medium">
              {chatSendFormLabel(me.role)}
              <textarea
                name="body"
                rows={3}
                placeholder="補足・メモなど（任意）"
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base"
              />
            </label>
            <button
              type="submit"
              className="app-btn-primary self-start rounded-lg px-4 py-2.5 text-base"
            >
              送信
            </button>
          </form>
          {me.role === "PARTNER" ? <PartnerChatTemplates /> : null}
        </section>
      ) : null}

      {activeTab === "schedule" ? (
      <section id="schedule" className="space-y-6 rounded-3xl border border-indigo-100 bg-indigo-50/40 px-3 py-5 shadow-inner shadow-indigo-100 sm:px-6 sm:py-8">
        <div className="space-y-3">
          {(me.role === "PARTNER" || me.role === "ADMIN" || me.role === "ADMIN_ASSISTANT") ? (
            <details className="app-surface-indigo rounded-2xl px-4 py-3 transition open:shadow-md">
              <summary className="cursor-pointer text-base font-semibold text-indigo-950">
                パートナー向け：日程調整機能の使い方（最初にお読みください）
              </summary>
              <ScheduleRulesDetail
                audience="partner"
                className="mt-3 pr-1"
                scrollClassName="max-h-[min(70vh,28rem)] overflow-y-auto overflow-x-hidden"
              />
            </details>
          ) : null}
          {(me.role === "CLIENT" || me.role === "CLIENT_ADMIN" || me.role === "CLIENT_HR" || me.role === "ADMIN" || me.role === "ADMIN_ASSISTANT") ? (
            <details className="app-surface-indigo rounded-2xl px-4 py-3 transition open:shadow-md">
              <summary className="cursor-pointer text-base font-semibold text-indigo-950">
                クライアント向け：日程調整機能の使い方（最初にお読みください）
              </summary>
              <ScheduleRulesDetail
                audience="client"
                className="mt-3 pr-1"
                scrollClassName="max-h-[min(70vh,28rem)] overflow-y-auto overflow-x-hidden"
              />
            </details>
          ) : null}
        </div>
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-indigo-900">日程調整</h2>
          <p className="text-base text-indigo-800">
            ○／×モデルでの候補提示 → 回答 → （必要なら再提案） → 確定。この画面で状態を確認します。
          </p>
        </div>
        <div className="app-surface-indigo space-y-3 rounded-2xl px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-indigo-900">セッション計画（全 {scheduleSettings.totalSessions} 回）</h3>
          </div>
          <ul className="space-y-2 text-base">
            {sessionPlans.map((row) => {
              const eligibility = getRescheduleEligibility(row.slot);
              const apiRow = sessionRows.find((r) => r.sessionNumber === row.index);
              const isRescheduling = isReschedulingSession(row.index);
              const zoomUrl = apiRow?.zoomUrl ?? null;
              const zoomMeetingId = apiRow?.zoomMeetingId ?? null;
              const zoomPass = apiRow?.zoomPass ?? null;
              const abandonment = apiRow?.abandonment ?? null;
              const now = Date.now();
              const endMs = row.slot ? new Date(row.slot.endAt).getTime() : null;
              const isPast = endMs !== null && endMs <= now;
              const statusBadge: { label: string; className: string } | null = abandonment
                ? { label: "未実施・消化", className: "border-red-300 bg-red-50 text-red-800" }
                : !row.slot
                  ? { label: "未確定", className: "border-slate-300 bg-white text-slate-700" }
                  : isPast
                    ? { label: "実施済", className: "border-emerald-300 bg-emerald-50 text-emerald-800" }
                    : { label: "予定", className: "border-indigo-300 bg-indigo-50 text-indigo-800" };
              return (
                <li key={row.index} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {statusBadge ? (
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${statusBadge.className}`}
                        >
                          {statusBadge.label}
                        </span>
                      ) : null}
                      <span>
                        {row.index}回目の日程：
                        {row.slot
                          ? `${formatJa(row.slot.startAt, scheduleSettings.timezone)} 〜 ${formatJa(row.slot.endAt, scheduleSettings.timezone)}`
                          : "未確定"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/match/${matchId}/sessions/${row.index}`}
                        className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-900 no-underline shadow-sm transition hover:bg-indigo-100"
                      >
                        {scheduleSettings.companyPlan === "coaching_management_training"
                          ? "ロールプレイ評価を開く"
                          : me.role === "CLIENT" || me.role === "CLIENT_ADMIN" || me.role === "CLIENT_HR"
                            ? "振り返りを開く"
                            : me.role === "PARTNER"
                              ? "レポートを開く"
                              : "詳細を開く"}
                      </Link>
                      {isRescheduling ? (
                        <span className="rounded-md border border-amber-300 bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-900">
                          再調整中
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={!eligibility.can || rescheduleSubmittingSession !== null}
                          onClick={() => void onRequestReschedule(row.index)}
                          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100 active:translate-y-[1px] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {rescheduleSubmittingSession === row.index ? "送信中…" : "変更希望"}
                        </button>
                      )}
                    </div>
                  </div>
                  {(zoomUrl || zoomMeetingId || zoomPass) ? (
                    <p className="mt-1 text-xs text-slate-700">
                      {zoomUrl ? (
                        <a
                          href={zoomUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-700 underline underline-offset-2"
                        >
                          Zoom: {zoomUrl}
                        </a>
                      ) : null}
                      {zoomMeetingId ? <span className="ml-2">ID: {zoomMeetingId}</span> : null}
                      {zoomPass ? <span className="ml-2">パス: {zoomPass}</span> : null}
                    </p>
                  ) : null}
                  {!eligibility.can && !isRescheduling ? (
                    <p className="mt-1 text-sm font-medium text-amber-800">
                      この日程は変更不可: {eligibility.reason}（日程変更は開始24時間前まで可能です）
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="text-sm text-slate-600">日程変更は開始24時間前まで可能です。変更希望を送ると、相手へ通知され、パートナーが再提案できます。</p>
          <p className="text-sm font-medium text-amber-800">開始24時間前を過ぎての変更はできません。体調不良などの場合は、サポートデスクに連絡ください。</p>
        </div>

        {me.role === "PARTNER" ? (
          <form onSubmit={onPropose} className="space-y-5 rounded-2xl border border-slate-200 bg-white px-5 py-4">
            {proposeJustSent ? (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
                ✓ 送信完了：候補をクライアントに通知しました。フォームはクリアされています。
              </div>
            ) : null}
            <div>
              <h3 className="text-xl font-semibold">候補日を送る（開始時刻のみ・3〜5 件）</h3>
              <p className="mt-1 text-xs text-slate-600">
                選択可能な時間帯：{String(scheduleSettings.slotEarliestHour).padStart(2, "0")}:00〜{String(scheduleSettings.slotLatestHour).padStart(2, "0")}:00
                {scheduleSettings.allowWeekends ? "（土日も可）" : "（土日不可）"}
              </p>
              <label className="mt-3 block max-w-xs text-base font-medium text-slate-800">
                何回目の日程調整か
                <select
                  name="sessionNumber"
                  defaultValue={1}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-base"
                >
                  {Array.from({ length: Math.max(1, scheduleSettings.totalSessions) }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} 回目
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-1 text-base text-slate-600">
                終了時刻は、ご利用いただける1回あたりの枠の長さ（現在{" "}
                <strong className="text-indigo-800">{scheduleSettings.slotDurationMinutes} 分</strong>
                、タイムゾーン {scheduleSettings.timezone}）に応じて自動で付きます。
              </p>
              <p className="mt-1 text-sm text-slate-500">開始時刻は{scheduleSettings.slotDurationMinutes}分単位で選んでください。</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3].map((index) => (
                <fieldset key={index} className="space-y-2 rounded-xl border border-dashed border-slate-300 p-4">
                  <legend className="text-sm font-medium">候補 {index}</legend>
                  <label className="block text-xs uppercase text-slate-500">
                    日付
                    <input
                      name={`startDate${index}`}
                      type="date"
                      required
                      onChange={onProposeDateInputChange}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1"
                    />
                  </label>
                  <label className="block text-xs uppercase text-slate-500">
                    時刻（{scheduleSettings.slotDurationMinutes}分刻み）
                    <select
                      name={`startTime${index}`}
                      required
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1"
                    >
                      <option value="">選択してください</option>
                      {timeOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </fieldset>
              ))}
              <fieldset className="space-y-2 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 md:col-span-2">
                <legend className="text-sm font-medium text-slate-700">4〜5件目は任意（未入力でも可）</legend>
                <div className="grid gap-3 md:grid-cols-2">
                  {[4, 5].map((index) => (
                    <div key={index} className="space-y-2 rounded-lg border border-slate-100 p-3">
                      <p className="text-xs font-semibold uppercase text-slate-500">任意 {index}</p>
                      <input
                        name={`startDate${index}`}
                        type="date"
                        onChange={onProposeDateInputChange}
                        className="w-full rounded-md border border-slate-300 px-2 py-1"
                      />
                      <select
                        name={`startTime${index}`}
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1"
                      >
                        <option value="">時刻を選択</option>
                        {timeOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </fieldset>
            </div>
            <div className="space-y-2">
              <button
                type="submit"
                disabled={proposeSubmitting}
                className="app-btn-primary rounded-lg px-4 py-2.5 text-base disabled:cursor-not-allowed"
              >
                {proposeSubmitting ? "送信中…" : "候補日を送る（3〜5 件）"}
              </button>
              {/* このボタンを押したあとに何が起こるかを明示。実行前に挙動が見える方が安心。 */}
              <p className="text-xs text-slate-500">
                → クライアントにメールとアプリ通知が届き、◯× の回答待ちになります。
              </p>
            </div>
          </form>
        ) : null}

        {activeNegotiation?.status === "NEEDS_NEW_PROPOSAL" && me.role === "PARTNER" ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            クライアントが全候補に「×」でした。上のフォームから、新しい時間帯セットを再提案してください。
          </div>
        ) : null}

        {activeNegotiation && activeNegotiation.status === "AWAITING_CLIENT_RESPONSE" && isClientRole(me.role) ? (
          <form
            id="client-schedule-vote"
            onSubmit={onVote}
            className="app-surface-indigo scroll-mt-24 space-y-4 rounded-2xl px-5 py-4"
          >
            <h3 className="text-xl font-semibold text-indigo-900">ご希望の時間をすべて回答</h3>
            <p className="text-base text-indigo-800">参加できる候補は「○」。どれにも入れられないときはすべて「×」を選んでください。</p>
            <div className="space-y-3">
              {activeNegotiation.slots.map((slot) => (
                <div key={slot.id} className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2">
                  <p className="text-sm font-medium text-indigo-900">
                    {formatJa(slot.startAt, scheduleSettings.timezone)}〜
                    {formatJa(slot.endAt, scheduleSettings.timezone)}
                  </p>
                  <div className="mt-2 flex gap-4 text-sm">
                    <label className="flex items-center gap-1">
                      <input type="radio" name={`vote:${slot.id}`} value="YES" required />○ 参加できる
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="radio" name={`vote:${slot.id}`} value="NO" required />× むり
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <button
                type="submit"
                className="app-btn-primary rounded-lg px-4 py-2.5 text-base"
              >
                回答を送信する
              </button>
              <p className="text-xs text-slate-500">
                → パートナーに回答内容が通知されます。すべて × の場合は新しい候補が届きます。
              </p>
            </div>
          </form>
        ) : null}

        {activeNegotiation && activeNegotiation.status === "AWAITING_PARTNER_CONFIRM" && me.role === "PARTNER" ? (
          <form
            id="partner-confirm-section"
            onSubmit={onConfirm}
            className="space-y-3 rounded-2xl border border-amber-200 bg-white px-5 py-4"
          >
            <h3 className="text-xl font-semibold text-amber-900">日程を決定する</h3>
            <p className="text-base text-amber-800">
              「○」が複数ある場合は、ご希望時間をひとつ選んで決定してください。
            </p>
            <select
              name="slotId"
              required
              defaultValue=""
              className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-amber-900"
            >
              <option disabled value="">
                時間を選択
              </option>
              {activeNegotiation.slots
                .filter((s) => s.clientVote === "YES")
                .map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {formatJa(slot.startAt, scheduleSettings.timezone)} 〜{" "}
                    {formatJa(slot.endAt, scheduleSettings.timezone)}
                  </option>
                ))}
            </select>
            <div className="space-y-2">
              <button
                type="submit"
                className="app-btn-amber rounded-lg px-4 py-2.5 text-base"
              >
                この日に決定する
              </button>
              <p className="text-xs text-amber-900/80">
                → 双方に Zoom 入りの確定メールが届きます。確定後の変更は「日程変更依頼」から。
              </p>
            </div>
          </form>
        ) : null}

        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-900">すべての調整ログ</h3>
          <ul className="space-y-4">
            {negotiations.map((neg) => (
              <li key={neg.id} className="app-surface-raised rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {Math.max(1, neg.sessionNumber ?? 1)}回目 / Round #{neg.round} — {statusLabel[neg.status]}
                  </p>
                  <span className="text-xs uppercase tracking-wide text-slate-400">ID {neg.id}</span>
                </div>
                <table className="mt-4 w-full text-left text-xs text-slate-600">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide">
                      <th className="py-2 pr-2 font-medium">開始</th>
                      <th className="py-2 pr-2 font-medium">終了</th>
                      <th className="py-2 pr-2 font-medium">回答</th>
                      <th className="py-2 font-medium">確定</th>
                    </tr>
                  </thead>
                  <tbody>
                    {neg.slots.map((slot) => (
                      <tr key={slot.id} className="border-t border-slate-50">
                        <td className="py-2 pr-2">
                          {formatJa(slot.startAt, scheduleSettings.timezone)}
                        </td>
                        <td className="py-2 pr-2">
                          {formatJa(slot.endAt, scheduleSettings.timezone)}
                        </td>
                        <td className="py-2 pr-2">
                          {!slot.clientVote ? "—" : slot.clientVote === "YES" ? "○ YES" : "× NO"}
                        </td>
                        <td className="py-2">{slot.isConfirmed ? "★" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </li>
            ))}
          </ul>
          {negotiations.length === 0 ? (
            <p className="text-sm text-slate-600">調整ログはありません。</p>
          ) : null}
        </div>
      </section>
      ) : null}

      {activeTab === "fta" && me && canShowFtaTab(me, scheduleSettings) ? (
        me.role === "CLIENT" && scheduleSettings.companyPlan === "individual_companion" ? (
          <section className="space-y-4 rounded-3xl border border-indigo-100 bg-indigo-50/30 px-3 py-5 sm:px-6 sm:py-8">
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold text-indigo-900">自分FTA</h2>
              <p className="text-base text-indigo-800">
                中心のありたい姿(A)から要素(B)・アクション(C)を整理します。スキルチェックで選んだ重点スキルと紐づけできます。
              </p>
            </div>
            <FtaEditor
              chart={myFtaChart}
              onChange={(next) => {
                setMyFtaChart(next);
                setMyFtaDirty(true);
                setMyFtaMsg(null);
              }}
              focusSkillOptions={ftaFocusSkillOptions}
            />
            <div className="flex flex-wrap items-center gap-3">
              {myFtaMsg ? <span className="text-sm text-slate-600">{myFtaMsg}</span> : null}
              {myFtaDirty ? (
                <span className="text-xs text-amber-700">未保存の変更があります（2秒後に自動保存）</span>
              ) : null}
              {myFtaSaving ? <span className="text-xs text-slate-500">保存中…</span> : null}
            </div>
            <div className="rounded-xl border border-indigo-200 bg-white p-4">
              <h3 className="text-base font-semibold text-indigo-950">プレビュー</h3>
              <div className="mt-3">
                <FtaViewer chart={myFtaChart} />
              </div>
            </div>
          </section>
        ) : (
        <section className="space-y-4 rounded-3xl border border-emerald-100 bg-emerald-50/35 px-3 py-5 sm:px-6 sm:py-8">
          <h2 className="text-2xl font-semibold text-emerald-900">クライアントの自分FTA</h2>
          {clientFta?.targetRole === "CLIENT" && clientFta.chart ? (
            <div className="space-y-3 rounded-2xl border border-emerald-200 bg-white px-5 py-4">
              <h3 className="text-xl font-semibold text-emerald-900">{withHonorificSan(clientFta.targetName)}の自分FTA</h3>
              <p className="text-base text-emerald-800">鍵マークの項目は非公開です。</p>
              <FtaViewer chart={clientFta.chart as FtaChart} />
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-emerald-200 bg-white px-4 py-6 text-base text-emerald-800">
              まだ表示できる自分FTAがありません。
            </p>
          )}
        </section>
        )
      ) : null}

      {activeTab === "sessions" ? (
        <section className="space-y-4 rounded-3xl border border-indigo-100 bg-indigo-50/30 px-3 py-5 sm:px-6 sm:py-8">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold text-indigo-900">1on1セッション</h2>
            <p className="text-base text-indigo-800">
              セッション計画（全 {scheduleSettings.totalSessions} 回）。各回をタップすると、その回の
              {scheduleSettings.companyPlan === "coaching_management_training"
                ? "ロールプレイ評価"
                : me.role === "CLIENT" || me.role === "CLIENT_ADMIN" || me.role === "CLIENT_HR"
                  ? "振り返りフォーム"
                  : me.role === "PARTNER"
                    ? "レポート"
                    : "クライアント振り返り＆パートナーレポート"}
              を開けます。
              <br />
              <span className="text-sm">
                未来の回は開けません。直近で実施予定の回だけ、セッション中に開くことができます。
              </span>
            </p>
          </div>
          <ul className="space-y-2 rounded-2xl border border-indigo-200 bg-white p-3 sm:p-4">
            {(sessionRows.length > 0
              ? sessionRows
              : Array.from({ length: scheduleSettings.totalSessions }, (_, i) => ({
                  matchId,
                  sessionNumber: i + 1,
                  confirmed: false,
                  round: null,
                  startAt: null,
                  endAt: null,
                  negotiationId: null,
                  openable: false,
                  hasClientFeedback: false,
                  hasPartnerReport: false,
                } as SessionPlanApiRow))
            ).map((row) => {
              const dateLabel = row.startAt && row.endAt
                ? `${formatJa(row.startAt, scheduleSettings.timezone)} 〜 ${formatJa(row.endAt, scheduleSettings.timezone)}`
                : "未確定";
              const isAbandoned = !!row.abandonment;
              const isRescheduling = isReschedulingSession(row.sessionNumber);
              const showAbandonReasonToClient =
                isAbandoned &&
                (me.role === "PARTNER" || me.role === "ADMIN" || me.role === "ADMIN_ASSISTANT");
              const abandonReasonLabel =
                showAbandonReasonToClient && row.abandonment
                  ? row.abandonment.reason === "no_show"
                    ? "クライアントが連絡なく参加しなかった"
                    : "クライアントが24時間前を過ぎてキャンセルした"
                  : null;
              const filledBadges: string[] = [];
              if (!isAbandoned) {
                const coachingPlan = scheduleSettings.companyPlan === "coaching_management_training";
                if (me.role === "CLIENT" || me.role === "CLIENT_ADMIN" || me.role === "CLIENT_HR" || me.role === "ADMIN" || me.role === "ADMIN_ASSISTANT") {
                  filledBadges.push(
                    row.hasClientFeedback
                      ? coachingPlan ? "自己評価済" : "クライアント振り返り済"
                      : coachingPlan ? "自己評価未入力" : "クライアント未提出",
                  );
                }
                if (me.role === "PARTNER" || me.role === "ADMIN" || me.role === "ADMIN_ASSISTANT") {
                  filledBadges.push(
                    row.hasPartnerReport
                      ? coachingPlan ? "パートナー評価済" : "パートナーレポート済"
                      : coachingPlan ? "パートナー評価未入力" : "パートナー未提出",
                  );
                }
              }
              return (
                <li
                  key={row.sessionNumber}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                    isAbandoned
                      ? "border-red-200 bg-red-50/60"
                      : "border-indigo-100 bg-indigo-50/40"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-indigo-950">
                      {row.sessionNumber}回目
                      <span className="ml-2 text-sm font-normal text-indigo-900/85">{dateLabel}</span>
                      {isAbandoned ? (
                        <span className="ml-2 inline-flex items-center rounded-md border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800 align-middle">
                          未実施・消化
                        </span>
                      ) : isRescheduling ? (
                        <span className="ml-2 inline-flex items-center rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 align-middle">
                          再調整中
                        </span>
                      ) : null}
                    </p>
                    {isAbandoned && abandonReasonLabel ? (
                      <p className="mt-1 text-xs text-red-800">理由：{abandonReasonLabel}</p>
                    ) : null}
                    {!isAbandoned && (row.zoomUrl || row.zoomMeetingId || row.zoomPass) ? (
                      <p className="mt-1 text-xs text-indigo-900/85">
                        {row.zoomUrl ? (
                          <a
                            href={row.zoomUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-800 underline underline-offset-2"
                          >
                            Zoom: {row.zoomUrl}
                          </a>
                        ) : null}
                        {row.zoomMeetingId ? <span className="ml-2">ID: {row.zoomMeetingId}</span> : null}
                        {row.zoomPass ? <span className="ml-2">パス: {row.zoomPass}</span> : null}
                      </p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                      {filledBadges.map((b, i) => (
                        <span
                          key={i}
                          className={`rounded-full border px-2 py-0.5 ${b.endsWith("済") ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-600"}`}
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {row.openable ? (
                      <Link
                        href={`/match/${matchId}/sessions/${row.sessionNumber}`}
                        className="app-btn-primary rounded-md px-3 py-1.5 text-sm no-underline"
                      >
                        開く
                      </Link>
                    ) : (
                      <span className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-500">
                        まだ開けません
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {activeTab === "skillCheck" && scheduleSettings.planFeatures.skillCheck ? (
        <SkillCheckPanel matchId={matchId} />
      ) : null}

      {activeTab === "pdca" && scheduleSettings.planFeatures.pdca ? (
        <PdcaPanel matchId={matchId} />
      ) : null}

      {activeTab === "reflection" && scheduleSettings.planFeatures.reflection ? (
        <ReflectionPanel matchId={matchId} />
      ) : null}

      {activeTab === "lifelineChart" && scheduleSettings.planFeatures.lifelineChart ? (
        <LifelinePanel matchId={matchId} />
      ) : null}

      {activeTab === "summaryReport" && scheduleSettings.planFeatures.summaryReport ? (
        <SummaryReportPanel matchId={matchId} />
      ) : null}

      {activeTab === "coachingQuestions" && scheduleSettings.planFeatures.coachingQuestions ? (
        <CoachingQuestionsPanel matchId={matchId} />
      ) : null}

      {activeTab === "coachingIcebreaker" && scheduleSettings.planFeatures.coachingIcebreaker ? (
        <CoachingIcebreakerPanel matchId={matchId} />
      ) : null}

      {activeTab === "coachingOneOnOneFormat" && scheduleSettings.planFeatures.coachingOneOnOneFormat ? (
        <CoachingOneOnOneFormatPanel matchId={matchId} />
      ) : null}
        </div>
      </div>

    </div>

    {chatFullscreen && activeTab === "chat" ? (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-fullscreen-heading"
        className="fixed inset-0 z-[200] flex flex-col gap-3 overflow-hidden bg-slate-100/96 p-3 backdrop-blur-sm sm:p-5"
      >
        <header className="app-surface-raised flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <h2 id="chat-fullscreen-heading" className="text-lg font-semibold text-slate-900">
            チャット（全画面）
          </h2>
          <button
            type="button"
            className="app-btn-secondary rounded-lg px-4 py-2 text-sm font-semibold"
            onClick={() => setChatFullscreen(false)}
          >
            閉じる（Esc）
          </button>
        </header>
        <ChatScheduleHints role={me.role} />
        <ChatMessageThread
          messages={messages}
          me={me}
          chatLastReadAt={chatLastReadAt}
          negotiations={negotiations}
          activeNegotiation={activeNegotiation}
          onChatVote={onChatVote}
          voteSubmittingForSlot={voteSubmittingForSlot}
          navigateToTab={goTab}
          scrollClassName="min-h-0 flex-1 basis-0"
        />
        <form onSubmit={onSendChat} className="app-surface-raised flex shrink-0 flex-col gap-3 rounded-2xl p-4">
          <label className="text-base font-medium">
            {chatSendFormLabel(me.role)}
            <textarea
              name="body"
              rows={3}
              placeholder="補足・メモなど（任意）"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base"
            />
          </label>
          <button
            type="submit"
            className="app-btn-primary self-start rounded-lg px-4 py-2.5 text-base"
          >
            送信
          </button>
        </form>
        <div className="min-h-0 shrink overflow-y-auto">
          {me.role === "PARTNER" ? <PartnerChatTemplates /> : null}
        </div>
      </div>
    ) : null}
    </>
  );
}
