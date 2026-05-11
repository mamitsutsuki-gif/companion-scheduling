"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type NotificationRow = {
  id: string;
  type:
    | "CHAT"
    | "SLOT_PROPOSED"
    | "SLOT_VOTED"
    | "SLOT_CONFIRMED"
    | "RESCHEDULE"
    | "FEEDBACK_SUBMITTED"
    | "REPORT_SUBMITTED"
    | "SESSION_ABANDONED"
    | "INVOICE_SUBMITTED";
  matchId: string | null;
  sessionNumber: number | null;
  actorRole: string | null;
  actorUserId: string | null;
  summary: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

const typeLabel: Record<NotificationRow["type"], string> = {
  CHAT: "チャット",
  SLOT_PROPOSED: "候補提示",
  SLOT_VOTED: "○×回答",
  SLOT_CONFIRMED: "確定",
  RESCHEDULE: "変更希望",
  FEEDBACK_SUBMITTED: "クライアント振り返り",
  REPORT_SUBMITTED: "パートナーレポート",
  SESSION_ABANDONED: "未実施・消化",
  INVOICE_SUBMITTED: "請求書提出",
};

const typeBadgeClass: Record<NotificationRow["type"], string> = {
  CHAT: "border-zinc-300 bg-zinc-100 text-zinc-800",
  SLOT_PROPOSED: "border-indigo-300 bg-indigo-50 text-indigo-900",
  SLOT_VOTED: "border-violet-300 bg-violet-50 text-violet-900",
  SLOT_CONFIRMED: "border-emerald-300 bg-emerald-50 text-emerald-900",
  RESCHEDULE: "border-amber-300 bg-amber-50 text-amber-900",
  FEEDBACK_SUBMITTED: "border-rose-300 bg-rose-50 text-rose-900",
  REPORT_SUBMITTED: "border-sky-300 bg-sky-50 text-sky-900",
  SESSION_ABANDONED: "border-red-300 bg-red-50 text-red-900",
  INVOICE_SUBMITTED: "border-indigo-300 bg-indigo-50 text-indigo-900",
};

function formatJa(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default function AdminNotificationsPage() {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/notifications", { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(json?.error ?? "取得に失敗しました。");
      setLoading(false);
      return;
    }
    setItems((json?.notifications ?? []) as NotificationRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    const id = window.setInterval(() => void reload(), 5000);
    return () => window.clearInterval(id);
  }, [reload]);

  async function markRead(id: string) {
    await fetch("/api/admin/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    void reload();
  }

  async function markAll() {
    await fetch("/api/admin/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    void reload();
  }

  const unreadCount = items.filter((n) => !n.readAt).length;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">
          Administrator
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">通知</h1>
        <p className="mt-2 text-sm text-slate-600">
          クライアント／パートナーからのチャット、候補提示、回答、確定、振り返り提出などの最新情報がここに集まります。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 font-semibold text-indigo-900">
            未読 {unreadCount} 件
          </span>
          <button
            type="button"
            onClick={() => void reload()}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-50"
          >
            再読込
          </button>
          <button
            type="button"
            onClick={() => void markAll()}
            disabled={unreadCount === 0}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            すべて既読にする
          </button>
        </div>
      </header>

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-600">読込中…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-600">
          通知はまだありません。
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const link = n.link ?? (n.matchId ? `/admin/matches?focus=${n.matchId}` : null);
            return (
              <li
                key={n.id}
                className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-white px-4 py-3 shadow-sm ${
                  n.readAt ? "border-slate-200" : "border-indigo-200 bg-indigo-50/30"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
                    <span
                      className={`rounded-full border px-2 py-0.5 font-semibold ${typeBadgeClass[n.type]}`}
                    >
                      {typeLabel[n.type]}
                    </span>
                    <span className="text-slate-500">{formatJa(n.createdAt)}</span>
                    {!n.readAt ? (
                      <span className="rounded-full bg-indigo-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        NEW
                      </span>
                    ) : null}
                  </div>
                  <p className="break-words text-sm text-slate-900">{n.summary}</p>
                  {n.matchId ? (
                    <p className="mt-1 text-xs text-slate-500">MATCH #{n.matchId}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {link ? (
                    <Link
                      href={link}
                      className="rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-sm font-semibold text-indigo-900 no-underline hover:bg-indigo-50"
                      onClick={() => void markRead(n.id)}
                    >
                      開く
                    </Link>
                  ) : null}
                  {!n.readAt ? (
                    <button
                      type="button"
                      onClick={() => void markRead(n.id)}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                    >
                      既読
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
