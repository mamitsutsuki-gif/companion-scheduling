"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MONTHLY_LIMIT_EXCEEDED_MESSAGE,
  MONTHLY_SERVICE_LABELS,
  type MonthlyServiceType,
  canCancelBooking,
  formatSlotJa,
} from "@/lib/monthly-session";

type Booking = {
  id: string;
  serviceType: MonthlyServiceType;
  startAt: string;
  endAt: string;
  status: string;
  partnerDisplayName: string;
};

type Slot = {
  startAt: string;
  endAt: string;
  partners: Array<{
    partnerId: string;
    displayName: string;
    profile: { career: string; bio: string; fullName: string } | null;
  }>;
};

function ymdTokyo(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDaysYmd(ymd: string, days: number) {
  const d = new Date(`${ymd}T12:00:00+09:00`);
  d.setDate(d.getDate() + days);
  return ymdTokyo(d);
}

export default function MonthlySessionClientPage() {
  const [serviceType, setServiceType] = useState<MonthlyServiceType | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [enrollment, setEnrollment] = useState<{
    monthlyLimit: number;
    usedThisMonth: number;
  } | null>(null);
  const [fromYmd, setFromYmd] = useState(() => ymdTokyo(new Date(Date.now() + 48 * 3600_000)));
  const [selectedStartAt, setSelectedStartAt] = useState<string | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const toYmd = useMemo(() => addDaysYmd(fromYmd, 13), [fromYmd]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs =
      serviceType != null
        ? `?serviceType=${encodeURIComponent(serviceType)}&fromYmd=${encodeURIComponent(fromYmd)}&toYmd=${encodeURIComponent(toYmd)}`
        : "";
    const res = await fetch(`/api/monthly-session/client${qs}`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "取得に失敗しました。");
      return;
    }
    setBookings(Array.isArray(data?.bookings) ? data.bookings : []);
    setSlots(Array.isArray(data?.slots) ? data.slots : []);
    setEnrollment(data?.enrollment ?? null);
  }, [serviceType, fromYmd, toYmd]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selectedSlot = slots.find((s) => s.startAt === selectedStartAt) ?? null;

  async function onBook() {
    if (!serviceType || !selectedStartAt || !selectedPartnerId) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/monthly-session/client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceType,
        partnerId: selectedPartnerId,
        startAt: selectedStartAt,
      }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "予約に失敗しました。");
      return;
    }
    setMessage("予約が完了しました。");
    setSelectedStartAt(null);
    setSelectedPartnerId(null);
    await reload();
  }

  async function onCancel(bookingId: string) {
    if (!confirm("この予約をキャンセルしますか？")) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/monthly-session/client", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "キャンセルに失敗しました。");
      return;
    }
    setMessage("予約をキャンセルしました。");
    await reload();
  }

  const limitReached =
    enrollment != null &&
    enrollment.monthlyLimit > 0 &&
    enrollment.usedThisMonth >= enrollment.monthlyLimit;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 sm:gap-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">
          Session Booking
        </p>
        <h1 className="mt-2 text-xl font-semibold text-slate-900 sm:text-2xl">セッション申し込み</h1>
        <p className="mt-2 text-sm text-slate-600">
          希望のセッション種別を選び、空き枠からパートナーを選んで予約できます（30分・48時間後以降）。
          各月の予約は、その月の1日（日本時間）からお申し込みいただけます。
        </p>
        {enrollment ? (
          <p className="mt-3 text-sm text-slate-700">
            今月の利用:{" "}
            <strong>
              {enrollment.usedThisMonth}
              {enrollment.monthlyLimit > 0 ? ` / ${enrollment.monthlyLimit}` : ""} 回
            </strong>
          </p>
        ) : null}
        {limitReached ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {MONTHLY_LIMIT_EXCEEDED_MESSAGE}
          </p>
        ) : null}
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-indigo-800 hover:underline">
          ← ホームに戻る
        </Link>
      </header>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
      {message ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
      ) : null}

      {!limitReached ? (
        <>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">1. 種別を選ぶ</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(MONTHLY_SERVICE_LABELS) as MonthlyServiceType[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setServiceType(key);
                setSelectedStartAt(null);
                setSelectedPartnerId(null);
              }}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                serviceType === key
                  ? "bg-indigo-700 text-white"
                  : "border border-slate-300 bg-white text-slate-800"
              }`}
            >
              {MONTHLY_SERVICE_LABELS[key]}
            </button>
          ))}
        </div>
      </section>

      {serviceType ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">2. 空き枠を選ぶ</h2>
            <label className="text-sm text-slate-700">
              表示開始日
              <input
                type="date"
                value={fromYmd}
                onChange={(e) => setFromYmd(e.target.value)}
                className="ml-2 rounded-lg border border-slate-300 px-2 py-1"
              />
            </label>
          </div>
          {loading ? (
            <p className="mt-4 text-sm text-slate-600">読込中…</p>
          ) : slots.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">この期間に空き枠がありません。</p>
          ) : (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {slots.map((s) => (
                <li key={s.startAt}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStartAt(s.startAt);
                      setSelectedPartnerId(null);
                    }}
                    className={`w-full rounded-xl border px-3 py-3 text-left text-sm ${
                      selectedStartAt === s.startAt
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <p className="font-medium text-slate-900">{formatSlotJa(s.startAt, s.endAt)}</p>
                    <p className="mt-1 text-xs text-slate-500">候補 {s.partners.length} 名</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {selectedSlot ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">3. パートナーを選ぶ</h2>
          <p className="mt-1 text-sm text-slate-600">
            {formatSlotJa(selectedSlot.startAt, selectedSlot.endAt)}
          </p>
          <ul className="mt-4 space-y-3">
            {selectedSlot.partners.map((p) => (
              <li key={p.partnerId}>
                <button
                  type="button"
                  onClick={() => setSelectedPartnerId(p.partnerId)}
                  className={`w-full rounded-xl border px-4 py-3 text-left ${
                    selectedPartnerId === p.partnerId
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <p className="font-semibold text-slate-900">{p.displayName}</p>
                  {p.profile?.career ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{p.profile.career}</p>
                  ) : null}
                  {p.profile?.bio ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">{p.profile.bio}</p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={!selectedPartnerId || saving}
            onClick={() => void onBook()}
            className="mt-4 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "予約中…" : "この内容で予約する"}
          </button>
        </section>
      ) : null}
        </>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">予約一覧</h2>
        {bookings.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">まだ予約がありません。</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {bookings.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium text-slate-900">
                    {MONTHLY_SERVICE_LABELS[b.serviceType]} · {b.partnerDisplayName}
                  </p>
                  <p className="text-slate-600">{formatSlotJa(b.startAt, b.endAt)}</p>
                  <p className="text-xs text-slate-500">
                    {b.status === "cancelled" ? "キャンセル済" : "予約確定"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {b.status === "confirmed" ? (
                    <Link
                      href={`/sessions-booking/${b.id}`}
                      className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-indigo-900 no-underline"
                    >
                      詳細・チャット
                    </Link>
                  ) : null}
                  {b.status === "confirmed" && canCancelBooking(b.startAt) ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void onCancel(b.id)}
                      className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-rose-900"
                    >
                      キャンセル
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
