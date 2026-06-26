"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type InquiryRow = {
  id: string;
  receptionNumber: string;
  userId: string;
  submitterRole: "CLIENT" | "PARTNER";
  submitterDisplayName: string;
  name: string;
  category: string;
  body: string;
  status: "OPEN" | "ANSWERED";
  replyBody: string | null;
  repliedByDisplayName: string | null;
  repliedAt: string | null;
  createdAt: string;
};

type RoleTab = "CLIENT" | "PARTNER";

function formatJa(iso: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function AdminInquiriesPage() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");
  const initialRole = searchParams.get("role") === "PARTNER" ? "PARTNER" : "CLIENT";

  const [roleTab, setRoleTab] = useState<RoleTab>(initialRole);
  const [items, setItems] = useState<InquiryRow[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const itemRefs = useRef<Record<string, HTMLLIElement | null>>({});

  const reload = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/admin/inquiries?role=${roleTab}`, { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as {
      error?: string;
      inquiries?: InquiryRow[];
      openCount?: number;
    } | null;
    if (!res.ok) {
      setError(json?.error ?? "取得に失敗しました。");
      setLoading(false);
      return;
    }
    setItems(json?.inquiries ?? []);
    setOpenCount(json?.openCount ?? 0);
    setLoading(false);
  }, [roleTab]);

  useEffect(() => {
    setLoading(true);
    void reload();
    const id = window.setInterval(() => void reload(), 5000);
    return () => window.clearInterval(id);
  }, [reload]);

  useEffect(() => {
    if (!focusId) return;
    const el = itemRefs.current[focusId];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, items]);

  async function submitReply(inquiryId: string, e: FormEvent) {
    e.preventDefault();
    const replyBody = (replyDrafts[inquiryId] ?? "").trim();
    if (!replyBody) {
      setReplyError("回答内容を入力してください。");
      return;
    }
    setReplyError(null);
    setSubmittingId(inquiryId);
    const res = await fetch(`/api/admin/inquiries/${inquiryId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replyBody }),
    });
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    setSubmittingId(null);
    if (!res.ok) {
      setReplyError(json?.error ?? "回答の送信に失敗しました。");
      void reload();
      return;
    }
    setReplyDrafts((prev) => {
      const next = { ...prev };
      delete next[inquiryId];
      return next;
    });
    void reload();
  }

  const openInTab = items.filter((i) => i.status === "OPEN").length;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">Administrator</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">問い合わせ</h1>
        <p className="mt-2 text-sm text-slate-600">
          クライアント・パートナーからのお問い合わせに回答します。回答済みのものはリアルタイムで更新され、重複回答を防ぎます。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 font-semibold text-amber-900">
            未回答（全体） {openCount} 件
          </span>
          <span className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 font-semibold text-indigo-900">
            未回答（このタブ） {openInTab} 件
          </span>
          <button
            type="button"
            onClick={() => void reload()}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-50"
          >
            再読込
          </button>
        </div>
      </header>

      <div className="flex gap-2">
        {(["CLIENT", "PARTNER"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setRoleTab(tab)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              roleTab === tab
                ? "bg-indigo-700 text-white"
                : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
            }`}
          >
            {tab === "CLIENT" ? "クライアント" : "パートナー"}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {replyError ? (
        <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{replyError}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-600">読込中…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-600">
          {roleTab === "CLIENT" ? "クライアント" : "パートナー"}からの問い合わせはまだありません。
        </p>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => {
            const highlighted = focusId === item.id;
            const isAnswered = item.status === "ANSWERED";
            return (
              <li
                key={item.id}
                ref={(el) => {
                  itemRefs.current[item.id] = el;
                }}
                className={`rounded-xl border bg-white p-4 shadow-sm sm:p-6 ${
                  highlighted
                    ? "border-indigo-300 ring-2 ring-indigo-200"
                    : isAnswered
                      ? "border-slate-200"
                      : "border-amber-200 bg-amber-50/20"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono text-sm font-bold text-slate-900">
                        {item.receptionNumber}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-semibold ${
                          isAnswered
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {isAnswered ? "回答済み" : "要回答"}
                      </span>
                      <span className="text-slate-500">{formatJa(item.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {item.submitterDisplayName}（{item.name}）
                    </p>
                    <p className="mt-1 text-sm text-indigo-800">{item.category}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{item.body}</p>
                  </div>
                </div>

                {isAnswered ? (
                  <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/50 px-4 py-3">
                    <p className="text-xs font-semibold text-emerald-800">
                      回答済み
                      {item.repliedByDisplayName ? ` — ${item.repliedByDisplayName}` : ""}
                      {item.repliedAt ? `（${formatJa(item.repliedAt)}）` : ""}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{item.replyBody}</p>
                  </div>
                ) : (
                  <form className="mt-4 space-y-3" onSubmit={(e) => void submitReply(item.id, e)}>
                    <label className="block text-sm font-semibold text-slate-800" htmlFor={`reply-${item.id}`}>
                      回答を入力
                    </label>
                    <textarea
                      id={`reply-${item.id}`}
                      rows={4}
                      value={replyDrafts[item.id] ?? ""}
                      onChange={(e) =>
                        setReplyDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/25"
                      placeholder="回答内容を入力してください"
                    />
                    <button
                      type="submit"
                      disabled={submittingId === item.id}
                      className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-60"
                    >
                      {submittingId === item.id ? "送信中…" : "回答を送信"}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
