"use client";

import {
  ScheduleConfirmedCard,
  SlotProposalCard,
  VoteSummaryCard,
} from "@/components/scheduling-chat-blocks";
import { PartnerChatTemplates } from "@/components/partner-chat-templates";
import { FtaViewer } from "@/components/fta-chart";
import type { FtaChart } from "@/lib/fta";
import { SCHEDULE_RULES_CLIENT, SCHEDULE_RULES_PARTNER } from "@/lib/scheduling-rules-copy";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";

type Role = "ADMIN" | "PARTNER" | "CLIENT" | "CLIENT_ADMIN";

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
};

type MemberNotificationRow = {
  id: string;
  type:
    | "CHAT"
    | "SLOT_PROPOSED"
    | "SLOT_VOTED"
    | "SLOT_CONFIRMED"
    | "RESCHEDULE"
    | "INVOICE_CONFIRMED"
    | "INVOICE_RETURNED";
  matchId: string | null;
  sessionNumber: number | null;
  summary: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

type MatchTab = "chat" | "schedule" | "fta" | "sessions" | "notifications";

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

const statusLabel: Record<NegotiationRow["status"], string> = {
  AWAITING_CLIENT_RESPONSE: "クライアント回答待ち",
  NEEDS_NEW_PROPOSAL: "すべて×／再提案が必要",
  AWAITING_PARTNER_CONFIRM: "パートナーによる確定待ち",
  CONFIRMED: "確定済み",
  SUPERSEDED: "再提案により破棄",
};

const roleBadge: Record<Role, string> = {
  ADMIN: "管理者",
  PARTNER: "パートナー",
  CLIENT: "クライアント",
  CLIENT_ADMIN: "クライアント管理者",
};

function formatJa(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ja-JP", {
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

function msUntilStart(iso: string) {
  const start = new Date(iso).getTime();
  if (!Number.isFinite(start)) return Number.NaN;
  return start - Date.now();
}

export function MatchWorkspace({ matchId }: { matchId: string }) {
  const router = useRouter();
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
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rescheduleSubmittingSession, setRescheduleSubmittingSession] = useState<number | null>(null);
  const [clientFta, setClientFta] = useState<MatchFtaPayload | null>(null);
  const [availability, setAvailability] = useState<AvailabilityPayload | null>(null);
  const [sessionRows, setSessionRows] = useState<SessionPlanApiRow[]>([]);
  const [activeTab, setActiveTab] = useState<MatchTab>("chat");
  const [proposeSubmitting, setProposeSubmitting] = useState(false);
  const [proposeJustSent, setProposeJustSent] = useState(false);
  const [voteSubmittingForSlot, setVoteSubmittingForSlot] = useState<string | null>(null);
  const [memberNotifications, setMemberNotifications] = useState<MemberNotificationRow[]>([]);
  const [memberUnreadCount, setMemberUnreadCount] = useState(0);
  const [chatLastReadAt, setChatLastReadAt] = useState<number>(0);
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
      setError("土日は候補日として選べません。カレンダーから平日を選んでください（管理者が土日を許可するまで選択できません）。");
    }
  }

  const load = useCallback(async () => {
    setError(null);
    const [mRes, gRes, nRes, sRes] = await Promise.all([
      fetch("/api/me", { cache: "no-store" }),
      fetch(`/api/matches/${matchId}/messages`, { cache: "no-store" }),
      fetch(`/api/matches/${matchId}/negotiations`, { cache: "no-store" }),
      fetch("/api/settings", { cache: "no-store" }),
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

  const loadSessions = useCallback(async () => {
    const res = await fetch(`/api/matches/${matchId}/sessions`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (res.ok && Array.isArray(json?.sessions)) {
      setSessionRows(json.sessions as SessionPlanApiRow[]);
    }
  }, [matchId]);

  const loadMemberNotifications = useCallback(async () => {
    const res = await fetch(`/api/me/notifications`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (res.ok && Array.isArray(json?.notifications)) {
      setMemberNotifications(json.notifications as MemberNotificationRow[]);
      setMemberUnreadCount(typeof json.unreadCount === "number" ? json.unreadCount : 0);
    }
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    const res = await fetch(`/api/me/notifications/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    if (res.ok) {
      setMemberNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
      setMemberUnreadCount(0);
    }
  }, []);

  const markOneNotificationRead = useCallback(async (id: string) => {
    setMemberNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)));
    setMemberUnreadCount((c) => Math.max(0, c - 1));
    await fetch(`/api/me/notifications/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => null);
  }, []);

  const openMemberNotificationTarget = useCallback(
    (link: string, id: string) => {
      void markOneNotificationRead(id);
      const hashPart = link.includes("#") ? (link.split("#")[1] ?? "") : "";
      const pathOnly = (link.split("#")[0] ?? link).trim();
      if (!pathOnly.startsWith("/")) {
        router.push(link);
        return;
      }
      const subPath = pathOnly.startsWith(`/match/${matchId}/`) && pathOnly !== `/match/${matchId}`;
      if (subPath) {
        router.push(link);
        return;
      }
      const isThisMatchRoom = pathOnly === `/match/${matchId}`;
      if (isThisMatchRoom) {
        if (hashPart === "schedule") {
          setActiveTab("schedule");
          window.setTimeout(() => {
            document.getElementById("partner-confirm-section")?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }, 80);
        } else {
          setActiveTab("chat");
        }
        return;
      }
      router.push(link);
    },
    [markOneNotificationRead, matchId, router],
  );

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

  useEffect(() => {
    void load();
    void loadClientFta();
    void loadAvailability();
    void loadSessions();
    void loadMemberNotifications();
  }, [load, loadClientFta, loadAvailability, loadSessions, loadMemberNotifications]);

  useEffect(() => {
    // 軽量ポーリング: チャット反映を高速化（1.2 秒）
    const id = window.setInterval(() => {
      void load();
    }, 1200);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    // セッション一覧 / 通知バッジは少し緩めに更新
    const id = window.setInterval(() => {
      void loadSessions();
      void loadMemberNotifications();
    }, 3000);
    return () => window.clearInterval(id);
  }, [loadSessions, loadMemberNotifications]);

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

  const unreadChatCount = useMemo(() => {
    if (!me) return 0;
    return messages.filter((m) => {
      if (m.sender.role === "ADMIN") return false;
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
        setError(`${i} 件目: 土日は候補日として指定できません（管理者設定で許可可能）。`);
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
    if (me?.role !== "CLIENT" && me?.role !== "CLIENT_ADMIN") return;

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
    if (me?.role !== "PARTNER" && me?.role !== "CLIENT" && me?.role !== "CLIENT_ADMIN")
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
      <div className="px-6 py-10 text-sm text-zinc-600">
        読込中…
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-1 py-4 sm:gap-12 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 pb-4 sm:gap-4 sm:pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Match Detail</p>
          <p className="text-sm text-zinc-600 sm:text-base">{withHonorificSan(me.displayName)} として表示中（メールなどは公開されません）</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
            <span className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-800">MATCH #{matchId}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
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

      {availability ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/50 px-5 py-4 shadow-sm">
          <h2 className="text-lg font-semibold text-emerald-900">お互いの対応可能時間</h2>
          <p className="mt-1 text-sm text-emerald-900/80">
            アサイン用に登録された参考情報です。実際の日程はチャット下の「日程調整」で個別調整してください。
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-white px-4 py-3">
              <p className="text-sm font-semibold text-emerald-900">パートナー：{withHonorificSan(availability.partner.displayName)}</p>
              {availability.partner.labels.length === 0 ? (
                <p className="mt-1.5 text-sm text-zinc-500">未設定</p>
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
            <div className="rounded-xl border border-emerald-200 bg-white px-4 py-3">
              <p className="text-sm font-semibold text-emerald-900">クライアント：{withHonorificSan(availability.client.displayName)}</p>
              {availability.client.labels.length === 0 ? (
                <p className="mt-1.5 text-sm text-zinc-500">未設定</p>
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
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("chat")}
          className={`relative rounded-lg px-3 py-1.5 text-sm font-semibold ${activeTab === "chat" ? "bg-indigo-700 text-white" : "border border-zinc-300 bg-white text-zinc-700"}`}
        >
          チャット
          {unreadChatCount > 0 ? (
            <span className="ml-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white">
              {unreadChatCount > 99 ? "99+" : unreadChatCount}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("schedule")}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${activeTab === "schedule" ? "bg-indigo-700 text-white" : "border border-zinc-300 bg-white text-zinc-700"}`}
        >
          日程調整
        </button>
        {me.role === "PARTNER" || me.role === "ADMIN" ? (
          <button
            type="button"
            onClick={() => setActiveTab("fta")}
            className={`rounded-lg px-4 py-2 text-base font-semibold ${activeTab === "fta" ? "bg-indigo-700 text-white" : "border border-zinc-300 bg-white text-zinc-700"}`}
          >
            クライアント自分FTA
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setActiveTab("sessions")}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${activeTab === "sessions" ? "bg-indigo-700 text-white" : "border border-zinc-300 bg-white text-zinc-700"}`}
        >
          1on1セッション
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab("notifications");
            void markAllNotificationsRead();
          }}
          className={`relative rounded-lg px-3 py-1.5 text-sm font-semibold ${activeTab === "notifications" ? "bg-indigo-700 text-white" : "border border-zinc-300 bg-white text-zinc-700"}`}
        >
          通知
          {memberUnreadCount > 0 ? (
            <span className="ml-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white">
              {memberUnreadCount > 99 ? "99+" : memberUnreadCount}
            </span>
          ) : null}
        </button>
      </div>

      {activeTab === "chat" ? (
      <section className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold">チャット</h2>
        </div>
        {me.role === "CLIENT" || me.role === "CLIENT_ADMIN" ? (
          <details
            open
            className="rounded-2xl border border-indigo-200 bg-white px-4 py-3 shadow-sm open:shadow-md"
          >
            <summary className="cursor-pointer text-base font-semibold text-indigo-950">
              日程調整機能の使い方（最初にお読みください）
            </summary>
            <pre className="mt-3 max-h-[min(60vh,24rem)] overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-indigo-950">
              {SCHEDULE_RULES_CLIENT}
            </pre>
          </details>
        ) : null}
        <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs">
          {messages.map((msg) => {
            const ts = new Date(msg.createdAt).valueOf() || 0;
            const isUnread =
              ts > chatLastReadAt &&
              msg.sender.role !== "ADMIN" &&
              me?.role !== msg.sender.role;
            const proposalNegId =
              msg.kind === "SLOT_PROPOSAL"
                ? ((msg.payload as { negotiationId?: string })?.negotiationId ?? null)
                : null;
            const proposalNeg = proposalNegId
              ? negotiations.find((n) => n.id === proposalNegId)
              : null;
            const chatVoteCtx =
              msg.kind === "SLOT_PROPOSAL" &&
              (me?.role === "CLIENT" || me?.role === "CLIENT_ADMIN") &&
              proposalNeg?.status === "AWAITING_CLIENT_RESPONSE"
                ? {
                    canVote: true as const,
                    voteForSlot: (slotId: string) =>
                      proposalNeg.slots.find((s) => s.id === slotId)?.clientVote ?? null,
                    onVote: onChatVote,
                    pendingSlotId: voteSubmittingForSlot,
                  }
                : undefined;
            const baseClass =
              msg.kind === "SLOT_PROPOSAL"
                ? "rounded-xl border border-indigo-100 bg-indigo-50/35 px-3 py-2 text-sm text-zinc-900"
                : msg.kind === "SCHEDULE_CONFIRMED"
                  ? "rounded-xl border border-emerald-100 bg-emerald-50/35 px-3 py-2 text-sm text-zinc-900"
                  : msg.kind === "VOTE_SUMMARY"
                    ? "rounded-xl border border-violet-100 bg-violet-50/40 px-3 py-2 text-sm text-zinc-900"
                    : "rounded-xl bg-zinc-50 px-3 py-2 text-sm text-zinc-900";
            return (
              <article
                key={msg.id}
                className={`${baseClass} ${isUnread ? "ring-2 ring-amber-300 shadow-md shadow-amber-100" : ""}`}
              >
                <div className="text-xs uppercase tracking-wide text-zinc-500">
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
                    <span className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] tracking-normal text-violet-900">
                      回答
                    </span>
                  ) : null}
                </div>

                {msg.kind === "SLOT_PROPOSAL" ? (
                  <div className="mt-2 space-y-2">
                    <SlotProposalCard
                      payload={msg.payload}
                      voteContext={chatVoteCtx}
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
                        setActiveTab("schedule");
                        // 少し遅らせて該当セクションへスクロール
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

                <div className="mt-2 text-[11px] text-zinc-400">{formatJa(msg.createdAt)}</div>
              </article>
            );
          })}
          {messages.length === 0 ? (
            <p className="text-sm text-zinc-500">まだメッセージがありません。</p>
          ) : null}
        </div>
        <form onSubmit={onSendChat} className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
          <label className="text-base font-medium">
            メッセージ送信
            <textarea
              name="body"
              rows={3}
              placeholder="運用ごとのメモ、候補補足など"
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base"
            />
          </label>
          <button
            type="submit"
            className="self-start rounded-lg bg-indigo-700 px-4 py-2.5 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-800 active:translate-y-[1px] active:scale-[0.98]"
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
          {(me.role === "PARTNER" || me.role === "ADMIN") ? (
            <details className="rounded-2xl border border-indigo-200 bg-white px-4 py-3 shadow-sm open:shadow-md">
              <summary className="cursor-pointer text-base font-semibold text-indigo-950">
                パートナー向け：日程調整機能の使い方（最初にお読みください）
              </summary>
              <pre className="mt-3 max-h-[min(70vh,28rem)] overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-indigo-950">
                {SCHEDULE_RULES_PARTNER}
              </pre>
            </details>
          ) : null}
          {(me.role === "CLIENT" || me.role === "CLIENT_ADMIN" || me.role === "ADMIN") ? (
            <details className="rounded-2xl border border-indigo-200 bg-white px-4 py-3 shadow-sm open:shadow-md">
              <summary className="cursor-pointer text-base font-semibold text-indigo-950">
                クライアント向け：日程調整機能の使い方（最初にお読みください）
              </summary>
              <pre className="mt-3 max-h-[min(70vh,28rem)] overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-indigo-950">
                {SCHEDULE_RULES_CLIENT}
              </pre>
            </details>
          ) : null}
        </div>
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-indigo-900">日程調整</h2>
          <p className="text-base text-indigo-800">
            ○／×モデルでの候補提示 → 回答 → （必要なら再提案） → 確定。この画面で状態を確認します。
          </p>
        </div>
        <div className="space-y-3 rounded-2xl border border-indigo-200 bg-white px-5 py-4">
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
                  ? { label: "未確定", className: "border-zinc-300 bg-white text-zinc-700" }
                  : isPast
                    ? { label: "実施済", className: "border-emerald-300 bg-emerald-50 text-emerald-800" }
                    : { label: "予定", className: "border-indigo-300 bg-indigo-50 text-indigo-800" };
              return (
                <li key={row.index} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
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
                        {row.slot ? `${formatJa(row.slot.startAt)} 〜 ${formatJa(row.slot.endAt)}` : "未確定"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/match/${matchId}/sessions/${row.index}`}
                        className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-900 no-underline shadow-sm transition hover:bg-indigo-100"
                      >
                        {me.role === "CLIENT" || me.role === "CLIENT_ADMIN"
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
                    <p className="mt-1 text-xs text-zinc-700">
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
          <p className="text-sm text-zinc-600">日程変更は開始24時間前まで可能です。変更希望を送ると、相手へ通知され、パートナーが再提案できます。</p>
          <p className="text-sm font-medium text-amber-800">開始24時間前を過ぎての変更はできません。体調不良などの場合は、サポートデスクに連絡ください。</p>
        </div>

        {me.role === "PARTNER" ? (
          <form onSubmit={onPropose} className="space-y-5 rounded-2xl border border-zinc-200 bg-white px-5 py-4">
            {proposeJustSent ? (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
                ✓ 送信完了：候補をクライアントに通知しました。フォームはクリアされています。
              </div>
            ) : null}
            <div>
              <h3 className="text-xl font-semibold">候補を提示（開始時刻のみ・3〜5件）</h3>
              <p className="mt-1 text-xs text-zinc-600">
                選択可能な時間帯：{String(scheduleSettings.slotEarliestHour).padStart(2, "0")}:00〜{String(scheduleSettings.slotLatestHour).padStart(2, "0")}:00
                {scheduleSettings.allowWeekends ? "（土日も可）" : "（土日不可）"}
              </p>
              <label className="mt-3 block max-w-xs text-base font-medium text-zinc-800">
                何回目の日程調整か
                <select
                  name="sessionNumber"
                  defaultValue={1}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-base"
                >
                  {Array.from({ length: Math.max(1, scheduleSettings.totalSessions) }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} 回目
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-1 text-base text-zinc-600">
                終了時刻は管理者が設定した枠（現在{" "}
                <strong className="text-indigo-800">{scheduleSettings.slotDurationMinutes} 分</strong>、TZ{" "}
                {scheduleSettings.timezone}）から自動で付きます。
              </p>
              <p className="mt-1 text-sm text-zinc-500">開始時刻は{scheduleSettings.slotDurationMinutes}分単位で選んでください。</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3].map((index) => (
                <fieldset key={index} className="space-y-2 rounded-xl border border-dashed border-zinc-300 p-4">
                  <legend className="text-sm font-medium">候補 {index}</legend>
                  <label className="block text-xs uppercase text-zinc-500">
                    日付
                    <input
                      name={`startDate${index}`}
                      type="date"
                      required
                      onChange={onProposeDateInputChange}
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1"
                    />
                  </label>
                  <label className="block text-xs uppercase text-zinc-500">
                    時刻（{scheduleSettings.slotDurationMinutes}分刻み）
                    <select
                      name={`startTime${index}`}
                      required
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1"
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
              <fieldset className="space-y-2 rounded-xl border border-dashed border-zinc-200 p-4 text-sm text-zinc-500 md:col-span-2">
                <legend className="text-sm font-medium text-zinc-700">4〜5件目は任意（未入力でも可）</legend>
                <div className="grid gap-3 md:grid-cols-2">
                  {[4, 5].map((index) => (
                    <div key={index} className="space-y-2 rounded-lg border border-zinc-100 p-3">
                      <p className="text-xs font-semibold uppercase text-zinc-500">任意 {index}</p>
                      <input
                        name={`startDate${index}`}
                        type="date"
                        onChange={onProposeDateInputChange}
                        className="w-full rounded-md border border-zinc-300 px-2 py-1"
                      />
                      <select
                        name={`startTime${index}`}
                        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1"
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
            <button
              type="submit"
              disabled={proposeSubmitting}
              className="rounded-lg bg-indigo-700 px-4 py-2.5 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-800 active:translate-y-[1px] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {proposeSubmitting ? "送信中…" : "送信（3〜5件）"}
            </button>
          </form>
        ) : null}

        {activeNegotiation?.status === "NEEDS_NEW_PROPOSAL" && me.role === "PARTNER" ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            クライアントが全候補に「×」でした。上のフォームから、新しい時間帯セットを再提案してください。
          </div>
        ) : null}

        {activeNegotiation && activeNegotiation.status === "AWAITING_CLIENT_RESPONSE" && (me.role === "CLIENT" || me.role === "CLIENT_ADMIN") ? (
          <form onSubmit={onVote} className="space-y-4 rounded-2xl border border-violet-200 bg-white px-5 py-4">
            <h3 className="text-xl font-semibold text-violet-900">ご希望の時間をすべて回答</h3>
            <p className="text-base text-violet-800">参加できる候補は「○」。どれにも入れられないときはすべて「×」を選んでください。</p>
            <div className="space-y-3">
              {activeNegotiation.slots.map((slot) => (
                <div key={slot.id} className="rounded-xl border border-violet-100 bg-violet-50/70 px-3 py-2">
                  <p className="text-sm font-medium text-violet-900">
                    {formatJa(slot.startAt)}〜{formatJa(slot.endAt)}
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
            <button
              type="submit"
              className="rounded-lg bg-violet-700 px-4 py-2.5 text-base font-semibold text-white shadow-sm transition hover:bg-violet-800 active:translate-y-[1px] active:scale-[0.98]"
            >
              送信
            </button>
          </form>
        ) : null}

        {activeNegotiation && activeNegotiation.status === "AWAITING_PARTNER_CONFIRM" && me.role === "PARTNER" ? (
          <form
            id="partner-confirm-section"
            onSubmit={onConfirm}
            className="space-y-3 rounded-2xl border border-amber-200 bg-white px-5 py-4"
          >
            <h3 className="text-xl font-semibold text-amber-900">パートナー確定操作</h3>
            <p className="text-base text-amber-800">
              「○」が複数ある場合のみ、ご希望時間をひとつ選んで確定してください。
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
                    {formatJa(slot.startAt)} 〜 {formatJa(slot.endAt)}
                  </option>
                ))}
            </select>
            <button
              type="submit"
              className="rounded-lg bg-amber-600 px-4 py-2.5 text-base font-semibold text-white shadow-sm transition hover:bg-amber-700 active:translate-y-[1px] active:scale-[0.98]"
            >
              選択した候補を確定する
            </button>
          </form>
        ) : null}

        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-zinc-900">すべての調整ログ</h3>
          <ul className="space-y-4">
            {negotiations.map((neg) => (
              <li key={neg.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-2">
                  <p className="text-sm font-semibold text-zinc-900">
                    {Math.max(1, neg.sessionNumber ?? 1)}回目 / Round #{neg.round} — {statusLabel[neg.status]}
                  </p>
                  <span className="text-xs uppercase tracking-wide text-zinc-400">ID {neg.id}</span>
                </div>
                <table className="mt-4 w-full text-left text-xs text-zinc-600">
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
                      <tr key={slot.id} className="border-t border-zinc-50">
                        <td className="py-2 pr-2">{formatJa(slot.startAt)}</td>
                        <td className="py-2 pr-2">{formatJa(slot.endAt)}</td>
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
            <p className="text-sm text-zinc-600">調整ログはありません。</p>
          ) : null}
        </div>
      </section>
      ) : null}

      {activeTab === "fta" && (me.role === "PARTNER" || me.role === "ADMIN") ? (
        <section className="space-y-4 rounded-3xl border border-sky-100 bg-sky-50/35 px-3 py-5 sm:px-6 sm:py-8">
          <h2 className="text-2xl font-semibold text-sky-900">クライアントの自分FTA</h2>
          {clientFta?.targetRole === "CLIENT" && clientFta.chart ? (
            <div className="space-y-3 rounded-2xl border border-sky-200 bg-white px-5 py-4">
              <h3 className="text-xl font-semibold text-sky-900">{withHonorificSan(clientFta.targetName)}の自分FTA</h3>
              <p className="text-base text-sky-800">鍵マークの項目は非公開です。</p>
              <FtaViewer chart={clientFta.chart as FtaChart} />
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-sky-200 bg-white px-4 py-6 text-base text-sky-800">
              まだ表示できる自分FTAがありません。
            </p>
          )}
        </section>
      ) : null}

      {activeTab === "sessions" ? (
        <section className="space-y-4 rounded-3xl border border-violet-100 bg-violet-50/30 px-3 py-5 sm:px-6 sm:py-8">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold text-violet-900">1on1セッション</h2>
            <p className="text-base text-violet-800">
              セッション計画（全 {scheduleSettings.totalSessions} 回）。各回をタップすると、その回の{me.role === "CLIENT" || me.role === "CLIENT_ADMIN" ? "振り返りフォーム" : me.role === "PARTNER" ? "レポート" : "クライアント振り返り＆パートナーレポート"}を開けます。
              <br />
              <span className="text-sm">
                未来の回は開けません。直近で実施予定の回だけ、セッション中に開くことができます。
              </span>
            </p>
          </div>
          <ul className="space-y-2 rounded-2xl border border-violet-200 bg-white p-3 sm:p-4">
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
                ? `${formatJa(row.startAt)} 〜 ${formatJa(row.endAt)}`
                : "未確定";
              const filledBadges: string[] = [];
              if (me.role === "CLIENT" || me.role === "CLIENT_ADMIN" || me.role === "ADMIN") {
                filledBadges.push(row.hasClientFeedback ? "クライアント振り返り済" : "クライアント未提出");
              }
              if (me.role === "PARTNER" || me.role === "ADMIN") {
                filledBadges.push(row.hasPartnerReport ? "パートナーレポート済" : "パートナー未提出");
              }
              return (
                <li
                  key={row.sessionNumber}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-100 bg-violet-50/40 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-violet-950">
                      {row.sessionNumber}回目
                      <span className="ml-2 text-sm font-normal text-violet-900/85">{dateLabel}</span>
                    </p>
                    {(row.zoomUrl || row.zoomMeetingId || row.zoomPass) ? (
                      <p className="mt-1 text-xs text-violet-900/85">
                        {row.zoomUrl ? (
                          <a
                            href={row.zoomUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-violet-800 underline underline-offset-2"
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
                          className={`rounded-full border px-2 py-0.5 ${b.endsWith("済") ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-zinc-200 bg-white text-zinc-600"}`}
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
                        className="rounded-md bg-violet-700 px-3 py-1.5 text-sm font-semibold !text-white no-underline shadow-sm transition hover:bg-violet-800"
                      >
                        開く
                      </Link>
                    ) : (
                      <span className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-500">
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

      {activeTab === "notifications" ? (
        <section className="space-y-3 rounded-3xl border border-rose-100 bg-rose-50/30 px-3 py-5 sm:px-6 sm:py-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-rose-900">通知</h2>
              <p className="text-base text-rose-800/90">
                相手のアクション（チャット・日程提案・回答・確定・変更希望）を時系列で表示します。
              </p>
            </div>
            <button
              type="button"
              onClick={() => void markAllNotificationsRead()}
              className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-sm font-semibold text-rose-900 hover:bg-rose-50"
            >
              すべて既読に
            </button>
          </div>
          <ul className="space-y-2">
            {memberNotifications.length === 0 ? (
              <li className="rounded-xl border border-dashed border-rose-200 bg-white px-4 py-6 text-sm text-rose-800">
                通知はまだありません。
              </li>
            ) : null}
            {memberNotifications.map((n) => {
              const isUnread = !n.readAt;
              return (
                <li
                  key={n.id}
                  className={`rounded-xl border px-3 py-2 shadow-xs ${isUnread ? "border-rose-300 bg-rose-50/80" : "border-zinc-200 bg-white"}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-wide text-rose-900/80">
                      {labelForNotificationType(n.type)} · {formatJa(n.createdAt)}
                    </span>
                    {isUnread ? (
                      <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white">未読</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-zinc-900">{n.summary}</p>
                  {n.link ? (
                    <button
                      type="button"
                      onClick={() => openMemberNotificationTarget(n.link!, n.id)}
                      className="mt-2 inline-block text-left text-sm font-semibold text-indigo-700 underline-offset-4 hover:underline"
                    >
                      該当ページを開く →
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function labelForNotificationType(type: MemberNotificationRow["type"]) {
  switch (type) {
    case "CHAT":
      return "💬 チャット";
    case "SLOT_PROPOSED":
      return "📅 日程候補";
    case "SLOT_VOTED":
      return "🟢 日程回答";
    case "SLOT_CONFIRMED":
      return "✅ 日程確定";
    case "RESCHEDULE":
      return "🔁 変更希望";
    case "INVOICE_CONFIRMED":
      return "🧾 請求書 確定";
    case "INVOICE_RETURNED":
      return "🧾 請求書 差し戻し";
    default:
      return type;
  }
}
