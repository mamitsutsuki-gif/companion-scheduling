"use client";

import { FormEvent, useEffect, useState } from "react";
import { PartnerMeetingFields } from "@/lib/partner-meeting-fields";
import { validatePartnerMeetingInput } from "@/lib/meeting-provider-shared";

export default function PartnerZoomPage() {
  const [zoomUrl, setZoomUrl] = useState("");
  const [zoomMeetingId, setZoomMeetingId] = useState("");
  const [zoomPass, setZoomPass] = useState("");
  const [googleMeetUrl, setGoogleMeetUrl] = useState("");
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
        setGoogleMeetUrl(data.zoom.googleMeetUrl ?? "");
      }
    }
    void load();
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const v = validatePartnerMeetingInput({ zoomUrl, zoomMeetingId, zoomPass, googleMeetUrl });
    if (v) {
      setError(v);
      return;
    }
    const res = await fetch("/api/me/zoom", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        zoomUrl,
        zoomMeetingId,
        zoomPass,
        googleMeetUrl,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "保存に失敗しました。");
      return;
    }
    setMessage(
      "保存しました。日程が確定した際のメールおよびカレンダー案内に反映されます（すでに確定済みの過去分は変わりません）。",
    );
  }

  const field =
    "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-xs placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/25";

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <header className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">Settings</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">オンライン会議リンク</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Zoom と Google Meet の両方を登録してください。クライアント所属企業の設定で選ばれた方が、日程確定時に案内されます。変更はこれから確定する日程以降に反映されます。
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8"
      >
        <PartnerMeetingFields
          zoomUrl={zoomUrl}
          zoomMeetingId={zoomMeetingId}
          zoomPass={zoomPass}
          googleMeetUrl={googleMeetUrl}
          onZoomUrl={setZoomUrl}
          onZoomMeetingId={setZoomMeetingId}
          onZoomPass={setZoomPass}
          onGoogleMeetUrl={setGoogleMeetUrl}
          fieldClass={field}
        />
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
