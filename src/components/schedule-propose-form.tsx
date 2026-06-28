"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  generateSlotsFromTimeRanges,
  MAX_PROPOSAL_SLOTS,
  MIN_PROPOSAL_SLOTS_WARNING,
  type TimeRangeInput,
} from "@/lib/generate-slots-from-ranges";
import type { SlotWindowSettings } from "@/lib/slot-schedule";
import { slotStartPickerStepLabel, slotStartPickerStepMinutes } from "@/lib/slot-schedule";

type RangeRow = TimeRangeInput & { key: string };

function emptyRange(): RangeRow {
  return { key: String(Date.now()) + Math.random(), dateYmd: "", startTime: "18:00", endTime: "21:00" };
}

function weekdayJa(dateYmd: string) {
  if (!dateYmd) return "";
  const d = new Date(`${dateYmd}T12:00:00`);
  if (Number.isNaN(d.valueOf())) return "";
  return new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(d);
}

function isWeekendDateString(dateYmd: string) {
  const d = new Date(`${dateYmd}T12:00:00`);
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function ScheduleProposeForm({
  scheduleSettings,
  totalSessions,
  submitting,
  justSent,
  onSubmit,
}: {
  scheduleSettings: SlotWindowSettings;
  totalSessions: number;
  submitting: boolean;
  justSent: boolean;
  onSubmit: (payload: { sessionNumber: number; timeRanges: TimeRangeInput[] }) => void | Promise<void>;
}) {
  const [ranges, setRanges] = useState<RangeRow[]>([emptyRange(), emptyRange()]);
  const [sessionNumber, setSessionNumber] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const slotPickerStepText = slotStartPickerStepLabel(
    slotStartPickerStepMinutes(scheduleSettings.slotDurationMinutes),
  );

  const preview = useMemo(() => {
    const valid = ranges.filter((r) => r.dateYmd && r.startTime && r.endTime);
    if (valid.length === 0) return { count: 0, truncated: false, slots: [] as Array<{ startAt: Date }> };
    try {
      const result = generateSlotsFromTimeRanges(valid, scheduleSettings);
      return { count: result.slots.length, truncated: result.truncated, slots: result.slots };
    } catch {
      return { count: 0, truncated: false, slots: [] };
    }
  }, [ranges, scheduleSettings]);

  function addRange() {
    setRanges((prev) => [...prev, emptyRange()]);
  }

  function updateRange(key: string, patch: Partial<TimeRangeInput>) {
    setRanges((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRange(key: string) {
    setRanges((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const valid = ranges.filter((r) => r.dateYmd && r.startTime && r.endTime);
    if (valid.length === 0) {
      setError("対応可能な時間帯を1件以上入力してください。");
      return;
    }
    for (const r of valid) {
      if (!scheduleSettings.allowWeekends && isWeekendDateString(r.dateYmd)) {
        setError(`${r.dateYmd}: 土曜・日曜は候補として指定できません。`);
        return;
      }
      if (r.startTime >= r.endTime) {
        setError(`${r.dateYmd}: 終了時刻は開始時刻より後にしてください。`);
        return;
      }
    }
    if (preview.count === 0) {
      setError("入力された時間帯から候補日時を生成できませんでした。");
      return;
    }
    await onSubmit({
      sessionNumber,
      timeRanges: valid.map(({ dateYmd, startTime, endTime }) => ({ dateYmd, startTime, endTime })),
    });
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 rounded-2xl border border-slate-200 bg-white px-5 py-4">
      {justSent ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
          ✓ 送信完了：候補日時をクライアントに通知しました。
        </div>
      ) : null}

      <div>
        <h3 className="text-xl font-semibold">対応可能な時間帯を登録する</h3>
        <p className="mt-1 text-sm text-slate-600">
          日付ごとに対応可能な時間帯を入力すると、セッション時間（{scheduleSettings.slotDurationMinutes}分）に応じて候補日時が自動生成されます（{slotPickerStepText}刻み）。
        </p>
        <label className="mt-3 block max-w-xs text-base font-medium text-slate-800">
          何回目の日程調整か
          <select
            value={sessionNumber}
            onChange={(e) => setSessionNumber(Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-base"
          >
            {Array.from({ length: Math.max(1, totalSessions) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} 回目
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-3">
        {ranges.map((row) => (
          <fieldset
            key={row.key}
            className="grid gap-3 rounded-xl border border-dashed border-slate-300 p-4 sm:grid-cols-[1fr_auto_auto_auto]"
          >
            <label className="block text-sm font-medium text-slate-800">
              日付
              <input
                type="date"
                required
                value={row.dateYmd}
                onChange={(e) => updateRange(row.key, { dateYmd: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5"
              />
              {row.dateYmd ? (
                <span className="mt-0.5 block text-xs text-slate-500">{weekdayJa(row.dateYmd)}</span>
              ) : null}
            </label>
            <label className="block text-sm font-medium text-slate-800">
              開始
              <input
                type="time"
                required
                value={row.startTime}
                onChange={(e) => updateRange(row.key, { startTime: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5"
              />
            </label>
            <label className="block text-sm font-medium text-slate-800">
              終了
              <input
                type="time"
                required
                value={row.endTime}
                onChange={(e) => updateRange(row.key, { endTime: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => removeRange(row.key)}
                disabled={ranges.length <= 1}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                削除
              </button>
            </div>
          </fieldset>
        ))}
        <button
          type="button"
          onClick={addRange}
          className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-100"
        >
          ＋ 時間帯を追加
        </button>
      </div>

      {preview.count > 0 ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-950">
          <p className="font-semibold">この内容で {preview.count} 件の候補日時が生成されます。</p>
          {preview.count < MIN_PROPOSAL_SLOTS_WARNING ? (
            <p className="mt-2 text-amber-900">
              候補日時が少ないため、再調整になる可能性があります。可能であれば別日程も追加してください。
            </p>
          ) : null}
          {preview.truncated ? (
            <p className="mt-2 text-amber-900">
              候補が多いため、表示件数を {MAX_PROPOSAL_SLOTS} 件に制限しています。
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}

      <div className="space-y-2">
        <button
          type="submit"
          disabled={submitting || preview.count === 0}
          className="app-btn-primary rounded-lg px-4 py-2.5 text-base disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "送信中…" : `候補日時を提示する（${preview.count}件）`}
        </button>
        <p className="text-xs text-slate-500">
          → クライアントにメールとアプリ通知が届き、日程調整タブで回答待ちになります。
        </p>
      </div>
    </form>
  );
}
