"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MONTHLY_SERVICE_LABELS,
  MONTHLY_SLOT_MINUTES,
  type MonthlyServiceType,
  canCancelBooking,
  formatSlotJa,
} from "@/lib/monthly-session";

type Profile = {
  fullName: string;
  career: string;
  bio: string;
  services: MonthlyServiceType[];
};

type Slot = { id: string; startAt: string; endAt: string };
type Booking = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  serviceType: MonthlyServiceType;
  clientDisplayName: string;
  companyName: string;
};

function ymdTokyo(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export default function MonthlySessionPartnerPage() {
  const [profile, setProfile] = useState<Profile>({
    fullName: "",
    career: "",
    bio: "",
    services: [],
  });
  const [availability, setAvailability] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [day, setDay] = useState(() => ymdTokyo(new Date(Date.now() + 48 * 3600_000)));
  const [pickedHours, setPickedHours] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const hourOptions = useMemo(() => {
    const out: string[] = [];
    for (let h = 8; h < 18; h++) {
      for (const m of [0, 30]) {
        out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    }
    return out;
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/monthly-session/partner", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "取得に失敗しました。");
      return;
    }
    setProfile({
      fullName: data?.profile?.fullName ?? "",
      career: data?.profile?.career ?? "",
      bio: data?.profile?.bio ?? "",
      services: Array.isArray(data?.profile?.services) ? data.profile.services : [],
    });
    setAvailability(Array.isArray(data?.availability) ? data.availability : []);
    setBookings(Array.isArray(data?.bookings) ? data.bookings : []);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function saveProfile() {
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/monthly-session/partner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "保存に失敗しました。");
      return;
    }
    setMessage("プロフィールを保存しました。");
    await reload();
  }

  async function addSlots() {
    const startAts = pickedHours.map((hm) => new Date(`${day}T${hm}:00+09:00`).toISOString());
    if (startAts.length === 0) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/monthly-session/partner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addAvailabilityStartAts: startAts }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "空き枠の追加に失敗しました。");
      return;
    }
    setMessage("空き枠を追加しました。");
    setPickedHours([]);
    await reload();
  }

  async function removeSlot(id: string) {
    setSaving(true);
    const res = await fetch("/api/monthly-session/partner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deleteAvailabilitySlotId: id }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(typeof data?.error === "string" ? data.error : "削除に失敗しました。");
      return;
    }
    await reload();
  }

  async function cancelBooking(id: string) {
    if (!confirm("この予約をキャンセルしますか？")) return;
    const res = await fetch(`/api/monthly-session/bookings/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(typeof data?.error === "string" ? data.error : "キャンセルに失敗しました。");
      return;
    }
    setMessage("予約をキャンセルしました。");
    await reload();
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 sm:gap-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">
          Session Booking
        </p>
        <h1 className="mt-2 text-xl font-semibold text-slate-900 sm:text-2xl">セッション申し込み</h1>
        <p className="mt-2 text-sm text-slate-600">
          プロフィール・対応種別・空き時間（{MONTHLY_SLOT_MINUTES}分・48時間後以降）を登録してください。
        </p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-indigo-800 hover:underline">
          ← ホームに戻る
        </Link>
      </header>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
      {message ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
      ) : null}
      {loading ? <p className="text-sm text-slate-600">読込中…</p> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">プロフィール</h2>
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            フルネーム
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={profile.fullName}
              onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            経歴
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              rows={4}
              value={profile.career}
              onChange={(e) => setProfile((p) => ({ ...p, career: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            自己紹介
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              rows={4}
              value={profile.bio}
              onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
            />
          </label>
          <fieldset>
            <legend className="text-sm font-medium text-slate-800">対応可能なセッション</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {(Object.keys(MONTHLY_SERVICE_LABELS) as MonthlyServiceType[]).map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={profile.services.includes(key)}
                    onChange={(e) => {
                      setProfile((p) => ({
                        ...p,
                        services: e.target.checked
                          ? [...p.services, key]
                          : p.services.filter((s) => s !== key),
                      }));
                    }}
                  />
                  {MONTHLY_SERVICE_LABELS[key]}
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveProfile()}
            className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            プロフィールを保存
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">空き時間の登録</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            日付
            <input
              type="date"
              className="ml-2 rounded-lg border border-slate-300 px-2 py-1"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {hourOptions.map((hm) => {
            const on = pickedHours.includes(hm);
            return (
              <button
                key={hm}
                type="button"
                onClick={() =>
                  setPickedHours((prev) =>
                    on ? prev.filter((x) => x !== hm) : [...prev, hm].sort(),
                  )
                }
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                  on ? "bg-indigo-700 text-white" : "border border-slate-300 bg-white"
                }`}
              >
                {hm}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={saving || pickedHours.length === 0}
          onClick={() => void addSlots()}
          className="mt-4 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          選択した枠を追加
        </button>
        <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto text-sm">
          {availability.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
            >
              <span>{formatSlotJa(s.startAt, s.endAt)}</span>
              <button
                type="button"
                className="text-rose-700 hover:underline"
                onClick={() => void removeSlot(s.id)}
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">セッション一覧</h2>
        {bookings.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">予約はまだありません。</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {bookings.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium text-slate-900">
                    {b.clientDisplayName}さん · {b.companyName}
                  </p>
                  <p className="text-slate-600">
                    {MONTHLY_SERVICE_LABELS[b.serviceType]} · {formatSlotJa(b.startAt, b.endAt)}
                  </p>
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
                      onClick={() => void cancelBooking(b.id)}
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
