"use client";

import Link from "next/link";
import { authFieldClass } from "@/components/auth-shell";

export const MEETING_LINKS_HELP_HREF = "/help/partner-meeting-links";

type PartnerMeetingFieldsProps = {
  zoomUrl: string;
  zoomMeetingId: string;
  zoomPass: string;
  googleMeetUrl: string;
  onZoomUrl: (v: string) => void;
  onZoomMeetingId: (v: string) => void;
  onZoomPass: (v: string) => void;
  onGoogleMeetUrl: (v: string) => void;
  fieldClass?: string;
};

export function PartnerMeetingFields({
  zoomUrl,
  zoomMeetingId,
  zoomPass,
  googleMeetUrl,
  onZoomUrl,
  onZoomMeetingId,
  onZoomPass,
  onGoogleMeetUrl,
  fieldClass = authFieldClass,
}: PartnerMeetingFieldsProps) {
  return (
    <div className="space-y-5">
      <p className="text-base leading-relaxed text-slate-600">
        Zoom と Google Meet の両方を登録してください。実際に使うのは、クライアント所属企業の設定で選ばれた方だけです。
        {" "}
        <Link href={MEETING_LINKS_HELP_HREF} className="font-semibold text-indigo-800 underline" target="_blank" rel="noopener noreferrer">
          URLの出し方はこちら
        </Link>
      </p>
      <fieldset className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-4">
        <legend className="px-1 text-lg font-semibold text-indigo-950">Zoom（必須）</legend>
        <label className="block space-y-1.5 text-base font-medium text-indigo-950">
          会議URL
          <input
            value={zoomUrl}
            onChange={(e) => onZoomUrl(e.target.value)}
            type="url"
            required
            placeholder="https://zoom.us/j/..."
            className={fieldClass}
          />
        </label>
        <label className="block space-y-1.5 text-base font-medium text-indigo-950">
          ミーティング ID
          <input
            value={zoomMeetingId}
            onChange={(e) => onZoomMeetingId(e.target.value)}
            type="text"
            required
            maxLength={60}
            placeholder="例: 123 4567 8901"
            className={fieldClass}
          />
        </label>
        <label className="block space-y-1.5 text-base font-medium text-indigo-950">
          パスコード
          <input
            value={zoomPass}
            onChange={(e) => onZoomPass(e.target.value)}
            type="text"
            required
            maxLength={120}
            placeholder="例: 123456"
            className={fieldClass}
          />
        </label>
      </fieldset>
      <fieldset className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-4">
        <legend className="px-1 text-lg font-semibold text-emerald-950">Google Meet（必須）</legend>
        <label className="block space-y-1.5 text-base font-medium text-emerald-950">
          会議URL
          <input
            value={googleMeetUrl}
            onChange={(e) => onGoogleMeetUrl(e.target.value)}
            type="url"
            required
            placeholder="https://meet.google.com/..."
            className={fieldClass}
          />
        </label>
      </fieldset>
    </div>
  );
}
