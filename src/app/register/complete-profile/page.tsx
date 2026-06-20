"use client";

import { AuthPrimaryButton, AuthShell, authFieldClass } from "@/components/auth-shell";
import {
  AVAILABILITY_NOTICE,
  DEFAULT_AVAILABILITY_OPTIONS,
  type AvailabilitySlotOption,
} from "@/lib/availability";
import { PartnerMeetingFields } from "@/lib/partner-meeting-fields";
import { validatePartnerMeetingInput } from "@/lib/meeting-provider-shared";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export default function CompleteRegistrationProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<"PARTNER" | "CLIENT" | null>(null);
  const [availabilityOptions, setAvailabilityOptions] = useState<AvailabilitySlotOption[]>(
    DEFAULT_AVAILABILITY_OPTIONS,
  );
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
  const [zoomUrl, setZoomUrl] = useState("");
  const [zoomMeetingId, setZoomMeetingId] = useState("");
  const [zoomPass, setZoomPass] = useState("");
  const [googleMeetUrl, setGoogleMeetUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/me/registration-profile", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        setError(data?.error ?? "読み込みに失敗しました。");
        setLoading(false);
        return;
      }
      if (data.complete) {
        router.replace("/dashboard");
        return;
      }
      setRole(data.role === "PARTNER" ? "PARTNER" : "CLIENT");
      if (Array.isArray(data.availabilitySlotOptions) && data.availabilitySlotOptions.length > 0) {
        setAvailabilityOptions(data.availabilitySlotOptions);
      }
      if (Array.isArray(data.availabilitySlotIds)) setSelectedSlotIds(data.availabilitySlotIds);
      if (data.zoom) {
        setZoomUrl(data.zoom.zoomUrl ?? "");
        setZoomMeetingId(data.zoom.zoomMeetingId ?? "");
        setZoomPass(data.zoom.zoomPass ?? "");
        setGoogleMeetUrl(data.zoom.googleMeetUrl ?? "");
      }
      setLoading(false);
    }
    void load();
  }, [router]);

  function toggleSlot(slotId: string) {
    setSelectedSlotIds((prev) =>
      prev.includes(slotId) ? prev.filter((id) => id !== slotId) : [...prev, slotId],
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (role === "CLIENT" && selectedSlotIds.length === 0) {
      setError("対応可能時間を1つ以上選択してください。");
      return;
    }
    if (role === "PARTNER") {
      const v = validatePartnerMeetingInput({ zoomUrl, zoomMeetingId, zoomPass, googleMeetUrl });
      if (v) {
        setError(v);
        return;
      }
    }
    setSaving(true);
    const body =
      role === "PARTNER"
        ? { zoomUrl, zoomMeetingId, zoomPass, googleMeetUrl }
        : { availabilitySlotIds: selectedSlotIds };
    const res = await fetch("/api/me/registration-profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error ?? "保存に失敗しました。");
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  if (loading) {
    return (
      <AuthShell title="登録を完了する" subtitle="">
        <p className="text-sm text-slate-600">読み込み中…</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="登録を完了する"
      subtitle={
        role === "PARTNER"
          ? "パートナー向けの必須情報を入力してください。この画面はクライアントには表示されません。"
          : "クライアント向けの必須情報を入力してください。"
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        {role === "CLIENT" ? (
          <fieldset className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-4">
            <legend className="px-1 text-base font-semibold text-emerald-900">対応可能時間（複数選択）</legend>
            <p className="text-sm leading-relaxed text-emerald-900/85">{AVAILABILITY_NOTICE}</p>
            <div className="space-y-2">
              {availabilityOptions.map((opt) => (
                <label
                  key={opt.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md bg-white/70 px-3 py-2 text-base text-emerald-950"
                >
                  <input
                    type="checkbox"
                    checked={selectedSlotIds.includes(opt.id)}
                    onChange={() => toggleSlot(opt.id)}
                    className="h-4 w-4 accent-emerald-700"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        {role === "PARTNER" ? (
          <PartnerMeetingFields
            zoomUrl={zoomUrl}
            zoomMeetingId={zoomMeetingId}
            zoomPass={zoomPass}
            googleMeetUrl={googleMeetUrl}
            onZoomUrl={setZoomUrl}
            onZoomMeetingId={setZoomMeetingId}
            onZoomPass={setZoomPass}
            onGoogleMeetUrl={setGoogleMeetUrl}
            fieldClass={authFieldClass}
          />
        ) : null}
        {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
        <AuthPrimaryButton disabled={saving}>{saving ? "保存中…" : "登録を完了する"}</AuthPrimaryButton>
        <p className="text-xs text-slate-500">
          入力後、ホーム画面に進めます。後から設定画面でも変更できます。
        </p>
      </form>
    </AuthShell>
  );
}
