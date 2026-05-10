"use client";

import { ScheduleConfirmedCard, SlotProposalCard } from "@/components/scheduling-chat-blocks";
import { FtaViewer } from "@/components/fta-chart";
import type { FtaChart } from "@/lib/fta";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Role = "ADMIN" | "PARTNER" | "CLIENT";

type Me = {
  id: string;
  role: Role;
  displayName: string;
};

type MessageKindName = "STANDARD" | "SLOT_PROPOSAL" | "SCHEDULE_CONFIRMED";

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
};

type MatchFtaPayload = {
  targetRole: "CLIENT" | "NONE";
  targetName: string;
  chart: unknown | null;
};
type MatchTab = "chat" | "schedule" | "fta";

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
  const [me, setMe] = useState<Me | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [negotiations, setNegotiations] = useState<NegotiationRow[]>([]);
  const [scheduleSettings, setScheduleSettings] = useState({
    slotDurationMinutes: 30,
    totalSessions: 6,
    timezone: "Asia/Tokyo",
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rescheduleSubmittingSession, setRescheduleSubmittingSession] = useState<number | null>(null);
  const [clientFta, setClientFta] = useState<MatchFtaPayload | null>(null);
  const [activeTab, setActiveTab] = useState<MatchTab>("chat");
  const timeOptions = useMemo(() => {
    const interval = Math.max(1, scheduleSettings.slotDurationMinutes);
    const out: { value: string; label: string }[] = [];
    for (let total = 0; total < 24 * 60; total += interval) {
      const h = Math.floor(total / 60);
      const m = total % 60;
      const value = `${pad2(h)}:${pad2(m)}`;
      out.push({ value, label: value });
    }
    return out;
  }, [scheduleSettings.slotDurationMinutes]);

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

  useEffect(() => {
    void load();
    void loadClientFta();
  }, [load, loadClientFta]);

  useEffect(() => {
    // 軽量ポーリングで、相手の更新をリロード不要で反映する。
    const id = window.setInterval(() => {
      void load();
    }, 3000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    // FTAは独立で短い間隔で取得し、チャット/日程APIの成否に影響されないようにする。
    const id = window.setInterval(() => {
      void loadClientFta();
    }, 2000);
    return () => window.clearInterval(id);
  }, [loadClientFta]);

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
    if (!body) return;
    const res = await fetch(`/api/matches/${matchId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(json?.error ?? "送信できませんでした。");
      return;
    }
    form.reset();
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
    const fd = new FormData(e.currentTarget);
    const sessionNumber = Number(fd.get("sessionNumber") ?? 1);
    const starts: string[] = [];
    for (let i = 1; i <= 5; i += 1) {
      const raw = String(fd.get(`start${i}`) ?? "").trim();
      const date = String(fd.get(`startDate${i}`) ?? "").trim();
      const time = String(fd.get(`startTime${i}`) ?? "").trim();
      const merged = raw || (date && time ? `${date}T${time}` : "");
      if (!merged) continue;
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

    const res = await fetch(`/api/matches/${matchId}/negotiations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ starts, sessionNumber }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(json?.error ?? "提案に失敗しました。");
      return;
    }
    setNotice("候補を提示しました（チャットにシステム通知が入ります）。");
    await load();
  }

  function getRescheduleEligibility(slot: SlotRow | null) {
    if (me?.role !== "PARTNER" && me?.role !== "CLIENT") return { can: false, reason: "パートナー・クライアントのみ利用できます。" };
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
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-12 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Match Detail</p>
          <p className="text-sm text-zinc-600">{withHonorificSan(me.displayName)} として表示中（メールなどは公開されません）</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-500">
            <span className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-800">MATCH #{matchId}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-800 hover:bg-zinc-50"
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

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("chat")}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${activeTab === "chat" ? "bg-indigo-700 text-white" : "border border-zinc-300 bg-white text-zinc-700"}`}
        >
          チャット
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
      </div>

      {activeTab === "chat" ? (
      <section className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold">チャット</h2>
        </div>
        <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs">
          {messages.map((msg) => (
            <article
              key={msg.id}
              className={
                msg.kind === "SLOT_PROPOSAL"
                  ? "rounded-xl border border-indigo-100 bg-indigo-50/35 px-3 py-2 text-sm text-zinc-900"
                  : msg.kind === "SCHEDULE_CONFIRMED"
                    ? "rounded-xl border border-emerald-100 bg-emerald-50/35 px-3 py-2 text-sm text-zinc-900"
                    : "rounded-xl bg-zinc-50 px-3 py-2 text-sm text-zinc-900"
              }
            >
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                {withHonorificSan(msg.sender.displayName)}{" "}
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] tracking-normal text-indigo-800">
                  {roleBadge[msg.sender.role]}
                </span>
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
              </div>

              {msg.kind === "SLOT_PROPOSAL" ? (
                <div className="mt-2 space-y-2">
                  <SlotProposalCard payload={msg.payload} />
                  <p className="text-xs text-indigo-900/75">{msg.body}</p>
                </div>
              ) : msg.kind === "SCHEDULE_CONFIRMED" ? (
                <div className="mt-2 space-y-2">
                  <ScheduleConfirmedCard payload={msg.payload} />
                  <pre className="whitespace-pre-wrap font-sans text-xs text-emerald-900/80">{msg.body}</pre>
                </div>
              ) : (
                <pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{msg.body}</pre>
              )}

              <div className="mt-2 text-[11px] text-zinc-400">{formatJa(msg.createdAt)}</div>
            </article>
          ))}
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
      </section>
      ) : null}

      {activeTab === "schedule" ? (
      <section className="space-y-6 rounded-3xl border border-indigo-100 bg-indigo-50/40 px-6 py-8 shadow-inner shadow-indigo-100">
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
              return (
                <li key={row.index} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {row.index}回目の日程：{row.slot ? `${formatJa(row.slot.startAt)} 〜 ${formatJa(row.slot.endAt)}` : "未確定"}
                    </span>
                    <button
                      type="button"
                      disabled={!eligibility.can || rescheduleSubmittingSession !== null}
                      onClick={() => void onRequestReschedule(row.index)}
                      className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100 active:translate-y-[1px] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {rescheduleSubmittingSession === row.index ? "送信中…" : "変更希望"}
                    </button>
                  </div>
                  {!eligibility.can ? (
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
            <div>
              <h3 className="text-xl font-semibold">候補を提示（開始時刻のみ・3〜5件）</h3>
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
              className="rounded-lg bg-indigo-700 px-4 py-2.5 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-800 active:translate-y-[1px] active:scale-[0.98]"
            >
              送信（3〜5件）
            </button>
          </form>
        ) : null}

        {activeNegotiation?.status === "NEEDS_NEW_PROPOSAL" && me.role === "PARTNER" ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            クライアントが全候補に「×」でした。上のフォームから、新しい時間帯セットを再提案してください。
          </div>
        ) : null}

        {activeNegotiation && activeNegotiation.status === "AWAITING_CLIENT_RESPONSE" && me.role === "CLIENT" ? (
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
          <form onSubmit={onConfirm} className="space-y-3 rounded-2xl border border-amber-200 bg-white px-5 py-4">
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
        <section className="space-y-4 rounded-3xl border border-sky-100 bg-sky-50/35 px-6 py-8">
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
    </div>
  );
}
