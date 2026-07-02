"use client";

import { useCallback, useEffect, useState } from "react";
import {
  entriesForCategory,
  type IcebreakerCategory,
  type IcebreakerEntry,
  type IcebreakerStore,
} from "@/lib/coaching-icebreaker";

export function CoachingIcebreakerPanel({ matchId }: { matchId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [store, setStore] = useState<IcebreakerStore | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftCategoryId, setDraftCategoryId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryLabelDraft, setCategoryLabelDraft] = useState("");
  const [newCategoryLabel, setNewCategoryLabel] = useState("");

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
    const firstCategoryId = json.store?.categories?.[0]?.id ?? "";
    setDraftCategoryId((prev) =>
      prev && json.store?.categories?.some((c: IcebreakerCategory) => c.id === prev) ? prev : firstCategoryId,
    );
    setLoading(false);
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveEntry(entry: {
    id?: string;
    question: string;
    categoryId: string;
  }): Promise<boolean> {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/coaching/icebreaker`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(json?.error ?? "保存に失敗しました。");
      return false;
    }
    setStore(json.store);
    return true;
  }

  async function addQuestion() {
    const q = draft.trim();
    if (!q) {
      setError("質問を入力してください。");
      return;
    }
    if (!draftCategoryId) {
      setError("カテゴリを選択してください。");
      return;
    }
    const ok = await saveEntry({ question: q, categoryId: draftCategoryId });
    if (ok) setDraft("");
  }

  function startEdit(entry: IcebreakerEntry) {
    setEditingId(entry.id);
    setEditDraft(entry.question);
    setEditCategoryId(entry.categoryId);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft("");
    setEditCategoryId("");
  }

  async function saveEdit(entry: IcebreakerEntry) {
    const q = editDraft.trim();
    if (!q) {
      setError("質問を入力してください。");
      return;
    }
    if (!editCategoryId) {
      setError("カテゴリを選択してください。");
      return;
    }
    const ok = await saveEntry({
      id: entry.id,
      question: q,
      categoryId: editCategoryId,
    });
    if (ok) cancelEdit();
  }

  async function saveOrderInCategory(categoryId: string, orderedIds: string[]) {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/coaching/icebreaker`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, orderedIds }),
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

  function moveEntry(categoryId: string, index: number, direction: -1 | 1) {
    if (!store) return;
    const inCategory = entriesForCategory(store, categoryId);
    const target = index + direction;
    if (target < 0 || target >= inCategory.length) return;
    const next = inCategory.slice();
    const tmp = next[index]!;
    next[index] = next[target]!;
    next[target] = tmp;
    void saveOrderInCategory(
      categoryId,
      next.map((e) => e.id),
    );
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
    if (editingId === id) cancelEdit();
    setStore(json.store);
  }

  function startEditCategory(cat: IcebreakerCategory) {
    setEditingCategoryId(cat.id);
    setCategoryLabelDraft(cat.label);
    setError(null);
  }

  function cancelEditCategory() {
    setEditingCategoryId(null);
    setCategoryLabelDraft("");
  }

  async function saveCategory(cat: IcebreakerCategory) {
    const label = categoryLabelDraft.trim();
    if (!label) {
      setError("カテゴリ名を入力してください。");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/coaching/icebreaker`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: { id: cat.id, label } }),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(json?.error ?? "カテゴリの保存に失敗しました。");
      return;
    }
    setStore(json.store);
    cancelEditCategory();
  }

  async function addCategory() {
    const label = newCategoryLabel.trim();
    if (!label) {
      setError("カテゴリ名を入力してください。");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/coaching/icebreaker`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: { label } }),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(json?.error ?? "カテゴリの追加に失敗しました。");
      return;
    }
    setStore(json.store);
    setNewCategoryLabel("");
    const added = json.store.categories[json.store.categories.length - 1];
    if (added?.id) setDraftCategoryId(added.id);
  }

  async function deleteCategory(categoryId: string) {
    if (!confirm("このカテゴリを削除しますか？含まれる質問は別のカテゴリへ移動します。")) return;
    const res = await fetch(
      `/api/matches/${encodeURIComponent(matchId)}/coaching/icebreaker?categoryId=${encodeURIComponent(categoryId)}`,
      { method: "DELETE" },
    );
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(json?.error ?? "カテゴリの削除に失敗しました。");
      return;
    }
    setStore(json.store);
    if (editingCategoryId === categoryId) cancelEditCategory();
    if (draftCategoryId === categoryId) {
      setDraftCategoryId(json.store.categories[0]?.id ?? "");
    }
  }

  if (loading) return <p className="text-sm text-slate-500">読込中…</p>;
  if (error && !store) return <p className="text-sm text-rose-700">{error}</p>;

  const categories = store?.categories ?? [];
  const categorySelect = (value: string, onChange: (id: string) => void, className?: string) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className ?? "rounded-lg border border-slate-300 px-2 py-2 text-sm"}
    >
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label}
        </option>
      ))}
    </select>
  );

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">アイスブレイクネタ帳</h2>
        <p className="mt-1 text-sm text-slate-600">
          1on1で使う質問をカテゴリ別に登録します。各カテゴリ内では上にあるほど優先度が高い順です。
        </p>
      </div>

      {canEdit ? (
        <>
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <h3 className="text-sm font-semibold text-slate-800">カテゴリ管理</h3>
            <ul className="mt-3 space-y-2">
              {categories.map((cat) => (
                <li
                  key={cat.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                >
                  {editingCategoryId === cat.id ? (
                    <input
                      value={categoryLabelDraft}
                      onChange={(e) => setCategoryLabelDraft(e.target.value)}
                      maxLength={100}
                      className="min-w-[10rem] flex-1 rounded-md border border-indigo-300 px-2 py-1.5 text-sm"
                    />
                  ) : (
                    <span className="min-w-0 flex-1 text-sm font-medium text-slate-900">{cat.label}</span>
                  )}
                  {editingCategoryId === cat.id ? (
                    <>
                      <button
                        type="button"
                        disabled={saving || !categoryLabelDraft.trim()}
                        onClick={() => void saveCategory(cat)}
                        className="text-xs font-semibold text-indigo-700"
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={cancelEditCategory}
                        className="text-xs text-slate-600"
                      >
                        キャンセル
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startEditCategory(cat)}
                        className="text-xs text-indigo-700"
                      >
                        編集
                      </button>
                      {categories.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => void deleteCategory(cat.id)}
                          className="text-xs text-rose-700"
                        >
                          削除
                        </button>
                      ) : null}
                    </>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={newCategoryLabel}
                onChange={(e) => setNewCategoryLabel(e.target.value)}
                placeholder="新しいカテゴリ名"
                maxLength={100}
                className="min-w-[10rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={saving || !newCategoryLabel.trim()}
                onClick={() => void addCategory()}
                className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-semibold text-indigo-800 disabled:opacity-50"
              >
                カテゴリを追加
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {categorySelect(draftCategoryId, setDraftCategoryId)}
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
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
              {saving ? "保存中…" : "登録"}
            </button>
          </div>
        </>
      ) : null}

      <div className="space-y-6">
        {categories.map((cat) => {
          const entries = store ? entriesForCategory(store, cat.id) : [];
          return (
            <div key={cat.id} className="space-y-2">
              <h3 className="text-base font-semibold text-indigo-950">{cat.label}</h3>
              <ol className="space-y-2">
                {entries.length === 0 ? (
                  <li className="text-sm text-slate-500">このカテゴリにはまだ質問がありません。</li>
                ) : (
                  entries.map((e, i) => (
                    <li
                      key={e.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm"
                    >
                      <span className="w-6 shrink-0 text-center text-xs font-bold text-slate-400">
                        {i + 1}
                      </span>
                      {editingId === e.id ? (
                        <>
                          {categorySelect(editCategoryId, setEditCategoryId, "rounded-md border border-indigo-300 px-2 py-1.5 text-sm")}
                          <input
                            value={editDraft}
                            onChange={(ev) => setEditDraft(ev.target.value)}
                            maxLength={500}
                            className="min-w-[12rem] flex-1 rounded-md border border-indigo-300 px-2 py-1.5 text-sm"
                          />
                        </>
                      ) : (
                        <p className="min-w-0 flex-1 text-sm text-slate-900">{e.question}</p>
                      )}
                      {canEdit ? (
                        <div className="flex shrink-0 items-center gap-1">
                          {editingId === e.id ? (
                            <>
                              <button
                                type="button"
                                disabled={saving || !editDraft.trim()}
                                onClick={() => void saveEdit(e)}
                                className="text-xs font-semibold text-indigo-700"
                              >
                                保存
                              </button>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={cancelEdit}
                                className="text-xs text-slate-600"
                              >
                                キャンセル
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={saving || i === 0}
                                onClick={() => moveEntry(cat.id, i, -1)}
                                className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-700 disabled:opacity-40"
                                title="優先度を上げる"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                disabled={saving || i === entries.length - 1}
                                onClick={() => moveEntry(cat.id, i, 1)}
                                className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-700 disabled:opacity-40"
                                title="優先度を下げる"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                onClick={() => startEdit(e)}
                                className="rounded px-2 py-0.5 text-xs text-indigo-700"
                              >
                                編集
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteEntry(e.id)}
                                className="rounded px-2 py-0.5 text-xs text-rose-700"
                              >
                                削除
                              </button>
                            </>
                          )}
                        </div>
                      ) : null}
                    </li>
                  ))
                )}
              </ol>
            </div>
          );
        })}
      </div>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}
