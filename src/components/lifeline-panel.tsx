"use client";

import { useCallback, useEffect, useState } from "react";
import type { LifelineEvent } from "@/lib/companion-lifeline";

function LifelineGraph({ events }: { events: LifelineEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-slate-500">グラフを表示する出来事がありません。</p>;
  const w = 600;
  const h = 200;
  const pad = 24;
  const sorted = [...events].sort((a, b) => a.sortOrder - b.sortOrder);
  const pts = sorted.map((e, i) => {
    const x = pad + (i / Math.max(1, sorted.length - 1)) * (w - pad * 2);
    const y = h / 2 - (e.emotionScore / 5) * (h / 2 - pad);
    return { x, y, e };
  });
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white">
      <line x1={pad} y1={h / 2} x2={w - pad} y2={h / 2} stroke="#cbd5e1" />
      <path d={path} fill="none" stroke="#4f46e5" strokeWidth={2} />
      {pts.map((p) => (
        <circle key={p.e.id} cx={p.x} cy={p.y} r={4} fill="#4f46e5" />
      ))}
      <text x={pad} y={14} className="fill-slate-500 text-[10px]">
        感情スコア（-5〜+5）
      </text>
    </svg>
  );
}

const emptyEvent = (i: number): LifelineEvent => ({
  id: "",
  ageOrPeriod: "",
  title: "",
  detail: "",
  emotionScore: 0,
  emotionReason: "",
  insights: "",
  locked: false,
  sortOrder: i,
});

export function LifelinePanel({ matchId }: { matchId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [events, setEvents] = useState<LifelineEvent[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [viewMode, setViewMode] = useState("self");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/matches/${matchId}/lifeline`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError((json as { error?: string })?.error ?? "読み込みに失敗しました。");
      return;
    }
    setEvents((json as { chart?: { events?: LifelineEvent[] } }).chart?.events ?? []);
    setCanEdit(Boolean((json as { permissions?: { canEditClient?: boolean } }).permissions?.canEditClient));
    setViewMode((json as { permissions?: { lifelineViewMode?: string } }).permissions?.lifelineViewMode ?? "self");
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateEvent(index: number, patch: Partial<LifelineEvent>) {
    setEvents((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }

  function addEvent() {
    setEvents((prev) => [...prev, emptyEvent(prev.length)]);
  }

  function removeEvent(index: number) {
    setEvents((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/matches/${matchId}/lifeline`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError((json as { error?: string })?.error ?? "保存に失敗しました。");
      return;
    }
    setEvents((json as { chart?: { events?: LifelineEvent[] } }).chart?.events ?? events);
    setNotice("保存しました。");
    void load();
  }

  if (loading) return <p className="text-sm text-slate-500">読込中…</p>;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">ライフラインチャート</h2>
        <p className="mt-2 text-sm text-slate-600">
          人生の出来事と感情スコアを記録します。鍵付きにした内容は本人以外には非公開です（管理者は全件閲覧可）。
        </p>
        {viewMode === "manager" ? (
          <p className="mt-2 text-xs text-amber-800">上司向け表示: 公開許可された出来事と、価値観・強み・傾向のみ表示されます。</p>
        ) : null}
      </div>

      <LifelineGraph events={events} />

      {canEdit ? (
        <div className="space-y-4">
          {events.map((e, i) => (
            <article key={e.id || i} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
              <div className="flex justify-between gap-2">
                <h3 className="font-semibold text-slate-900">出来事 {i + 1}</h3>
                <button type="button" onClick={() => removeEvent(i)} className="text-sm text-red-700">
                  削除
                </button>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="text-sm">
                  年齢・時期
                  <input value={e.ageOrPeriod} onChange={(ev) => updateEvent(i, { ageOrPeriod: ev.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
                </label>
                <label className="text-sm">
                  感情スコア（-5〜+5）
                  <input type="number" min={-5} max={5} value={e.emotionScore} onChange={(ev) => updateEvent(i, { emotionScore: Number(ev.target.value) })} className="mt-1 w-full rounded-lg border px-3 py-2" />
                </label>
              </div>
              <label className="block text-sm">
                タイトル
                <input value={e.title} onChange={(ev) => updateEvent(i, { title: ev.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
              </label>
              <label className="block text-sm">
                詳細
                <textarea rows={2} value={e.detail} onChange={(ev) => updateEvent(i, { detail: ev.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
              </label>
              <label className="block text-sm">
                なぜ気持ちが上がった／下がったか
                <textarea rows={2} value={e.emotionReason} onChange={(ev) => updateEvent(i, { emotionReason: ev.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
              </label>
              <label className="block text-sm">
                価値観・強み・課題
                <textarea rows={2} value={e.insights} onChange={(ev) => updateEvent(i, { insights: ev.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={e.locked} onChange={(ev) => updateEvent(i, { locked: ev.target.checked })} />
                鍵付き（本人以外には非公開）
              </label>
            </article>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={addEvent} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
              出来事を追加
            </button>
            <button type="button" disabled={saving} onClick={() => void save()} className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "保存中…" : "保存する"}
            </button>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {events.map((e) => (
            <li key={e.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-semibold text-slate-900">{e.title || "（無題）"}</p>
              <p className="text-xs text-slate-500">{e.ageOrPeriod}</p>
              {e.detail ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{e.detail}</p> : null}
              {e.insights ? <p className="mt-2 text-sm text-indigo-900">洞察: {e.insights}</p> : null}
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-800">{notice}</p> : null}
    </section>
  );
}
