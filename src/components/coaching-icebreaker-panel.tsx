"use client";

import { useCallback, useEffect, useState } from "react";
import type { IcebreakerEntry, IcebreakerStore } from "@/lib/coaching-icebreaker";

export function CoachingIcebreakerPanel({ matchId }: { matchId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [store, setStore] = useState<IcebreakerStore | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [draft, setDraft] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/coaching/icebreaker`, {
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(json?.error ?? "読み込みに失敗しました。");
      setLoading(false);
      return;
    }
    setStore(json.store);
    setCanEdit(Boolean(json.permissions?.canEditClient));
    setLoading(false);
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addQuestion() {
    const q = draft.trim();
    if (!q) {
      setError("質問を入力してください。");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/coaching/icebreaker`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q }),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(json?.error ?? "保存に失敗しました。");
      return;
    }
    setStore(json.store);
    setDraft("");
  }

  async function saveOrder(entries: IcebreakerEntry[]) {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/coaching/icebreaker`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: entries.map((e) => e.id) }),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(json?.error ?? "並び替えの保存に失敗しました。");
      void load();
      return;
    }
    setStore(json.store);
  }

  function moveEntry(index: number, direction: -1 | 1) {
    const entries = store?.entries ?? [];
    const target = index + direction;
    if (target < 0 || target >= entries.length) return;
    const next = entries.slice();
    const tmp = next[index]!;
    next[index] = next[target]!;
    next[target] = tmp;
    setStore((s) => (s ? { ...s, entries: next } : s));
    void saveOrder(next);
  }

  async function deleteEntry(id: string) {
    if (!confirm("この質問を削除しますか？")) return;
    const res = await fetch(
      `/api/matches/${encodeURIComponent(matchId)}/coaching/icebreaker?id=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(json?.error ?? "削除に失敗しました。");
      return;
    }
    setStore(json.store);
  }

  if (loading) return <p className="text-sm text-slate-500">読込中…</p>;
  if (error && !store) return <p className="text-sm text-rose-700">{error}</p>;

  const entries = store?.entries ?? [];

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">アイスブレイクネタ帳</h2>
        <p className="mt-1 text-sm text-slate-600">
          1on1で使う質問を1行ずつ登録します。上にあるほど優先度が高い順です。
        </p>
      </div>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addQuestion();
              }
            }}
            placeholder="例：最近うれしかったことは？"
            maxLength={500}
            className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={saving || !draft.trim()}
            onClick={() => void addQuestion()}
            className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "保存中…" : "追加"}
          </button>
        </div>
      ) : null}

      <ol className="space-y-2">
        {entries.length === 0 ? (
          <li className="text-sm text-slate-500">まだ登録がありません。</li>
        ) : (
          entries.map((e, i) => (
            <li
              key={e.id}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm"
            >
              <span className="w-6 shrink-0 text-center text-xs font-bold text-slate-400">{i + 1}</span>
              <p className="min-w-0 flex-1 text-sm text-slate-900">{e.question}</p>
              {canEdit ? (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={saving || i === 0}
                    onClick={() => moveEntry(i, -1)}
                    className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-700 disabled:opacity-40"
                    title="優先度を上げる"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={saving || i === entries.length - 1}
                    onClick={() => moveEntry(i, 1)}
                    className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-700 disabled:opacity-40"
                    title="優先度を下げる"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteEntry(e.id)}
                    className="rounded px-2 py-0.5 text-xs text-rose-700"
                  >
                    削除
                  </button>
                </div>
              ) : null}
            </li>
          ))
        )}
      </ol>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}
