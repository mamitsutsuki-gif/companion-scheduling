"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  formatResponseDeadlineJa,
  isResponseDeadlinePassed,
} from "@/lib/negotiation-display";

type SlotRow = {
  id: string;
  startAt: string;
  endAt: string;
};

function formatSlotJa(startAt: string, endAt: string, timezone: string) {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("ja-JP", {
      timeZone: timezone,
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  return `${fmt(startAt)}〜${fmt(endAt).split(" ").pop() ?? ""}`;
}

function formatSlotLabel(startAt: string, timezone: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: timezone,
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(startAt));
}

export function ScheduleClientVoteForm({
  partnerName,
  slots,
  timezone,
  responseDeadline,
  submitting,
  onSubmitSelected,
  onRequestAlternative,
}: {
  partnerName: string;
  slots: SlotRow[];
  timezone: string;
  responseDeadline?: string | null;
  submitting: boolean;
  onSubmitSelected: (selectedSlotIds: string[]) => void | Promise<void>;
  onRequestAlternative: () => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [alternativeSent, setAlternativeSent] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, SlotRow[]>();
    for (const slot of slots) {
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(slot.startAt));
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(slot);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [slots, timezone]);

  const deadlinePassed = isResponseDeadlinePassed(responseDeadline);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (selected.size === 0) return;
    await onSubmitSelected([...selected]);
  }

  async function handleAlternative() {
    setAlternativeSent(true);
    await onRequestAlternative();
  }

  if (alternativeSent) {
    return (
      <div className="app-surface-indigo scroll-mt-24 rounded-2xl px-5 py-6">
        <p className="text-base font-semibold text-indigo-900">
          担当パートナーへ別候補の希望を送信しました。
        </p>
        <p className="mt-2 text-sm text-indigo-800">候補日時が届くまでお待ちください。</p>
      </div>
    );
  }

  return (
    <form
      id="client-schedule-vote"
      onSubmit={(e) => void handleSubmit(e)}
      className="app-surface-indigo scroll-mt-24 space-y-5 rounded-2xl px-5 py-5"
    >
      <div>
        <h3 className="text-xl font-semibold text-indigo-900">次回セッションの日程調整</h3>
        <div className="mt-3 rounded-lg border border-indigo-200 bg-white/80 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">担当パートナー</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{partnerName}</p>
        </div>
        <p className="mt-4 text-base leading-relaxed text-indigo-900">
          担当パートナーから、次回セッションでご案内可能な日時が届いています。
          <br />
          ご都合の良い日時をすべて選択してください。
        </p>
      </div>

      {responseDeadline ? (
        <div
          className={`rounded-lg border px-4 py-3 ${deadlinePassed ? "border-amber-300 bg-amber-50" : "border-indigo-200 bg-white/70"}`}
        >
          <p className="text-xs font-semibold text-indigo-800">回答期限</p>
          <p className={`mt-1 text-base font-semibold ${deadlinePassed ? "text-amber-900" : "text-indigo-950"}`}>
            {formatResponseDeadlineJa(responseDeadline, timezone)}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            期限を過ぎると候補日時が変更となる場合があります。
          </p>
        </div>
      ) : null}

      <div className="max-h-[min(28rem,50vh)] space-y-4 overflow-y-auto pr-1">
        {grouped.map(([day, daySlots]) => (
          <div key={day}>
            <p className="mb-2 text-sm font-semibold text-indigo-900">
              {formatSlotLabel(daySlots[0]!.startAt, timezone).split(" ").slice(0, 2).join(" ")}
            </p>
            <ul className="space-y-2">
              {daySlots.map((slot) => (
                <li key={slot.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-indigo-100 bg-white/90 px-3 py-2.5 transition hover:border-indigo-300">
                    <input
                      type="checkbox"
                      checked={selected.has(slot.id)}
                      onChange={() => toggle(slot.id)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-700"
                    />
                    <span className="text-sm font-medium text-slate-900">
                      {formatSlotLabel(slot.startAt, timezone)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="sticky bottom-0 space-y-3 border-t border-indigo-100 bg-indigo-50/95 pt-4">
        <button
          type="submit"
          disabled={submitting || selected.size === 0}
          className="app-btn-primary w-full rounded-lg px-4 py-3 text-base disabled:opacity-50 sm:w-auto"
        >
          {submitting ? "送信中…" : "選択した日時で回答する"}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleAlternative()}
          className="block w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 sm:w-auto"
        >
          別候補を希望する
        </button>
      </div>
    </form>
  );
}

export { formatSlotJa };
