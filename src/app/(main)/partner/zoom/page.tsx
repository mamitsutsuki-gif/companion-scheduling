"use client";

import { FormEvent, useEffect, useState } from "react";

export default function PartnerZoomPage() {
  const [zoomUrl, setZoomUrl] = useState("");
  const [zoomMeetingId, setZoomMeetingId] = useState("");
  const [zoomPass, setZoomPass] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/me/zoom");
      const data = await res.json().catch(() => null);
      if (!res.ok) return;
      if (data?.zoom) {
        setZoomUrl(data.zoom.zoomUrl ?? "");
        setZoomMeetingId(data.zoom.zoomMeetingId ?? "");
        setZoomPass(data.zoom.zoomPass ?? "");
      }
    }
    void load();
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/me/zoom", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        zoomUrl: fd.get("zoomUrl"),
        zoomMeetingId: fd.get("zoomMeetingId"),
        zoomPass: fd.get("zoomPass"),
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "保存に失敗しました。");
      return;
    }
    setMessage("保存しました。日程が確定した際のメールおよびカレンダー案内に反映されます。");
  }

  const field =
    "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-xs placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/25";

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <header className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">Settings</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">オンライン会議リンク</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          ご利用の常設ミーティング URL とパスコードを登録します。日程確定時に双方へ案内され、カレンダー（.ics）にも含まれます。
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8"
      >
        <label className="block space-y-2 text-sm font-medium text-slate-900">
          ミーティング URL
          <input
            name="zoomUrl"
            required
            value={zoomUrl}
            onChange={(e) => setZoomUrl(e.target.value)}
            placeholder="https://zoom.us/j/..."
            className={field}
          />
        </label>
        <label className="block space-y-2 text-sm font-medium text-slate-900">
          ミーティング ID
          <input
            name="zoomMeetingId"
            value={zoomMeetingId}
            onChange={(e) => setZoomMeetingId(e.target.value)}
            required
            placeholder="例: 123 4567 8901"
            inputMode="numeric"
            className={field}
            autoComplete="off"
          />
        </label>
        <label className="block space-y-2 text-sm font-medium text-slate-900">
          パスコード
          <input
            name="zoomPass"
            value={zoomPass}
            onChange={(e) => setZoomPass(e.target.value)}
            required
            placeholder="例: 123456"
            className={field}
            autoComplete="off"
          />
        </label>
        {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
        {message ? <p className="text-sm font-medium text-emerald-800">{message}</p> : null}
        <button
          type="submit"
          className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-800"
        >
          保存する
        </button>
      </form>
    </div>
  );
}
