"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { INQUIRY_CATEGORIES, INQUIRY_REPLY_NOTICE } from "@/lib/inquiry-categories";

type InquiryRow = {
  id: string;
  receptionNumber: string;
  name: string;
  category: string;
  body: string;
  status: "OPEN" | "ANSWERED";
  replyBody: string | null;
  repliedAt: string | null;
  createdAt: string;
};

function formatJa(iso: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function ContactPage() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [body, setBody] = useState("");
  const [history, setHistory] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ receptionNumber: string } | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    const [meRes, historyRes] = await Promise.all([
      fetch("/api/me", { cache: "no-store" }),
      fetch("/api/me/inquiries", { cache: "no-store" }),
    ]);
    if (meRes.ok) {
      const me = (await meRes.json().catch(() => null)) as { user?: { displayName?: string } } | null;
      if (me?.user?.displayName) {
        setName((prev) => prev || me.user!.displayName!);
      }
    }
    if (historyRes.ok) {
      const json = (await historyRes.json().catch(() => null)) as { inquiries?: InquiryRow[] } | null;
      setHistory(json?.inquiries ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!focusId || loading) return;
    const el = document.getElementById(`inquiry-${focusId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, loading, history]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!category) {
      setError("問い合わせ種別を選択してください。");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/me/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, category, body }),
    });
    const json = (await res.json().catch(() => null)) as {
      error?: string;
      inquiry?: InquiryRow;
    } | null;
    setSubmitting(false);
    if (!res.ok) {
      setError(json?.error ?? "送信に失敗しました。");
      return;
    }
    setSuccess({ receptionNumber: json?.inquiry?.receptionNumber ?? "" });
    setBody("");
    setCategory("");
    void reload();
  }

  const field =
    "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-xs placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/25";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <header className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">Contact</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">問い合わせ</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{INQUIRY_REPLY_NOTICE}</p>
      </header>

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8"
      >
        <div>
          <label htmlFor="inquiry-name" className="mb-1.5 block text-sm font-semibold text-slate-800">
            名前
          </label>
          <input
            id="inquiry-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={field}
            placeholder="お名前"
          />
        </div>

        <div>
          <label htmlFor="inquiry-category" className="mb-1.5 block text-sm font-semibold text-slate-800">
            問い合わせ種別
          </label>
          <select
            id="inquiry-category"
            required
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={field}
          >
            <option value="">選択してください</option>
            {INQUIRY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-slate-500">
            例：コーチを変更したい / ツールの使い方がわからない / 日程調整の方法がわからない / 1on1の頻度に関して不明なことがある / アプリの操作方法がわからない
          </p>
        </div>

        <div>
          <label htmlFor="inquiry-body" className="mb-1.5 block text-sm font-semibold text-slate-800">
            内容
          </label>
          <textarea
            id="inquiry-body"
            required
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className={field}
            placeholder="お問い合わせの詳細をご記入ください"
          />
        </div>

        {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
        {success ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            お問い合わせを受け付けました。受付番号は{" "}
            <span className="font-bold">{success.receptionNumber}</span> です。ご登録のメールアドレスにも確認メールをお送りしました。
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-800 disabled:opacity-60"
        >
          {submitting ? "送信中…" : "送信する"}
        </button>
      </form>

      <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold text-slate-900">お問い合わせ履歴</h2>
        <p className="mt-1 text-sm text-slate-600">過去のお問い合わせと回答の状況を確認できます。</p>

        {loading ? (
          <p className="mt-4 text-sm text-slate-600">読込中…</p>
        ) : history.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-600">
            まだお問い合わせはありません。
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {history.map((item) => {
              const highlighted = focusId === item.id;
              return (
                <li
                  key={item.id}
                  id={`inquiry-${item.id}`}
                  className={`rounded-xl border px-4 py-4 ${
                    highlighted
                      ? "border-indigo-300 bg-indigo-50/50"
                      : item.status === "ANSWERED"
                        ? "border-slate-200 bg-slate-50/50"
                        : "border-amber-200 bg-amber-50/30"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-semibold text-slate-800">{item.receptionNumber}</span>
                    <span className="text-slate-500">{formatJa(item.createdAt)}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-semibold ${
                        item.status === "ANSWERED"
                          ? "bg-emerald-100 text-emerald-900"
                          : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {item.status === "ANSWERED" ? "回答済み" : "受付中"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{item.category}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{item.body}</p>
                  {item.replyBody ? (
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-white px-3 py-3">
                      <p className="text-xs font-semibold text-emerald-800">回答</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{item.replyBody}</p>
                      {item.repliedAt ? (
                        <p className="mt-2 text-xs text-slate-500">{formatJa(item.repliedAt)}</p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
