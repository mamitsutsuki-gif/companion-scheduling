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
type SessionProposal = { sessionNumber: number; timeRanges: TimeRangeInput[] };

function emptyRange(): RangeRow {
  return {
    key: `${Date.now()}-${Math.random()}`,
    dateYmd: "",
    startTime: "09:00",
    endTime: "17:00",
  };
}

function weekdayJa(dateYmd: string) {
  if (!dateYmd) return "";
  const d = new Date(`${dateYmd}T12:00:00`);
  if (Number.isNaN(d.valueOf())) return "";
  return new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(d);
}

function isWeekendDateString(dateYmd: string) {
  const d = new Date(`${dateYmd}T12:00:00`);
  return d.getDay() === 0 || d.getDay() === 6;
}

function shiftDateYmd(dateYmd: string, mode: "week" | "biweekly" | "month"): string {
  if (!dateYmd) return "";
  const d = new Date(`${dateYmd}T12:00:00`);
  if (Number.isNaN(d.valueOf())) return "";
  if (mode === "month") {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
  } else {
    d.setDate(d.getDate() + (mode === "week" ? 7 : 14));
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ScheduleProposeForm({
  scheduleSettings,
  totalSessions,
  submitting,
  justSent,
  blockedSessionNumbers = [],
  defaultSessionNumbers,
  onSubmit,
}: {
  scheduleSettings: SlotWindowSettings;
  totalSessions: number;
  submitting: boolean;
  justSent: boolean;
  blockedSessionNumbers?: number[];
  defaultSessionNumbers?: number[];
  onSubmit: (payload: { proposals: SessionProposal[] }) => void | Promise<void>;
}) {
  const blocked = useMemo(() => new Set(blockedSessionNumbers), [blockedSessionNumbers]);
  const allSessions = useMemo(
    () => Array.from({ length: Math.max(1, totalSessions) }, (_, i) => i + 1),
    [totalSessions],
  );
  const initialSelected = useMemo(() => {
    const preferred = (defaultSessionNumbers ?? []).filter((n) => !blocked.has(n));
    if (preferred.length > 0) return preferred;
    const firstOpen = allSessions.find((n) => !blocked.has(n));
    return firstOpen ? [firstOpen] : [];
  }, [defaultSessionNumbers, blocked, allSessions]);

  const [sessionNumbers, setSessionNumbers] = useState<number[]>(initialSelected);
  const [rangesBySession, setRangesBySession] = useState<Record<number, RangeRow[]>>(() =>
    Object.fromEntries(initialSelected.map((n) => [n, [emptyRange(), emptyRange()]])),
  );
  const [error, setError] = useState<string | null>(null);

  const selectedSessions = sessionNumbers
    .filter((n) => !blocked.has(n))
    .sort((a, b) => a - b);
  const slotPickerStepText = slotStartPickerStepLabel(
    slotStartPickerStepMinutes(scheduleSettings.slotDurationMinutes),
  );

  function toggleSession(n: number) {
    if (blocked.has(n)) return;
    setSessionNumbers((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n);
      return [...prev, n].sort((a, b) => a - b);
    });
    setRangesBySession((prev) =>
      prev[n] ? prev : { ...prev, [n]: [emptyRange(), emptyRange()] },
    );
  }

  function updateRange(sessionNumber: number, key: string, patch: Partial<TimeRangeInput>) {
    setRangesBySession((prev) => ({
      ...prev,
      [sessionNumber]: (prev[sessionNumber] ?? []).map((r) =>
        r.key === key ? { ...r, ...patch } : r,
      ),
    }));
  }

  function addRange(sessionNumber: number) {
    setRangesBySession((prev) => ({
      ...prev,
      [sessionNumber]: [...(prev[sessionNumber] ?? []), emptyRange()],
    }));
  }

  function removeRange(sessionNumber: number, key: string) {
    setRangesBySession((prev) => {
      const rows = prev[sessionNumber] ?? [];
      return {
        ...prev,
        [sessionNumber]: rows.length <= 1 ? rows : rows.filter((r) => r.key !== key),
      };
    });
  }

  function copyPrevious(sessionNumber: number, mode: "week" | "biweekly" | "month") {
    const index = selectedSessions.indexOf(sessionNumber);
    const previous = index > 0 ? selectedSessions[index - 1] : null;
    if (previous == null) return;
    const source = rangesBySession[previous] ?? [];
    setRangesBySession((prev) => ({
      ...prev,
      [sessionNumber]: source.map((r) => ({
        ...r,
        key: `${Date.now()}-${Math.random()}`,
        dateYmd: shiftDateYmd(r.dateYmd, mode),
      })),
    }));
  }

  function previewFor(sessionNumber: number) {
    const valid = (rangesBySession[sessionNumber] ?? []).filter(
      (r) => r.dateYmd && r.startTime && r.endTime,
    );
    if (valid.length === 0) return { count: 0, truncated: false };
    try {
      const result = generateSlotsFromTimeRanges(valid, scheduleSettings);
      return { count: result.slots.length, truncated: result.truncated };
    } catch {
      return { count: 0, truncated: false };
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (selectedSessions.length === 0) {
      setError("対象の回を1つ以上選んでください。");
      return;
    }

    const proposals: SessionProposal[] = [];
    for (const sessionNumber of selectedSessions) {
      const valid = (rangesBySession[sessionNumber] ?? []).filter(
        (r) => r.dateYmd && r.startTime && r.endTime,
      );
      if (valid.length === 0) {
        setError(`第${sessionNumber}回の候補日時を1件以上入力してください。`);
        return;
      }
      for (const r of valid) {
        if (!scheduleSettings.allowWeekends && isWeekendDateString(r.dateYmd)) {
          setError(`第${sessionNumber}回 ${r.dateYmd}: 土曜・日曜は指定できません。`);
          return;
        }
        if (r.startTime >= r.endTime) {
          setError(`第${sessionNumber}回 ${r.dateYmd}: 終了時刻を開始時刻より後にしてください。`);
          return;
        }
      }
      if (previewFor(sessionNumber).count === 0) {
        setError(`第${sessionNumber}回の候補日時を生成できませんでした。`);
        return;
      }
      proposals.push({
        sessionNumber,
        timeRanges: valid.map(({ dateYmd, startTime, endTime }) => ({
          dateYmd,
          startTime,
          endTime,
        })),
      });
    }
    await onSubmit({ proposals });
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-5 rounded-2xl border border-slate-200 bg-white px-4 py-4 sm:px-5"
    >
      {justSent ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
          ✓ 送信完了：各回の候補日時をクライアントに通知しました。
        </div>
      ) : null}

      <div>
        <h3 className="text-xl font-semibold">候補日時をまとめて作る</h3>
        <p className="mt-1 text-sm text-slate-600">
          送る回を選び、回ごとに候補日時を設定します。候補は「第1回」「第2回」のように分かれて届きます。
        </p>
        <fieldset className="mt-3">
          <legend className="text-base font-medium text-slate-800">候補を送る回</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {allSessions.map((n) => {
              const isBlocked = blocked.has(n);
              const checked = sessionNumbers.includes(n);
              return (
                <label
                  key={n}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${
                    isBlocked
                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                      : checked
                        ? "cursor-pointer border-indigo-400 bg-indigo-50 font-semibold text-indigo-950"
                        : "cursor-pointer border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isBlocked}
                    onChange={() => toggleSession(n)}
                    className="rounded border-slate-300"
                  />
                  第{n}回
                  {isBlocked ? <span className="text-[10px] font-normal">（調整中）</span> : null}
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      <div className="space-y-4">
        {selectedSessions.map((sessionNumber, index) => {
          const rows = rangesBySession[sessionNumber] ?? [];
          const preview = previewFor(sessionNumber);
          return (
            <section
              key={sessionNumber}
              className="rounded-2xl border-2 border-indigo-100 bg-indigo-50/35 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                    Session {sessionNumber}
                  </p>
                  <h4 className="mt-0.5 text-lg font-semibold text-indigo-950">
                    第{sessionNumber}回の候補
                  </h4>
                </div>
                {index > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => copyPrevious(sessionNumber, "week")}
                      className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-800"
                    >
                      前回候補を＋1週
                    </button>
                    <button
                      type="button"
                      onClick={() => copyPrevious(sessionNumber, "biweekly")}
                      className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-800"
                    >
                      ＋2週
                    </button>
                    <button
                      type="button"
                      onClick={() => copyPrevious(sessionNumber, "month")}
                      className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-800"
                    >
                      ＋1か月
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="mt-3 space-y-3">
                {rows.map((row) => (
                  <fieldset
                    key={row.key}
                    className="grid gap-3 rounded-xl border border-dashed border-indigo-200 bg-white p-3 sm:grid-cols-[1fr_auto_auto_auto]"
                  >
                    <label className="block text-sm font-medium text-slate-800">
                      日付
                      <input
                        type="date"
                        required
                        value={row.dateYmd}
                        onChange={(e) =>
                          updateRange(sessionNumber, row.key, { dateYmd: e.target.value })
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                      />
                      {row.dateYmd ? (
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {weekdayJa(row.dateYmd)}
                        </span>
                      ) : null}
                    </label>
                    <label className="block text-sm font-medium text-slate-800">
                      開始
                      <input
                        type="time"
                        required
                        value={row.startTime}
                        onChange={(e) =>
                          updateRange(sessionNumber, row.key, { startTime: e.target.value })
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                      />
                    </label>
                    <label className="block text-sm font-medium text-slate-800">
                      終了
                      <input
                        type="time"
                        required
                        value={row.endTime}
                        onChange={(e) =>
                          updateRange(sessionNumber, row.key, { endTime: e.target.value })
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                      />
                    </label>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => removeRange(sessionNumber, row.key)}
                        disabled={rows.length <= 1}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 disabled:opacity-40"
                      >
                        削除
                      </button>
                    </div>
                  </fieldset>
                ))}
                <button
                  type="button"
                  onClick={() => addRange(sessionNumber)}
                  className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-semibold text-indigo-900"
                >
                  ＋ 第{sessionNumber}回の候補日を追加
                </button>
              </div>

              <p className="mt-3 text-sm text-indigo-900">
                {preview.count > 0
                  ? `第${sessionNumber}回として ${preview.count} 件の候補を送ります。`
                  : `日付と時間帯を入力すると、${slotPickerStepText}刻みで候補を作成します。`}
                {preview.count > 0 && preview.count < MIN_PROPOSAL_SLOTS_WARNING
                  ? " 可能であれば別日程も追加してください。"
                  : ""}
                {preview.truncated ? ` 候補は最大 ${MAX_PROPOSAL_SLOTS} 件です。` : ""}
              </p>
            </section>
          );
        })}
      </div>

      {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}

      <div className="space-y-2">
        <button
          type="submit"
          disabled={submitting || selectedSessions.length === 0}
          className="app-btn-primary rounded-lg px-4 py-2.5 text-base disabled:opacity-60"
        >
          {submitting
            ? "送信中…"
            : `${selectedSessions.map((n) => `第${n}回`).join("・")}の候補をまとめて送る`}
        </button>
        <p className="text-xs text-slate-500">
          → クライアントには回ごとの回答欄が表示され、それぞれ別に選べます。
        </p>
      </div>
    </form>
  );
}
