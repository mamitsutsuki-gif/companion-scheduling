"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import {
  MONTHLY_SERVICE_LABELS,
  type MonthlyServiceType,
  formatSlotJa,
  canCancelBooking,
} from "@/lib/monthly-session";

type Message = {
  id: string;
  body: string;
  senderId: string;
  senderDisplayName: string;
  createdAt: string;
};

export default function MonthlyBookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = use(params);
  const [booking, setBooking] = useState<{
    id: string;
    serviceType: MonthlyServiceType;
    startAt: string;
    endAt: string;
    status: string;
    clientDisplayName: string;
    partnerDisplayName: string;
    companyName: string;
  } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [meeting, setMeeting] = useState<{ joinUrl: string; provider: string } | null>(null);
  const [chatActive, setChatActive] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/monthly-session/bookings/${encodeURIComponent(bookingId)}`, {
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "取得に失敗しました。");
      return;
    }
    setBooking(data.booking);
    setMessages(Array.isArray(data.messages) ? data.messages : []);
    setMeeting(data.meeting ?? null);
    setChatActive(Boolean(data.chatActive));
  }, [bookingId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function send() {
    if (!body.trim()) return;
    const res = await fetch(`/api/monthly-session/bookings/${encodeURIComponent(bookingId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "送信に失敗しました。");
      return;
    }
    setBody("");
    await reload();
  }

  async function cancel() {
    if (!confirm("この予約をキャンセルしますか？")) return;
    const res = await fetch(`/api/monthly-session/bookings/${encodeURIComponent(bookingId)}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "キャンセルに失敗しました。");
      return;
    }
    await reload();
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Link href="/sessions-booking" className="text-sm text-indigo-800 hover:underline">
          ← セッション申し込みに戻る
        </Link>
        <h1 className="mt-3 text-xl font-semibold text-slate-900">セッション詳細</h1>
        {loading ? <p className="mt-2 text-sm text-slate-600">読込中…</p> : null}
        {booking ? (
          <div className="mt-3 space-y-1 text-sm text-slate-700">
            <p>
              {MONTHLY_SERVICE_LABELS[booking.serviceType]} ·{" "}
              {formatSlotJa(booking.startAt, booking.endAt)}
            </p>
            <p>
              クライアント: {booking.clientDisplayName}さん（{booking.companyName}）
            </p>
            <p>パートナー: {booking.partnerDisplayName}</p>
            <p>状態: {booking.status === "cancelled" ? "キャンセル済" : "予約確定"}</p>
            {meeting?.joinUrl ? (
              <p>
                オンライン会議:{" "}
                <a href={meeting.joinUrl} className="text-indigo-800 underline" target="_blank" rel="noreferrer">
                  参加リンク
                </a>
              </p>
            ) : (
              <p className="text-amber-800">会議リンクはパートナーの Zoom / Meet 設定から取得します。</p>
            )}
            {booking.status === "confirmed" && canCancelBooking(booking.startAt) ? (
              <button
                type="button"
                onClick={() => void cancel()}
                className="mt-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-rose-900"
              >
                予約をキャンセル
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">当日チャット</h2>
        <p className="mt-1 text-sm text-slate-600">
          緊急連絡用です。セッション当日のみ送受信できます。
        </p>
        {!chatActive ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            チャットはセッション当日のみ有効です。
          </p>
        ) : null}
        <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto">
          {messages.map((m) => (
            <li key={m.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <p className="text-xs text-slate-500">
                {m.senderDisplayName} ·{" "}
                {new Intl.DateTimeFormat("ja-JP", {
                  timeZone: "Asia/Tokyo",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(m.createdAt))}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-slate-800">{m.body}</p>
            </li>
          ))}
        </ul>
        {chatActive ? (
          <div className="mt-3 flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="メッセージ"
              onKeyDown={(e) => {
                if (e.key === "Enter") void send();
              }}
            />
            <button
              type="button"
              onClick={() => void send()}
              className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white"
            >
              送信
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
