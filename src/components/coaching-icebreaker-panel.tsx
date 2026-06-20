"use client";

import { useCallback, useEffect, useState } from "react";
import type { IcebreakerEntry, IcebreakerStore } from "@/lib/coaching-icebreaker";

export function CoachingIcebreakerPanel({ matchId }: { matchId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [store, setStore] = useState<IcebreakerStore | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState<Partial<IcebreakerEntry> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
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

  async function saveEntry(entry: Partial<IcebreakerEntry>) {
    setSaving(true);
    const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/coaching/icebreaker`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry }),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(json?.error ?? "保存に失敗しました。");
      return;
    }
    setStore(json.store);
    setEditing(null);
  }

  async function deleteEntry(id: string) {
    if (!confirm("このネタを削除しますか？")) return;
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
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">アイスブレイクネタ帳</h2>
        <p className="mt-1 text-sm text-slate-600">1on1で使えるアイスブレイクのネタを蓄積します。</p>
      </div>

      {canEdit ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          {editing ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={editing.title ?? ""}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                placeholder="タイトル"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
              />
              <textarea
                value={editing.content ?? ""}
                onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                placeholder="アイスブレイク内容"
                rows={3}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
              />
              <input
                value={editing.useCase ?? ""}
                onChange={(e) => setEditing({ ...editing, useCase: e.target.value })}
                placeholder="使う場面"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                value={editing.targetAudience ?? ""}
                onChange={(e) => setEditing({ ...editing, targetAudience: e.target.value })}
                placeholder="対象者"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <textarea
                value={editing.memo ?? ""}
                onChange={(e) => setEditing({ ...editing, memo: e.target.value })}
                placeholder="メモ"
                rows={2}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
              />
              <input
                type="date"
                value={editing.registeredAt ?? new Date().toISOString().slice(0, 10)}
                onChange={(e) => setEditing({ ...editing, registeredAt: e.target.value })}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="flex gap-2 sm:col-span-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveEntry(editing)}
                  className="rounded-lg bg-indigo-700 px-3 py-1.5 text-sm font-semibold text-white"
                >
                  保存
                </button>
                <button type="button" onClick={() => setEditing(null)} className="text-sm text-slate-600">
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() =>
                setEditing({
                  title: "",
                  content: "",
                  useCase: "",
                  targetAudience: "",
                  memo: "",
                  registeredAt: new Date().toISOString().slice(0, 10),
                })
              }
              className="rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-semibold text-indigo-800"
            >
              ＋ ネタを追加
            </button>
          )}
        </div>
      ) : null}

      <ul className="space-y-3">
        {entries.length === 0 ? (
          <li className="text-sm text-slate-500">まだ登録がありません。</li>
        ) : (
          entries.map((e) => (
            <li key={e.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{e.title}</h3>
                  <p className="text-xs text-slate-500">登録日: {e.registeredAt}</p>
                </div>
                {canEdit ? (
                  <div className="flex gap-2 text-xs">
                    <button type="button" onClick={() => setEditing(e)} className="text-indigo-700 underline">
                      編集
                    </button>
                    <button type="button" onClick={() => void deleteEntry(e.id)} className="text-rose-700 underline">
                      削除
                    </button>
                  </div>
                ) : null}
              </div>
              {e.content ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{e.content}</p> : null}
              <dl className="mt-3 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                {e.useCase ? (
                  <div>
                    <dt className="font-semibold">使う場面</dt>
                    <dd>{e.useCase}</dd>
                  </div>
                ) : null}
                {e.targetAudience ? (
                  <div>
                    <dt className="font-semibold">対象者</dt>
                    <dd>{e.targetAudience}</dd>
                  </div>
                ) : null}
                {e.memo ? (
                  <div className="sm:col-span-2">
                    <dt className="font-semibold">メモ</dt>
                    <dd>{e.memo}</dd>
                  </div>
                ) : null}
              </dl>
            </li>
          ))
        )}
      </ul>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}
