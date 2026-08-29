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
import { DevelopmentOpportunityPanel } from "@/components/development-opportunity-panel";
import { BusinessProblemPanel } from "@/components/business-problem-panel";
import { ActionBrakePanel } from "@/components/action-brake-panel";
import { ReflectionPanel } from "@/components/reflection-panel";
import { LifelinePanel } from "@/components/lifeline-panel";
import { SummaryReportPanel } from "@/components/summary-report-panel";
import { CompanionHowtoFrame } from "@/components/companion-howto-frame";
import { CoachingQuestionsPanel } from "@/components/coaching-questions-panel";
import { CoachingIcebreakerPanel } from "@/components/coaching-icebreaker-panel";
import { CoachingOneOnOneFormatPanel } from "@/components/coaching-one-on-one-format-panel";
import type { FtaChart } from "@/lib/fta";
import { defaultFtaChart } from "@/lib/fta";
import {
  DEFAULT_COMPANY_PLAN,
  companyPlanLabel,
  getPlanFeatures,
  isIndividualCompanionPlan,
  resolveCoachingPlanSettings,
  type CoachingPlanSettings,
  type CompanyPlan,
  type PlanFeatures,
} from "@/lib/company-plan";
import {
  companionHowtoAudiencesForViewer,
  companionHowtoEnabled,
  companionHowtoLabel,
  type CompanionHowtoAudience,
} from "@/lib/companion-howto";
import {
  meetingProviderLabel,
  normalizeMeetingProvider,
  type MeetingProvider,
} from "@/lib/meeting-provider-shared";
import {
  formatTimeHmInZone,
  zonedWallClockToUtc,
  calendarDateInTimeZone,
} from "@/lib/slot-schedule";
import { ScheduleProposeForm } from "@/components/schedule-propose-form";
import { ScheduleClientVoteForm } from "@/components/schedule-client-vote-form";
import { MatchRoomGuideBanner } from "@/components/match-room-guide-banner";
import { LEGACY_STATUS_LABEL } from "@/lib/negotiation-display";
import type { TimeRangeInput } from "@/lib/generate-slots-from-ranges";
import { ScheduleRulesDetail } from "@/components/schedule-rules-detail";
import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
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
  responseDeadline?: string | null;
  clientRespondedAt?: string | null;
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
  effectiveProgramId: string | null;
  overriddenFields: string[];
  companyPlan: CompanyPlan;
  planFeatures: PlanFeatures;
  coachingPlanSettings: CoachingPlanSettings;
  meetingProvider: MeetingProvider;
};

const DEFAULT_COACHING_PLAN_SETTINGS = resolveCoachingPlanSettings(null);

const DEFAULT_PLAN_FEATURES = getPlanFeatures(DEFAULT_COMPANY_PLAN);

type MatchTab =
  | "chat"
  | "schedule"
  | "fta"
  | "sessions"
  | "overview"
  | "clientInfo"
  | "skillCheck"
  | "developmentOpportunity"
  | "businessProblem"
  | "pdca"
  | "actionBrakeAnalysis"
  | "reflection"
  | "summaryReport"
  | "lifelineChart"
  | "howtoClient"
  | "howtoSupervisor"
  | "howtoPartner"
  | "coachingQuestions"
  | "coachingIcebreaker"
  | "coachingOneOnOneFormat";

const TAB_HASH_MAP: Record<string, MatchTab> = {
  chat: "chat",
  // 旧「日程調整」タブは 1on1セッションに統合。#schedule は互換のため sessions へ。
  schedule: "sessions",
  "sessions-adjust": "sessions",
  "sessions-review": "sessions",
  fta: "fta",
  sessions: "sessions",
  overview: "overview",
  "client-info": "clientInfo",
  "skill-check": "skillCheck",
  "development-opportunity": "developmentOpportunity",
  "business-problem": "businessProblem",
  pdca: "pdca",
  "action-brake": "actionBrakeAnalysis",
  reflection: "reflection",
  "summary-report": "summaryReport",
  "lifeline-chart": "lifelineChart",
  "howto-client": "howtoClient",
  "howto-supervisor": "howtoSupervisor",
  "howto-partner": "howtoPartner",
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

/** 統合後のセクションへスクロールするハッシュ（旧 #schedule 含む） */
function sessionsSectionIdFromHash(hash: string): string | null {
  const h = hash.replace(/^#/, "").toLowerCase();
  if (h === "schedule" || h === "sessions-adjust") return "sessions-adjust";
  if (h === "sessions-review") return "sessions-review";
  return null;
}

function hashFromTab(tab: MatchTab): string {
  if (tab === "clientInfo") return "client-info";
  if (tab === "skillCheck") return "skill-check";
  if (tab === "developmentOpportunity") return "development-opportunity";
  if (tab === "businessProblem") return "business-problem";
  if (tab === "actionBrakeAnalysis") return "action-brake";
  if (tab === "summaryReport") return "summary-report";
  if (tab === "lifelineChart") return "lifeline-chart";
  if (tab === "howtoClient") return "howto-client";
  if (tab === "howtoSupervisor") return "howto-supervisor";
  if (tab === "howtoPartner") return "howto-partner";
  if (tab === "coachingQuestions") return "questions";
  if (tab === "coachingIcebreaker") return "icebreaker";
  if (tab === "coachingOneOnOneFormat") return "one-on-one-format";
  if (tab === "schedule") return "sessions";
  return tab;
}

function isClientSideRole(role: Me["role"]) {
  return role === "CLIENT" || role === "CLIENT_ADMIN" || role === "CLIENT_HR";
}

function matchTabRequiresPartner(tab: MatchTab): boolean {
  return (
    tab === "overview" ||
    tab === "chat" ||
    tab === "schedule" ||
    tab === "sessions" ||
    tab === "clientInfo"
  );
}

/** 上司紐づけビューで表示する伴走シートタブ */
function isSupervisorSheetTab(tab: MatchTab): boolean {
  return (
    tab === "skillCheck" ||
    tab === "lifelineChart" ||
    tab === "fta" ||
    tab === "developmentOpportunity" ||
    tab === "businessProblem" ||
    tab === "pdca" ||
    tab === "actionBrakeAnalysis" ||
    tab === "reflection" ||
    tab === "summaryReport" ||
    tab === "howtoSupervisor"
  );
}

function howtoTabFromAudience(audience: CompanionHowtoAudience): MatchTab {
  if (audience === "client") return "howtoClient";
  if (audience === "supervisor") return "howtoSupervisor";
  return "howtoPartner";
}

function firstSupervisorSheetTab(features: PlanFeatures): MatchTab {
  if (features.lifelineChart) return "lifelineChart";
  if (features.skillCheck) return "skillCheck";
  if (features.fta) return "fta";
  if (features.developmentOpportunity) return "developmentOpportunity";
  if (features.businessProblem) return "businessProblem";
  if (features.pdca) return "pdca";
  if (features.actionBrakeAnalysis) return "actionBrakeAnalysis";
  if (features.reflection) return "reflection";
  if (features.summaryReport) return "summaryReport";
  return "lifelineChart";
}

function firstPrePartnerCoachingTab(features: PlanFeatures): MatchTab {
  if (features.coachingIcebreaker) return "coachingIcebreaker";
  return "coachingIcebreaker";
}

function isAdminViewerRole(role: Me["role"]) {
  return role === "ADMIN" || role === "ADMIN_ASSISTANT";
}

function coachingPublishTabLocked(
  tab: "coachingQuestions" | "coachingOneOnOneFormat",
  features: PlanFeatures,
  role: Me["role"],
): boolean {
  if (isAdminViewerRole(role)) return false;
  if (tab === "coachingQuestions") return !features.coachingQuestions;
  return !features.coachingOneOnOneFormat;
}

function showCoachingTabForViewer(
  tab: Extract<MatchTab, "coachingIcebreaker" | "coachingQuestions" | "coachingOneOnOneFormat">,
  settings: ScheduleSettingsPayload,
  role: Me["role"],
): boolean {
  if (settings.companyPlan !== "coaching_management_training") {
    if (tab === "coachingIcebreaker") return settings.planFeatures.coachingIcebreaker;
    if (tab === "coachingQuestions") return settings.planFeatures.coachingQuestions;
    return settings.planFeatures.coachingOneOnOneFormat;
  }
  const cs = settings.coachingPlanSettings;
  if (isAdminViewerRole(role)) return true;
  if (role === "PARTNER") {
    if (tab === "coachingIcebreaker") return cs.shareIcebreakerWithPartner;
    if (tab === "coachingQuestions") return cs.shareQuestionsWithPartner;
    return cs.shareOneOnOneFormatWithPartner;
  }
  if (tab === "coachingIcebreaker") return settings.planFeatures.coachingIcebreaker;
  return true;
}

function matchTabButtonClass(active: boolean, locked: boolean): string {
  if (locked) {
    return "shrink-0 cursor-not-allowed rounded-t-lg border border-transparent px-3.5 py-2.5 text-base font-semibold text-slate-400 opacity-60 sm:px-4";
  }
  return `shrink-0 rounded-t-lg px-3.5 py-2.5 text-base font-semibold transition sm:px-4 ${
    active
      ? "relative z-[1] -mb-px border border-slate-200 border-b-white bg-white text-indigo-950 shadow-sm"
      : "border border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900"
  }`;
}

function canShowFtaTab(
  me: Me,
  settings: ScheduleSettingsPayload,
  supervisorViewer = false,
): boolean {
  if (!settings.planFeatures.fta) return false;
  if (supervisorViewer) return true;
  if (me.role === "PARTNER" || me.role === "ADMIN" || me.role === "ADMIN_ASSISTANT") return true;
  return isClientSideRole(me.role);
}

function ftaTabLabel(
  me: Me,
  _settings: ScheduleSettingsPayload,
  supervisorViewer = false,
): string {
  if (supervisorViewer) return "クライアント自分FTA";
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
  postSessionOpenable: boolean;
  isRoleplaySession?: boolean;
  hasClientFeedback: boolean;
  hasPartnerReport: boolean;
  abandonment?: SessionAbandonmentApi | null;
  zoomUrl?: string | null;
  zoomMeetingId?: string | null;
  zoomPass?: string | null;
  meetingProvider?: MeetingProvider | null;
};

function resolveSessionMeetingProvider(row: {
  meetingProvider?: MeetingProvider | string | null;
  zoomUrl?: string | null;
}): MeetingProvider {
  if (row.meetingProvider === "google_meet" || row.meetingProvider === "zoom") {
    return row.meetingProvider;
  }
  const url = (row.zoomUrl ?? "").toLowerCase();
  if (url.includes("meet.google.com")) return "google_meet";
  return normalizeMeetingProvider(row.meetingProvider);
}

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

const statusLabel: Record<NegotiationRow["status"], string> = LEGACY_STATUS_LABEL;

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
    const el =
      document.getElementById("client-schedule-vote") ??
      document.getElementById("sessions-adjust");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
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

function chatSendFormLabel(role: Role): string {
  return role === "PARTNER"
    ? "メッセージ送信（クライアントにチャットを送付する）"
    : "メッセージ送信";
}

const CHAT_URL_PATTERN = /https?:\/\/[^\s]+/g;

/** 末尾の句読点・閉じ括弧は URL に含めない */
function trimUrlTail(url: string): { href: string; tail: string } {
  let end = url.length;
  while (end > 0 && "。、．，)）]］>》!?！？.,:;".includes(url[end - 1])) end -= 1;
  return { href: url.slice(0, end), tail: url.slice(end) };
}

/** チャット本文中の URL をリンクにする */
function renderChatBody(body: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  for (const match of body.matchAll(CHAT_URL_PATTERN)) {
    const raw = match[0];
    const start = match.index ?? 0;
    if (start > lastIndex) nodes.push(body.slice(lastIndex, start));
    const { href, tail } = trimUrlTail(raw);
    nodes.push(
      <a
        key={`u${key}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-indigo-700 underline"
      >
        {href}
      </a>,
    );
    if (tail) nodes.push(tail);
    key += 1;
    lastIndex = start + raw.length;
  }
  if (lastIndex < body.length) nodes.push(body.slice(lastIndex));
  return nodes;
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
    navigateToTab("sessions");
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
          <pre className="whitespace-pre-wrap font-sans text-xs text-emerald-900/80">{renderChatBody(msg.body)}</pre>
        </div>
      ) : msg.kind === "VOTE_SUMMARY" ? (
        <div className="mt-2">
          <VoteSummaryCard
            payload={msg.payload}
            body={msg.body}
            onJumpToConfirm={() => {
              navigateToTab("sessions");
              window.setTimeout(() => {
                const el =
                  document.getElementById("partner-confirm-section") ??
                  document.getElementById("sessions-adjust");
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              }, 80);
            }}
          />
        </div>
      ) : (
        <pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{renderChatBody(msg.body)}</pre>
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
  /** 指定時は該当回のセッション詳細ページへ直接遷移する */
  ctaSessionNumber?: number;
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
    const more =
      activeNegotiations.length > 1
        ? `（ほか ${activeNegotiations.length - 1} 回分も調整中）`
        : "";
    if (active.status === "AWAITING_CLIENT_RESPONSE" && isClientSide) {
      return {
        message: `あなたの番です — 第 ${sn} 回の候補日に ◯× で回答してください。${more}`,
        severity: "todo",
        ctaLabel: "回答する",
        ctaTab: "sessions",
        scrollToId: "sessions-adjust",
      };
    }
    if (active.status === "AWAITING_CLIENT_RESPONSE" && isPartner) {
      return {
        message: `クライアントの回答待ち — 第 ${sn} 回の候補日への ◯× を待っています。${more}`,
        severity: "info",
        ctaLabel: "状況を確認",
        ctaTab: "sessions",
        scrollToId: "sessions-adjust",
      };
    }
    if (active.status === "NEEDS_NEW_PROPOSAL" && isPartner) {
      return {
        message: `あなたの番です — 第 ${sn} 回はすべて × でした。新しい候補日を送ってください。${more}`,
        severity: "warn",
        ctaLabel: "候補日を送る",
        ctaTab: "sessions",
        scrollToId: "sessions-adjust",
      };
    }
    if (active.status === "NEEDS_NEW_PROPOSAL" && isClientSide) {
      return {
        message: `パートナーが新しい候補日を準備中 — 第 ${sn} 回の候補日が再送されるのをお待ちください。${more}`,
        severity: "info",
        ctaLabel: "状況を確認",
        ctaTab: "sessions",
        scrollToId: "sessions-adjust",
      };
    }
    if (active.status === "AWAITING_PARTNER_CONFIRM" && isPartner) {
      return {
        message: `あなたの番です — 第 ${sn} 回の日程を ◯ から決定してください。${more}`,
        severity: "todo",
        ctaLabel: "日程を決定する",
        ctaTab: "sessions",
        scrollToId: "partner-confirm-section",
      };
    }
    if (active.status === "AWAITING_PARTNER_CONFIRM" && isClientSide) {
      return {
        message: `パートナーが日程を決定中 — 第 ${sn} 回の確定をお待ちください。${more}`,
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
      ctaSessionNumber: unsubmitted.sessionNumber,
      scrollToId: "sessions-review",
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
        ctaSessionNumber: upcoming.sessionNumber,
        scrollToId: "sessions-review",
      };
    }
  }

  // パートナーで、まだ候補が出ていない session があれば「候補を送る」
  // 他の回が進行中でも、未提案の回があれば促す（複数回まとめて調整できるようにする）
  if (isPartner) {
    const known = new Set(negotiations.map((n) => Math.max(1, n.sessionNumber ?? 1)));
    let need: number | null = null;
    for (let i = 1; i <= Math.max(totalSessions, 1); i++) {
      if (!known.has(i)) {
        need = i;
        break;
      }
    }
    if (need !== null && activeNegotiations.length === 0) {
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
    if (need !== null && activeNegotiations.length > 0) {
      // 進行中があるときはそちらを優先表示（上の active 分岐で既に return 済み）
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
    effectiveProgramId: null,
    overriddenFields: [],
    companyPlan: DEFAULT_COMPANY_PLAN,
    planFeatures: DEFAULT_PLAN_FEATURES,
    coachingPlanSettings: DEFAULT_COACHING_PLAN_SETTINGS,
    meetingProvider: "zoom",
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
  // 「1on1セッション」タブ（調整中セクション）を自動で開く。
  const [activeTab, setActiveTab] = useState<MatchTab>(() => {
    if (typeof window === "undefined") return "chat";
    const tab = tabFromHash(window.location.hash || "");
    return tab ?? "chat";
  });
  // クライアント側マウント後にハッシュが変わったときも追随する（戻る/進む対応）。
  useEffect(() => {
    function scrollToSessionsSection(hash: string) {
      const sectionId = sessionsSectionIdFromHash(hash);
      if (!sectionId) return;
      window.setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
    function onHashChange() {
      const hash = window.location.hash || "";
      const tab = tabFromHash(hash);
      if (tab) setActiveTab(tab);
      scrollToSessionsSection(hash);
    }
    scrollToSessionsSection(window.location.hash || "");
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
  const [partnerPending, setPartnerPending] = useState(false);
  const [supervisorViewer, setSupervisorViewer] = useState(false);
  /** ルーム自体を開けない（権限なし・不存在）。ポーリングを止めて案内だけ出す。 */
  const [roomAccessDenied, setRoomAccessDenied] = useState(false);
  const [brakeFromPdcaId, setBrakeFromPdcaId] = useState<string | null>(null);

  const goTab = useCallback((tab: MatchTab) => {
    const next = tab === "schedule" ? "sessions" : tab;
    setActiveTab(next);
    try {
      history.replaceState(null, "", `#${hashFromTab(next)}`);
    } catch {
      /* ignore */
    }
  }, []);

  const tryGoTab = useCallback(
    (tab: MatchTab) => {
      const isAdminViewer = isAdminViewerRole(me?.role ?? "CLIENT");
      if (supervisorViewer && !isSupervisorSheetTab(tab)) return;
      if (partnerPending && !isAdminViewer && matchTabRequiresPartner(tab)) return;
      if (
        (tab === "coachingQuestions" || tab === "coachingOneOnOneFormat") &&
        coachingPublishTabLocked(tab, scheduleSettings.planFeatures, me?.role ?? "CLIENT")
      ) {
        return;
      }
      goTab(tab);
    },
    [partnerPending, supervisorViewer, me?.role, goTab, scheduleSettings.planFeatures],
  );

  useEffect(() => {
    if (!partnerPending) return;
    const isAdminViewer = isAdminViewerRole(me?.role ?? "CLIENT");
    if (isAdminViewer) return;
    if (matchTabRequiresPartner(activeTab)) {
      goTab(firstPrePartnerCoachingTab(scheduleSettings.planFeatures));
    }
  }, [partnerPending, activeTab, scheduleSettings.planFeatures, goTab, me?.role]);

  useEffect(() => {
    if (!supervisorViewer) return;
    if (!isSupervisorSheetTab(activeTab)) {
      goTab(firstSupervisorSheetTab(scheduleSettings.planFeatures));
    }
  }, [supervisorViewer, activeTab, scheduleSettings.planFeatures, goTab]);

  useEffect(() => {
    if (!me) return;
    if (
      (activeTab === "coachingQuestions" || activeTab === "coachingOneOnOneFormat") &&
      coachingPublishTabLocked(activeTab, scheduleSettings.planFeatures, me.role)
    ) {
      goTab("coachingIcebreaker");
    }
  }, [activeTab, scheduleSettings.planFeatures, me, goTab]);

  useEffect(() => {
    if (!me) return;
    if (me.role !== "PARTNER" && me.role !== "ADMIN" && activeTab === "clientInfo") {
      tryGoTab("chat");
    }
  }, [me, activeTab, tryGoTab]);

  useEffect(() => {
    if (!me) return;
    const isHowto =
      activeTab === "howtoClient" ||
      activeTab === "howtoSupervisor" ||
      activeTab === "howtoPartner";
    if (!isHowto) return;
    if (!companionHowtoEnabled(scheduleSettings.companyPlan)) {
      goTab(supervisorViewer ? firstSupervisorSheetTab(scheduleSettings.planFeatures) : "chat");
      return;
    }
    const allowed = companionHowtoAudiencesForViewer({
      role: me.role,
      supervisorViewer,
    });
    const ok =
      (activeTab === "howtoClient" && allowed.includes("client")) ||
      (activeTab === "howtoSupervisor" && allowed.includes("supervisor")) ||
      (activeTab === "howtoPartner" && allowed.includes("partner"));
    if (!ok) {
      goTab(allowed[0] ? howtoTabFromAudience(allowed[0]) : "chat");
    }
  }, [me, activeTab, supervisorViewer, scheduleSettings.companyPlan, scheduleSettings.planFeatures, goTab]);

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

  const load = useCallback(async () => {
    const roomRes = await fetch(`/api/matches/${encodeURIComponent(matchId)}`, { cache: "no-store" });
    const roomJson = await roomRes.json().catch(() => null);
    if (!roomRes.ok) {
      // /api/me は取れるようにして「読込中…」無限ループを防ぐ
      const meRes = await fetch("/api/me", { cache: "no-store" });
      const meJson = await meRes.json().catch(() => null);
      if (meRes.ok && meJson?.user) setMe(meJson.user);
      setError(roomJson?.error ?? "このマッチを開けません。");
      if (roomRes.status === 403 || roomRes.status === 404) setRoomAccessDenied(true);
      return;
    }
    setError(null);
    setRoomAccessDenied(false);
    const pending = roomJson?.partnerPending === true;
    setPartnerPending(pending);
    const sheetsOnly = roomJson?.supervisorViewer === true;
    setSupervisorViewer(sheetsOnly);

    const fetches: Promise<Response>[] = [
      fetch("/api/me", { cache: "no-store" }),
      fetch(`/api/settings?matchId=${encodeURIComponent(matchId)}`, { cache: "no-store" }),
    ];
    if (!sheetsOnly) {
      fetches.push(
        fetch(`/api/matches/${matchId}/messages`, { cache: "no-store" }),
        fetch(`/api/matches/${matchId}/negotiations`, { cache: "no-store" }),
      );
    }
    const results = await Promise.all(fetches);
    const mRes = results[0]!;
    const sRes = results[1]!;
    const gRes = sheetsOnly ? null : results[2]!;
    const nRes = sheetsOnly ? null : results[3]!;
    const mJson = await mRes.json().catch(() => null);
    const sJson = await sRes.json().catch(() => null);
    const gJson = gRes ? await gRes.json().catch(() => null) : { messages: [] };
    const nJson = nRes ? await nRes.json().catch(() => null) : { negotiations: [] };

    if (mRes.ok && mJson?.user) setMe(mJson.user);
    if (!mRes.ok) {
      setError(mJson?.error ?? "ユーザー情報が取得できません。");
      return;
    }
    if (gRes && !gRes.ok) {
      setError(gJson?.error ?? "チャットを読込めませんでした。");
      return;
    }
    if (nRes && !nRes.ok) {
      setError(nJson?.error ?? "日程情報を読込めませんでした。");
      return;
    }

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
        effectiveProgramId:
          typeof sJson.effectiveProgramId === "string" ? sJson.effectiveProgramId : null,
        overriddenFields: Array.isArray(sJson.overriddenFields)
          ? (sJson.overriddenFields as unknown[]).map((x) => String(x))
          : [],
        companyPlan:
          isIndividualCompanionPlan(sJson.companyPlan) ||
          sJson.companyPlan === "coaching_management_training" ||
          sJson.companyPlan === "workplace_activation" ||
          sJson.companyPlan === "monthly_session"
            ? sJson.companyPlan
            : DEFAULT_COMPANY_PLAN,
        planFeatures:
          sJson.planFeatures && typeof sJson.planFeatures === "object"
            ? (sJson.planFeatures as PlanFeatures)
            : DEFAULT_PLAN_FEATURES,
        coachingPlanSettings:
          sJson.coachingPlanSettings && typeof sJson.coachingPlanSettings === "object"
            ? resolveCoachingPlanSettings(sJson.coachingPlanSettings as Record<string, boolean>)
            : DEFAULT_COACHING_PLAN_SETTINGS,
        meetingProvider: normalizeMeetingProvider(sJson.meetingProvider),
      });
    }

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
    // 入力中の内容をサーバの空チャートで上書きしない
    setMyFtaDirty((dirty) => {
      if (!dirty && ftaRes.ok && ftaJson?.chart) {
        setMyFtaChart(ftaJson.chart as FtaChart);
      }
      return dirty;
    });
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
  }, [load, loadClientFta]);

  useEffect(() => {
    if (supervisorViewer) return;
    void loadAvailability();
    void loadSessions();
  }, [supervisorViewer, loadAvailability, loadSessions]);

  useEffect(() => {
    if (supervisorViewer) return;
    if (me && isClientSideRole(me.role) && scheduleSettings.planFeatures.fta) {
      void loadMyFta();
    }
  }, [me, supervisorViewer, scheduleSettings.planFeatures.fta, loadMyFta]);

  useEffect(() => {
    if (!myFtaDirty || myFtaSaving) return;
    const id = window.setTimeout(async () => {
      setMyFtaSaving(true);
      const res = await fetch("/api/fta/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chart: myFtaChart, matchId }),
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
  }, [myFtaChart, myFtaDirty, myFtaSaving, loadClientFta, matchId]);

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
    if (roomAccessDenied) return;
    const id = window.setInterval(() => {
      void load();
    }, 1200);
    return () => window.clearInterval(id);
  }, [load, roomAccessDenied]);

  useEffect(() => {
    // セッション一覧は少し緩めに更新
    if (roomAccessDenied) return;
    const id = window.setInterval(() => {
      void loadSessions();
    }, 3000);
    return () => window.clearInterval(id);
  }, [loadSessions, roomAccessDenied]);

  useEffect(() => {
    // FTAは独立で短い間隔で取得し、チャット/日程APIの成否に影響されないようにする。
    if (roomAccessDenied) return;
    const id = window.setInterval(() => {
      void loadClientFta();
    }, 2000);
    return () => window.clearInterval(id);
  }, [loadClientFta, roomAccessDenied]);

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

  /** 未確定の調整中ラウンド（複数回を同時に開ける） */
  const openNegotiations = useMemo(
    () =>
      negotiations
        .filter((n) => n.status !== "CONFIRMED" && n.status !== "SUPERSEDED")
        .sort((a, b) => (a.sessionNumber ?? 1) - (b.sessionNumber ?? 1) || b.round - a.round),
    [negotiations],
  );

  /** バナー等の代表（いちばん若い回の進行中） */
  const activeNegotiation = openNegotiations[0] ?? null;

  const blockedProposeSessions = useMemo(() => {
    const blocked = new Set<number>();
    for (const n of openNegotiations) {
      if (n.status === "AWAITING_CLIENT_RESPONSE" || n.status === "AWAITING_PARTNER_CONFIRM") {
        blocked.add(Math.max(1, n.sessionNumber ?? 1));
      }
    }
    return [...blocked];
  }, [openNegotiations]);

  const defaultProposeSessions = useMemo(() => {
    const knownOpenOrConfirmed = new Set<number>();
    for (const n of negotiations) {
      const sn = Math.max(1, n.sessionNumber ?? 1);
      if (n.status === "CONFIRMED" || n.status === "AWAITING_CLIENT_RESPONSE" || n.status === "AWAITING_PARTNER_CONFIRM") {
        knownOpenOrConfirmed.add(sn);
      }
    }
    const picks: number[] = [];
    for (let i = 1; i <= Math.max(1, scheduleSettings.totalSessions); i++) {
      if (!knownOpenOrConfirmed.has(i) && !blockedProposeSessions.includes(i)) picks.push(i);
      if (picks.length >= 4) break;
    }
    return picks.length > 0 ? picks : undefined;
  }, [negotiations, scheduleSettings.totalSessions, blockedProposeSessions]);

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

  async function onVoteSelected(negotiation: NegotiationRow, selectedSlotIds: string[]) {
    if (negotiation.status !== "AWAITING_CLIENT_RESPONSE") return;
    const res = await fetch(`/api/matches/${matchId}/negotiations/${negotiation.id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedSlotIds }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(json?.error ?? "回答送信に失敗しました。");
      return;
    }
    setNotice(`第${Math.max(1, negotiation.sessionNumber ?? 1)}回の回答を送信しました。`);
    await load();
  }

  async function onRequestAlternative(negotiation: NegotiationRow) {
    if (negotiation.status !== "AWAITING_CLIENT_RESPONSE") return;
    const res = await fetch(`/api/matches/${matchId}/negotiations/${negotiation.id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedSlotIds: [] }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(json?.error ?? "送信に失敗しました。");
      return;
    }
    setNotice(`第${Math.max(1, negotiation.sessionNumber ?? 1)}回について別候補を希望しました。`);
    await load();
  }

  async function onProposeTimeRanges(payload: {
    proposals: Array<{ sessionNumber: number; timeRanges: TimeRangeInput[] }>;
  }) {
    if (me?.role !== "PARTNER") return;
    if (proposeSubmitting) return;
    setProposeSubmitting(true);
    setError(null);
    setProposeJustSent(false);
    const res = await fetch(`/api/matches/${matchId}/negotiations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => null);
    setProposeSubmitting(false);
    if (!res.ok) {
      setError(json?.error ?? "提案に失敗しました。");
      return;
    }
    const sessions = Array.isArray(json?.sessionNumbers)
      ? (json.sessionNumbers as number[])
      : payload.proposals.map((p) => p.sessionNumber);
    const slotCounts =
      json?.slotCounts && typeof json.slotCounts === "object"
        ? (json.slotCounts as Record<string, number>)
        : {};
    setProposeJustSent(true);
    setNotice(
      sessions.length > 1
        ? sessions
            .map((n) => `第${n}回（${slotCounts[String(n)] ?? ""}件）`)
            .join("・") + "の候補日時をまとめて提示しました。"
        : `第${sessions[0] ?? ""}回の候補日時（${json?.slotCount ?? ""}件）を提示しました。`,
    );
    window.setTimeout(() => setProposeJustSent(false), 6000);
    await load();
  }

  async function onConfirm(negotiation: NegotiationRow, e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (negotiation.status !== "AWAITING_PARTNER_CONFIRM") return;
    const fd = new FormData(e.currentTarget);
    const slotId = String(fd.get("slotId"));
    const chosen = negotiation.slots.find((s) => s.id === slotId);
    if (!chosen || chosen.clientVote !== "YES") {
      setError("選択した候補はクライアントが希望していません。");
      return;
    }
    const adjustTime = String(fd.get("adjustStartTime") ?? "").trim();
    const body: { slotId: string; adjustedStartAt?: string } = { slotId };
    if (adjustTime) {
      const dateYmd = calendarDateInTimeZone(new Date(chosen.startAt), scheduleSettings.timezone);
      const defaultTime = formatTimeHmInZone(new Date(chosen.startAt), scheduleSettings.timezone);
      if (adjustTime !== defaultTime) {
        body.adjustedStartAt = zonedWallClockToUtc(
          dateYmd,
          adjustTime,
          scheduleSettings.timezone,
        ).toISOString();
      }
    }
    const res = await fetch(`/api/matches/${matchId}/negotiations/${negotiation.id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(json?.error ?? "確定処理に失敗しました。");
      return;
    }
    setNotice(`第${Math.max(1, negotiation.sessionNumber ?? 1)}回の日程を確定しました。関係者へメール（.ics 添付）で通知しました。`);
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

  function getRescheduleEligibility(sessionNumber: number, slot: SlotRow | null) {
    if (
      me?.role !== "PARTNER" &&
      me?.role !== "CLIENT" &&
      me?.role !== "CLIENT_ADMIN" &&
      me?.role !== "CLIENT_HR"
    )
      return { can: false, reason: "パートナー・クライアントのみ利用できます。" };
    const sessionOpen = openNegotiations.some(
      (n) => Math.max(1, n.sessionNumber ?? 1) === sessionNumber,
    );
    if (sessionOpen) {
      return { can: false, reason: "この回は調整中のため、完了後に変更希望を送れます。" };
    }
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

  if (!me || roomAccessDenied) {
    if (error) {
      return (
        <div className="mx-auto max-w-xl px-6 py-10">
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {error}
          </p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm font-semibold text-indigo-700">
            ← ダッシュボードへ戻る
          </Link>
        </div>
      );
    }
    return (
      <div className="px-6 py-10 text-sm text-slate-600">
        読込中…
      </div>
    );
  }

  const partnerTabsLocked =
    partnerPending && me.role !== "ADMIN" && me.role !== "ADMIN_ASSISTANT";

  const coachingQuestionsLocked = coachingPublishTabLocked(
    "coachingQuestions",
    scheduleSettings.planFeatures,
    me.role,
  );
  const coachingFormatLocked = coachingPublishTabLocked(
    "coachingOneOnOneFormat",
    scheduleSettings.planFeatures,
    me.role,
  );
  const showCoachingIcebreakerTab =
    !supervisorViewer &&
    showCoachingTabForViewer("coachingIcebreaker", scheduleSettings, me.role);
  const showCoachingQuestionsTab =
    !supervisorViewer &&
    showCoachingTabForViewer("coachingQuestions", scheduleSettings, me.role);
  const showCoachingFormatTab =
    !supervisorViewer &&
    showCoachingTabForViewer("coachingOneOnOneFormat", scheduleSettings, me.role);
  const howtoAudiences = companionHowtoEnabled(scheduleSettings.companyPlan)
    ? companionHowtoAudiencesForViewer({ role: me.role, supervisorViewer })
    : [];
  const howtoShowAudienceInLabel = howtoAudiences.length > 1;

  return (
    <>
    <div className="mx-auto flex w-full min-w-0 max-w-none flex-1 flex-col gap-8 px-1 py-4 sm:gap-12 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4 sm:gap-4 sm:pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
            {supervisorViewer ? "Supervisor Sheets" : "Match Detail"}
          </p>
          <p className="text-sm text-slate-600 sm:text-base">
            {withHonorificSan(me.displayName)} として表示中
            {supervisorViewer
              ? me.role === "CLIENT_HR"
                ? "（社内の伴走シート）"
                : "（部下の伴走シート）"
              : "（メールなどは公開されません）"}
          </p>
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
                    href={
                      scheduleSettings.effectiveProgramId
                        ? `/admin/companies/${encodeURIComponent(scheduleSettings.effectiveCompanyId)}/settings?programId=${encodeURIComponent(scheduleSettings.effectiveProgramId)}`
                        : `/admin/companies/${encodeURIComponent(scheduleSettings.effectiveCompanyId)}/settings`
                    }
                    title="管理者専用：このマッチのプログラム設定編集ページへ"
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

      {!supervisorViewer &&
      (me.role === "PARTNER" ||
        me.role === "CLIENT" ||
        me.role === "CLIENT_ADMIN" ||
        me.role === "CLIENT_HR") ? (
        !partnerPending ? (
        <MatchRoomGuideBanner
          userId={me.id}
          role={me.role}
          planFeatures={scheduleSettings.planFeatures}
          isCoachingPlan={scheduleSettings.companyPlan === "coaching_management_training"}
          onGoTab={(tab) => tryGoTab(tab as MatchTab)}
        />
        ) : null
      ) : null}

      {partnerPending ? (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
          <p className="text-base font-semibold text-slate-900">パートナー未割当</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            パートナーが決まるまで、プロジェクト概要・チャット・1on1セッションはご利用いただけません。
            アイスブレイク・質問リスト・1on1フォーマットはお使いいただけます。
          </p>
        </section>
      ) : null}

      {/*
        「あなたの今の状態」バナー（クライアント / パートナーのみ）。
        - チャット・日程・1on1 タブを行き来しなくても、画面上部 1 行で
          「次にやる用事 / 待ち状態 / 直近セッションのリマインダ」が分かる。
        - severity に応じて色を変える (info: 青 / todo: 紫 / warn: 琥珀)。
        - 押下で該当タブにジャンプ。
      */}
      {!partnerPending
        ? (() => {
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
            {banner.ctaLabel && banner.ctaSessionNumber && scheduleSettings.planFeatures.sessions ? (
              <Link
                href={`/match/${matchId}/sessions/${banner.ctaSessionNumber}`}
                className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold no-underline ${buttonClass}`}
              >
                {banner.ctaLabel}
              </Link>
            ) : banner.ctaLabel && banner.ctaTab ? (
              <button
                type="button"
                onClick={() => {
                  tryGoTab(banner.ctaTab!);
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
      })() : null}

      {availability && !partnerPending ? (
        <section className="app-surface-emerald rounded-2xl px-5 py-4">
          <h2 className="text-lg font-semibold text-emerald-900">お互いの対応可能時間</h2>
          <p className="mt-1 text-sm text-emerald-900/80">
            アサイン用に登録された参考情報です。実際の日程は「1on1セッション」タブの調整中セクションで個別調整してください。
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
          className="relative z-20 -mx-1 border-b border-slate-200 bg-slate-50/95 px-1 pt-1 sm:static sm:mx-0 sm:border sm:border-b-0 sm:border-slate-200 sm:bg-slate-100 sm:px-2 sm:pt-2 rounded-t-xl"
          aria-label="ルームメニュー"
          role="tablist"
        >
          <div className="-mx-1 flex flex-nowrap items-end gap-1 overflow-x-auto overscroll-x-contain px-1 pb-0 sm:mx-0 sm:gap-1.5 sm:px-0">
            {howtoAudiences.map((audience) => {
              const tab = howtoTabFromAudience(audience);
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => goTab(tab)}
                  className={`shrink-0 rounded-t-lg px-3.5 py-2.5 text-base font-semibold transition sm:px-4 ${
                    activeTab === tab
                      ? "relative z-[1] -mb-px border border-slate-200 border-b-white bg-white text-indigo-950 shadow-sm"
                      : "border border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900"
                  }`}
                >
                  {companionHowtoLabel({
                    audience,
                    showAudienceInLabel: howtoShowAudienceInLabel,
                  })}
                </button>
              );
            })}
            {!supervisorViewer ? (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "overview"}
              aria-disabled={partnerTabsLocked}
              onClick={() => tryGoTab("overview")}
              className={matchTabButtonClass(activeTab === "overview", partnerTabsLocked)}
            >
              プロジェクト概要
            </button>
            ) : null}
            {!supervisorViewer &&
            scheduleSettings.planFeatures.clientInfo &&
            (me.role === "PARTNER" || me.role === "ADMIN") ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "clientInfo"}
                aria-disabled={partnerTabsLocked}
                onClick={() => tryGoTab("clientInfo")}
                className={matchTabButtonClass(activeTab === "clientInfo", partnerTabsLocked)}
              >
                クライアント情報
              </button>
            ) : null}
            {!supervisorViewer && scheduleSettings.planFeatures.chat ? (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "chat"}
              aria-disabled={partnerTabsLocked}
              onClick={() => tryGoTab("chat")}
              className={`relative ${matchTabButtonClass(activeTab === "chat", partnerTabsLocked)}`}
            >
              チャット
              {unreadChatCount > 0 && !partnerTabsLocked ? (
                <span className="ml-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1.5 align-middle text-xs font-bold text-white">
                  {unreadChatCount > 99 ? "99+" : unreadChatCount}
                </span>
              ) : null}
            </button>
            ) : null}
            {!supervisorViewer &&
            (scheduleSettings.planFeatures.schedule || scheduleSettings.planFeatures.sessions) ? (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "sessions" || activeTab === "schedule"}
              aria-disabled={partnerTabsLocked}
              onClick={() => tryGoTab("sessions")}
              className={matchTabButtonClass(
                activeTab === "sessions" || activeTab === "schedule",
                partnerTabsLocked,
              )}
            >
              1on1セッション
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
            {me && canShowFtaTab(me, scheduleSettings, supervisorViewer) ? (
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
                {ftaTabLabel(me, scheduleSettings, supervisorViewer)}
              </button>
            ) : null}
            {scheduleSettings.planFeatures.developmentOpportunity ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "developmentOpportunity"}
                onClick={() => goTab("developmentOpportunity")}
                className={`shrink-0 rounded-t-lg px-3.5 py-2.5 text-base font-semibold transition sm:px-4 ${
                  activeTab === "developmentOpportunity"
                    ? "relative z-[1] -mb-px border border-slate-200 border-b-white bg-white text-indigo-950 shadow-sm"
                    : "border border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900"
                }`}
              >
                機会創出
              </button>
            ) : null}
            {scheduleSettings.planFeatures.businessProblem ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "businessProblem"}
                onClick={() => goTab("businessProblem")}
                className={`shrink-0 rounded-t-lg px-3.5 py-2.5 text-base font-semibold transition sm:px-4 ${
                  activeTab === "businessProblem"
                    ? "relative z-[1] -mb-px border border-slate-200 border-b-white bg-white text-indigo-950 shadow-sm"
                    : "border border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900"
                }`}
              >
                業務課題
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
            {scheduleSettings.planFeatures.actionBrakeAnalysis ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "actionBrakeAnalysis"}
                onClick={() => goTab("actionBrakeAnalysis")}
                className={`shrink-0 rounded-t-lg px-3.5 py-2.5 text-base font-semibold transition sm:px-4 ${
                  activeTab === "actionBrakeAnalysis"
                    ? "relative z-[1] -mb-px border border-slate-200 border-b-white bg-white text-indigo-950 shadow-sm"
                    : "border border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900"
                }`}
              >
                行き詰まり分析
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
            (me.role === "ADMIN" ||
              me.role === "ADMIN_ASSISTANT" ||
              me.role === "PARTNER" ||
              supervisorViewer) ? (
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
            {showCoachingIcebreakerTab ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "coachingIcebreaker"}
                onClick={() => tryGoTab("coachingIcebreaker")}
                className={matchTabButtonClass(activeTab === "coachingIcebreaker", false)}
              >
                アイスブレイク
              </button>
            ) : null}
            {showCoachingQuestionsTab ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "coachingQuestions"}
                aria-disabled={coachingQuestionsLocked}
                onClick={() => tryGoTab("coachingQuestions")}
                className={matchTabButtonClass(activeTab === "coachingQuestions", coachingQuestionsLocked)}
              >
                質問リスト
              </button>
            ) : null}
            {showCoachingFormatTab ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "coachingOneOnOneFormat"}
                aria-disabled={coachingFormatLocked}
                onClick={() => tryGoTab("coachingOneOnOneFormat")}
                className={matchTabButtonClass(
                  activeTab === "coachingOneOnOneFormat",
                  coachingFormatLocked,
                )}
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

      {activeTab === "fta" && me && canShowFtaTab(me, scheduleSettings, supervisorViewer) ? (
        me.role === "CLIENT" && scheduleSettings.planFeatures.fta ? (
          <section className="space-y-4 rounded-3xl border border-indigo-100 bg-indigo-50/30 px-3 py-5 sm:px-6 sm:py-8">
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold text-indigo-900">自分FTA</h2>
              <p className="text-base text-indigo-800">
                会社での成長と、自分の人生をつなげます。中心に夢・成し遂げたいこと、周りに価値観、さらに外側に「何を実践するか」のアクションを置きます。
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

      {(activeTab === "sessions" || activeTab === "schedule") &&
      (scheduleSettings.planFeatures.schedule || scheduleSettings.planFeatures.sessions) ? (
      <section id="sessions" className="space-y-8 rounded-3xl border border-indigo-100 bg-indigo-50/40 px-3 py-5 shadow-inner shadow-indigo-100 sm:px-6 sm:py-8">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-indigo-900">1on1セッション</h2>
          <p className="text-base text-indigo-800">
            日程の調整から、実施後の
            {scheduleSettings.companyPlan === "coaching_management_training"
              ? "ロールプレイ評価"
              : me.role === "CLIENT" || me.role === "CLIENT_ADMIN" || me.role === "CLIENT_HR"
                ? "振り返り"
                : me.role === "PARTNER"
                  ? "レポート"
                  : "振り返り・レポート"}
            まで、このタブで進めます。
          </p>
        </div>

        {scheduleSettings.planFeatures.schedule ? (
        <div id="sessions-adjust" className="space-y-5 scroll-mt-24">
          <div className="space-y-1 border-b border-indigo-200/80 pb-3">
            <h3 className="text-xl font-semibold text-indigo-950">調整中</h3>
            <p className="text-sm text-indigo-800">
              担当パートナーが候補日時を提示し、クライアントが回答、担当パートナーが日程を確定する流れです。
            </p>
          </div>

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

          {me.role === "PARTNER" ? (
            <ScheduleProposeForm
              scheduleSettings={{
                slotDurationMinutes: scheduleSettings.slotDurationMinutes,
                slotEarliestHour: scheduleSettings.slotEarliestHour,
                slotLatestHour: scheduleSettings.slotLatestHour,
                allowWeekends: scheduleSettings.allowWeekends,
                timezone: scheduleSettings.timezone,
              }}
              totalSessions={scheduleSettings.totalSessions}
              submitting={proposeSubmitting}
              justSent={proposeJustSent}
              blockedSessionNumbers={blockedProposeSessions}
              defaultSessionNumbers={defaultProposeSessions}
              onSubmit={onProposeTimeRanges}
            />
          ) : null}

          {openNegotiations.some((n) => n.status === "NEEDS_NEW_PROPOSAL") && me.role === "PARTNER" ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              クライアントから別候補の希望がありました（
              {openNegotiations
                .filter((n) => n.status === "NEEDS_NEW_PROPOSAL")
                .map((n) => `第${Math.max(1, n.sessionNumber ?? 1)}回`)
                .join("・")}
              ）。上のフォームで対象の回を選び、新しい時間帯を再提示してください。
            </div>
          ) : null}

          {isClientRole(me.role) &&
          openNegotiations.filter((n) => n.status === "AWAITING_CLIENT_RESPONSE").length > 1 ? (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950">
              <strong>回ごとに候補が分かれています。</strong>
              <span className="ml-1">
                第1回、第2回…の順に、それぞれ都合の良い日時を選んで回答してください。
              </span>
            </div>
          ) : null}

          {isClientRole(me.role)
            ? openNegotiations
                .filter((n) => n.status === "AWAITING_CLIENT_RESPONSE")
                .map((n, idx) => (
                  <div
                    key={n.id}
                    id={
                      idx === 0
                        ? "client-schedule-vote"
                        : `session-vote-${Math.max(1, n.sessionNumber ?? 1)}`
                    }
                  >
                    <ScheduleClientVoteForm
                      partnerName={availability?.partner.displayName ?? "担当パートナー"}
                      slots={n.slots}
                      timezone={scheduleSettings.timezone}
                      responseDeadline={n.responseDeadline}
                      submitting={false}
                      sessionNumber={Math.max(1, n.sessionNumber ?? 1)}
                      onSubmitSelected={(ids) => void onVoteSelected(n, ids)}
                      onRequestAlternative={() => void onRequestAlternative(n)}
                    />
                  </div>
                ))
            : null}

          {me.role === "PARTNER"
            ? openNegotiations
                .filter((n) => n.status === "AWAITING_PARTNER_CONFIRM")
                .map((n) => {
                  const sn = Math.max(1, n.sessionNumber ?? 1);
                  return (
                    <form
                      key={n.id}
                      id={sn === (activeNegotiation?.sessionNumber ?? 0) ? "partner-confirm-section" : `partner-confirm-${sn}`}
                      onSubmit={(e) => void onConfirm(n, e)}
                      className="space-y-3 rounded-2xl border border-amber-200 bg-white px-5 py-4"
                    >
                      <h3 className="text-xl font-semibold text-amber-900">
                        第{sn}回の日程を確定する
                      </h3>
                      <p className="text-base text-amber-800">
                        クライアントが参加可能と回答した日時の中から、1件を選んで日程を確定してください。
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
                        {n.slots
                          .filter((s) => s.clientVote === "YES")
                          .map((slot) => (
                            <option key={slot.id} value={slot.id}>
                              {formatJa(slot.startAt, scheduleSettings.timezone)} 〜{" "}
                              {formatJa(slot.endAt, scheduleSettings.timezone)}
                            </option>
                          ))}
                      </select>
                      <label className="block text-sm text-amber-950">
                        開始時刻の微調整（任意・5分刻み）
                        <p className="mt-1 text-xs font-normal text-amber-900/85">
                          クライアントから希望があった場合、同じ日付の中で開始時刻だけ変更できます。選択後に調整してください。
                        </p>
                        <input
                          name="adjustStartTime"
                          type="time"
                          step={300}
                          className="mt-2 w-full max-w-xs rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                        />
                      </label>
                      <div className="space-y-2">
                        <button type="submit" className="app-btn-amber rounded-lg px-4 py-2.5 text-base">
                          第{sn}回の日程を確定する
                        </button>
                        <p className="text-xs text-amber-900/80">
                          → 双方に {meetingProviderLabel(scheduleSettings.meetingProvider)}{" "}
                          入りの確定メールが届きます。確定後の変更は「変更希望」から。
                        </p>
                      </div>
                    </form>
                  );
                })
            : null}

          {openNegotiations.length === 0 ? (
            <p className="rounded-xl border border-dashed border-indigo-200 bg-white/70 px-4 py-3 text-sm text-indigo-900/80">
              いま進行中の日程調整はありません。下の「実施・振り返り」で各回の予定とフォームを確認できます。
            </p>
          ) : null}

          <details className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <summary className="cursor-pointer text-base font-semibold text-slate-900">
              すべての調整ログ（{negotiations.length}件）
            </summary>
            <div className="mt-3 space-y-3">
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
          </details>
        </div>
        ) : null}

        {scheduleSettings.planFeatures.sessions || scheduleSettings.planFeatures.schedule ? (
        <div id="sessions-review" className="space-y-4 scroll-mt-24">
          <div className="space-y-1 border-b border-indigo-200/80 pb-3">
            <h3 className="text-xl font-semibold text-indigo-950">実施・振り返り</h3>
            <p className="text-sm text-indigo-800">
              セッション計画（全 {scheduleSettings.totalSessions} 回）。各回のガイドラインと振り返りフォームはいつでも確認できます。
              振り返り・レポートの入力はセッション終了後です。
            </p>
          </div>

          <ul className="space-y-2 rounded-2xl border border-indigo-200 bg-white p-3 sm:p-4">
            {sessionPlans.map((planRow) => {
              const apiRow =
                sessionRows.find((r) => r.sessionNumber === planRow.index) ??
                ({
                  matchId,
                  sessionNumber: planRow.index,
                  confirmed: Boolean(planRow.slot),
                  round: null,
                  startAt: planRow.slot?.startAt ?? null,
                  endAt: planRow.slot?.endAt ?? null,
                  negotiationId: null,
                  openable: false,
                  postSessionOpenable: false,
                  hasClientFeedback: false,
                  hasPartnerReport: false,
                } as SessionPlanApiRow);
              const row = {
                ...apiRow,
                startAt: apiRow.startAt ?? planRow.slot?.startAt ?? null,
                endAt: apiRow.endAt ?? planRow.slot?.endAt ?? null,
                confirmed: apiRow.confirmed || Boolean(planRow.slot),
              };
              const dateLabel =
                row.startAt && row.endAt
                  ? `${formatJa(row.startAt, scheduleSettings.timezone)} 〜 ${formatJa(row.endAt, scheduleSettings.timezone)}`
                  : "未確定";
              const isAbandoned = !!row.abandonment;
              const isRescheduling = isReschedulingSession(row.sessionNumber);
              const eligibility = getRescheduleEligibility(row.sessionNumber, planRow.slot);
              const showAbandonReasonToClient =
                isAbandoned &&
                (me.role === "PARTNER" || me.role === "ADMIN" || me.role === "ADMIN_ASSISTANT");
              const abandonReasonLabel =
                showAbandonReasonToClient && row.abandonment
                  ? row.abandonment.reason === "no_show"
                    ? "クライアントが連絡なく参加しなかった"
                    : "クライアントが24時間前を過ぎてキャンセルした"
                  : null;
              // ステータスバッジ用。壁時計との比較のため render 時の現在時刻を使う。
              // eslint-disable-next-line react-hooks/purity -- session status vs wall clock
              const now = Date.now();
              const endMs = row.endAt ? new Date(row.endAt).getTime() : null;
              const isPast = endMs !== null && endMs <= now;
              const statusBadge: { label: string; className: string } | null = isAbandoned
                ? { label: "未実施・消化", className: "border-red-300 bg-red-50 text-red-800" }
                : !row.startAt
                  ? { label: "未確定", className: "border-slate-300 bg-white text-slate-700" }
                  : isPast
                    ? { label: "実施済", className: "border-emerald-300 bg-emerald-50 text-emerald-800" }
                    : { label: "予定", className: "border-indigo-300 bg-indigo-50 text-indigo-800" };
              const filledBadges: string[] = [];
              if (
                !isAbandoned &&
                row.postSessionOpenable &&
                scheduleSettings.planFeatures.sessions
              ) {
                const coachingPlan = scheduleSettings.companyPlan === "coaching_management_training";
                const isRoleplayRow = coachingPlan && row.isRoleplaySession !== false;
                if (me.role === "CLIENT" || me.role === "CLIENT_ADMIN" || me.role === "CLIENT_HR" || me.role === "ADMIN" || me.role === "ADMIN_ASSISTANT") {
                  filledBadges.push(
                    row.hasClientFeedback
                      ? isRoleplayRow ? "自己評価済" : coachingPlan ? "振り返り済" : "クライアント振り返り済"
                      : isRoleplayRow ? "自己評価未入力" : coachingPlan ? "振り返り未入力" : "クライアント未提出",
                  );
                }
                if (me.role === "PARTNER" || me.role === "ADMIN" || me.role === "ADMIN_ASSISTANT") {
                  filledBadges.push(
                    row.hasPartnerReport
                      ? isRoleplayRow ? "パートナー評価済" : coachingPlan ? "レポート済" : "パートナーレポート済"
                      : isRoleplayRow ? "パートナー評価未入力" : coachingPlan ? "レポート未入力" : "パートナー未提出",
                  );
                }
              }
              const canOpen = scheduleSettings.planFeatures.sessions;
              const openLabel = !row.postSessionOpenable
                ? "詳細を開く"
                : scheduleSettings.companyPlan === "coaching_management_training"
                  ? "ロールプレイ評価を開く"
                  : me.role === "CLIENT" || me.role === "CLIENT_ADMIN" || me.role === "CLIENT_HR"
                    ? "振り返りを開く"
                    : me.role === "PARTNER"
                      ? "レポートを開く"
                      : "詳細を開く";
              return (
                <li
                  key={row.sessionNumber}
                  className={`rounded-xl border px-3 py-2 ${
                    isAbandoned
                      ? "border-red-200 bg-red-50/60"
                      : "border-indigo-100 bg-indigo-50/40"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {statusBadge ? (
                          <span
                            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${statusBadge.className}`}
                          >
                            {statusBadge.label}
                          </span>
                        ) : null}
                        <p className="text-base font-semibold text-indigo-950">
                          {row.sessionNumber}回目
                          <span className="ml-2 text-sm font-normal text-indigo-900/85">{dateLabel}</span>
                          {isRescheduling ? (
                            <span className="ml-2 inline-flex items-center rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 align-middle">
                              再調整中
                            </span>
                          ) : null}
                        </p>
                      </div>
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
                              {meetingProviderLabel(resolveSessionMeetingProvider(row))}: {row.zoomUrl}
                            </a>
                          ) : null}
                          {resolveSessionMeetingProvider(row) === "zoom" && row.zoomMeetingId ? (
                            <span className="ml-2">ID: {row.zoomMeetingId}</span>
                          ) : null}
                          {resolveSessionMeetingProvider(row) === "zoom" && row.zoomPass ? (
                            <span className="ml-2">パス: {row.zoomPass}</span>
                          ) : null}
                        </p>
                      ) : null}
                      {filledBadges.length > 0 ? (
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
                      ) : null}
                      {scheduleSettings.planFeatures.schedule && !eligibility.can && !isRescheduling ? (
                        <p className="mt-1 text-sm font-medium text-amber-800">
                          この日程は変更不可: {eligibility.reason}（日程変更は開始24時間前まで可能です）
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {canOpen ? (
                        <Link
                          href={`/match/${matchId}/sessions/${row.sessionNumber}`}
                          className="app-btn-primary rounded-md px-3 py-1.5 text-sm no-underline"
                        >
                          {openLabel}
                        </Link>
                      ) : null}
                      {scheduleSettings.planFeatures.schedule ? (
                        isRescheduling ? (
                          <span className="rounded-md border border-amber-300 bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-900">
                            再調整中
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={!eligibility.can || rescheduleSubmittingSession !== null}
                            onClick={() => void onRequestReschedule(row.sessionNumber)}
                            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100 active:translate-y-[1px] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {rescheduleSubmittingSession === row.sessionNumber ? "送信中…" : "変更希望"}
                          </button>
                        )
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {scheduleSettings.planFeatures.schedule ? (
            <>
              <p className="text-sm text-slate-600">
                日程変更は開始24時間前まで可能です。変更希望を送ると、相手へ通知され、パートナーが再提案できます。
              </p>
              <p className="text-sm font-medium text-amber-800">
                開始24時間前を過ぎての変更はできません。体調不良などの場合は、サポートデスクに連絡ください。
              </p>
            </>
          ) : null}
        </div>
        ) : null}
      </section>
      ) : null}

      {activeTab === "skillCheck" && scheduleSettings.planFeatures.skillCheck ? (
        <SkillCheckPanel matchId={matchId} />
      ) : null}

      {activeTab === "developmentOpportunity" && scheduleSettings.planFeatures.developmentOpportunity ? (
        <DevelopmentOpportunityPanel matchId={matchId} />
      ) : null}

      {activeTab === "businessProblem" && scheduleSettings.planFeatures.businessProblem ? (
        <BusinessProblemPanel matchId={matchId} />
      ) : null}

      {activeTab === "pdca" && scheduleSettings.planFeatures.pdca ? (
        <PdcaPanel
          matchId={matchId}
          onOpenActionBrake={(pdcaEntryId) => {
            setBrakeFromPdcaId(pdcaEntryId ?? null);
            goTab("actionBrakeAnalysis");
          }}
        />
      ) : null}

      {activeTab === "actionBrakeAnalysis" && scheduleSettings.planFeatures.actionBrakeAnalysis ? (
        <ActionBrakePanel matchId={matchId} initialPdcaEntryId={brakeFromPdcaId} />
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

      {howtoAudiences.map((audience) => {
        const tab = howtoTabFromAudience(audience);
        if (activeTab !== tab) return null;
        return <CompanionHowtoFrame key={tab} audience={audience} />;
      })}

      {activeTab === "coachingQuestions" && showCoachingQuestionsTab && !coachingQuestionsLocked ? (
        <CoachingQuestionsPanel matchId={matchId} />
      ) : null}

      {activeTab === "coachingIcebreaker" && showCoachingIcebreakerTab ? (
        <CoachingIcebreakerPanel matchId={matchId} />
      ) : null}

      {activeTab === "coachingOneOnOneFormat" && showCoachingFormatTab && !coachingFormatLocked ? (
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
