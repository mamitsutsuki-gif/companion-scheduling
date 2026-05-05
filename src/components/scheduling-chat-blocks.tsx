"use client";

import { z } from "zod";

const slotProposalPayloadSchema = z.object({
  negotiationId: z.string(),
  round: z.number(),
  durationMinutes: z.number(),
  timezone: z.string(),
  slots: z.array(
    z.object({
      id: z.string(),
      start: z.string(),
      end: z.string(),
    }),
  ),
});

const scheduleConfirmedPayloadSchema = z.object({
  negotiationId: z.string().optional(),
  start: z.string(),
  end: z.string(),
  zoomUrl: z.string().nullable().optional(),
  zoomPass: z.string().nullable().optional(),
});

function fmt(iso: string) {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function SlotProposalCard({ payload }: { payload: unknown }) {
  const p = slotProposalPayloadSchema.safeParse(payload);
  if (!p.success) return null;
  return (
    <div className="rounded-2xl border border-indigo-200/90 bg-gradient-to-br from-white to-indigo-50/95 p-4 shadow-md shadow-indigo-100/40 ring-1 ring-indigo-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-2">
        <span className="text-[11px] font-bold tracking-widest text-indigo-900 uppercase">
          Schedule
        </span>
        <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
          Round {p.data.round}
        </span>
      </div>
      <p className="mt-2 text-xs text-indigo-950/85">
        各枠 <strong>{p.data.durationMinutes} 分</strong>（案内 TZ: {p.data.timezone}）
      </p>
      <ol className="mt-3 grid gap-2 sm:grid-cols-1">
        {p.data.slots.map((s, i) => (
          <li
            key={s.id}
            className="flex items-start gap-3 rounded-xl border border-white/90 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-xs"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-xs font-bold text-indigo-900">
              {i + 1}
            </span>
            <div>
              <p className="font-semibold tracking-tight text-slate-900">
                {fmt(s.start)} 〜 {fmt(s.end)}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 rounded-lg bg-indigo-600/90 px-3 py-2 text-center text-[11px] font-medium text-white">
        クライアントは下のフォームまたはこの下の一覧から ○／× で回答してください
      </p>
    </div>
  );
}

export function ScheduleConfirmedCard({ payload }: { payload: unknown }) {
  const p = scheduleConfirmedPayloadSchema.safeParse(payload);
  if (!p.success) return null;
  const zoomBits = [];
  if (p.data.zoomUrl) zoomBits.push(p.data.zoomUrl);
  if (p.data.zoomPass) zoomBits.push(`パス: ${p.data.zoomPass}`);
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/95 px-4 py-3 text-sm text-emerald-950 shadow-sm ring-1 ring-emerald-100">
      <div className="text-[11px] font-bold tracking-wide uppercase">確定しました</div>
      <p className="mt-2 font-semibold">
        {fmt(p.data.start)} 〜 {fmt(p.data.end)}
      </p>
      {zoomBits.length ? <p className="mt-1 text-xs opacity-90">{zoomBits.join(" · ")}</p> : null}
    </div>
  );
}
