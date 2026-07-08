"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  MONTHLY_SERVICE_LABELS,
  type MonthlyServiceType,
  formatSlotJa,
} from "@/lib/monthly-session";

type Partner = { id: string; displayName: string; email: string; eligible: boolean };
type Booking = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  serviceType: MonthlyServiceType;
  clientDisplayName: string;
  partnerDisplayName: string;
  companyName: string;
};

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export default function AdminMonthlySessionPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [closedWeekdays, setClosedWeekdays] = useState<number[]>([0, 6]);
  const [earliestHour, setEarliestHour] = useState(8);
  const [latestHour, setLatestHour] = useState(18);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/monthly-session", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "取得に失敗しました。");
      return;
    }
    setPartners(Array.isArray(data?.partners) ? data.partners : []);
    setBookings(Array.isArray(data?.bookings) ? data.bookings : []);
    const r = data?.settings?.reception;
    if (r) {
      setClosedWeekdays(Array.isArray(r.closedWeekdays) ? r.closedWeekdays : [0, 6]);
      setEarliestHour(typeof r.earliestHour === "number" ? r.earliestHour : 8);
      setLatestHour(typeof r.latestHour === "number" ? r.latestHour : 18);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/monthly-session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eligiblePartnerIds: partners.filter((p) => p.eligible).map((p) => p.id),
        reception: { closedWeekdays, earliestHour, latestHour },
      }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "保存に失敗しました。");
      return;
    }
    setMessage("保存しました。");
    await reload();
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:gap-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">
          Administrator
        </p>
        <h1 className="mt-2 text-xl font-semibold text-slate-900 sm:text-2xl">
          セッション申し込み（月額プラン）設定
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          対象パートナーと受付時間帯は全社共通です。クライアント向け月次上限は各企業のプログラム設定から行います。
        </p>
        <Link href="/admin/settings" className="mt-4 inline-block text-sm text-indigo-800 hover:underline">
          ← アプリ設定に戻る
        </Link>
      </header>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
      {message ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
      ) : null}
      {loading ? <p className="text-sm text-slate-600">読込中…</p> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">対象パートナー</h2>
        <p className="mt-1 text-sm text-slate-600">
          チェックしたパートナーだけがセッション申し込みに表示・受付できます。
        </p>
        <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto">
          {partners.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={p.eligible}
                onChange={(e) =>
                  setPartners((prev) =>
                    prev.map((x) => (x.id === p.id ? { ...x, eligible: e.target.checked } : x)),
                  )
                }
              />
              <span className="font-medium text-slate-900">{p.displayName}</span>
              <span className="text-slate-500">{p.email}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">受付可能時間</h2>
        <p className="mt-1 text-sm text-slate-600">閉館する曜日にチェックを入れてください。</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {WEEKDAY_LABELS.map((label, idx) => (
            <label key={label} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={closedWeekdays.includes(idx)}
                onChange={(e) =>
                  setClosedWeekdays((prev) =>
                    e.target.checked ? [...prev, idx].sort() : prev.filter((d) => d !== idx),
                  )
                }
              />
              {label}曜日は休
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <label>
            開始時刻
            <select
              className="ml-2 rounded-lg border border-slate-300 px-2 py-1"
              value={earliestHour}
              onChange={(e) => setEarliestHour(Number(e.target.value))}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {h}:00
                </option>
              ))}
            </select>
          </label>
          <label>
            終了時刻
            <select
              className="ml-2 rounded-lg border border-slate-300 px-2 py-1"
              value={latestHour}
              onChange={(e) => setLatestHour(Number(e.target.value))}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h + 1} value={h + 1}>
                  {h + 1}:00
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="mt-4 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "保存中…" : "対象パートナーと受付時間を保存"}
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">全予約一覧</h2>
        {bookings.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">予約はまだありません。</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {bookings.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium text-slate-900">
                    {b.clientDisplayName}さん（{b.companyName}）× {b.partnerDisplayName}
                  </p>
                  <p className="text-slate-600">
                    {MONTHLY_SERVICE_LABELS[b.serviceType]} · {formatSlotJa(b.startAt, b.endAt)} ·{" "}
                    {b.status}
                  </p>
                </div>
                <Link
                  href={`/sessions-booking/${b.id}`}
                  className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-indigo-900 no-underline"
                >
                  詳細・チャット
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
