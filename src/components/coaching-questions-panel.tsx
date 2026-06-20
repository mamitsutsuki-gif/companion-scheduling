"use client";

import { useCallback, useEffect, useState } from "react";
import {
  QUESTION_QUADRANTS,
  type CoachingQuestion,
  type CoachingQuestionStore,
  type QuestionQuadrant,
} from "@/lib/coaching-questions";

const QUADRANT_IDS = QUESTION_QUADRANTS.map((q) => q.id).filter((id) => id !== "unassigned");

export function CoachingQuestionsPanel({ matchId }: { matchId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [store, setStore] = useState<CoachingQuestionStore | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState<Partial<CoachingQuestion> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/coaching/questions`, {
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

  async function saveQuestion(q: Partial<CoachingQuestion>) {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/coaching/questions`, {
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
    setEditing(null);
  }

  async function deleteQuestion(id: string) {
    if (!confirm("この質問を削除しますか？")) return;
    const res = await fetch(
      `/api/matches/${encodeURIComponent(matchId)}/coaching/questions?id=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(json?.error ?? "削除に失敗しました。");
      return;
    }
    setStore(json.store);
  }

  async function setQuadrant(q: CoachingQuestion, quadrant: QuestionQuadrant) {
    await saveQuestion({ ...q, quadrant });
  }

  if (loading) return <p className="text-sm text-slate-500">読込中…</p>;
  if (error && !store) return <p className="text-sm text-rose-700">{error}</p>;

  const questions = store?.questions ?? [];
  const byQuadrant = (qid: QuestionQuadrant) => questions.filter((q) => q.quadrant === qid);
  const unassigned = questions.filter((q) => q.quadrant === "unassigned");

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">質問リスト</h2>
        <p className="mt-1 text-sm text-slate-600">1on1で使う質問を登録し、4象限に分類します。</p>
      </div>

      {canEdit ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          {editing ? (
            <div className="space-y-3">
              <input
                value={editing.text ?? ""}
                onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                placeholder="質問文"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                value={editing.purpose ?? ""}
                onChange={(e) => setEditing({ ...editing, purpose: e.target.value })}
                placeholder="目的"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <textarea
                value={editing.memo ?? ""}
                onChange={(e) => setEditing({ ...editing, memo: e.target.value })}
                placeholder="メモ"
                rows={2}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveQuestion(editing)}
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
              onClick={() => setEditing({ text: "", purpose: "", memo: "" })}
              className="rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-semibold text-indigo-800"
            >
              ＋ 質問を追加
            </button>
          )}
        </div>
      ) : null}

      {unassigned.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-semibold text-amber-950">未分類（{unassigned.length}件）</h3>
          <ul className="mt-2 space-y-2">
            {unassigned.map((q) => (
              <li key={q.id} className="rounded-lg border border-amber-100 bg-white p-3 text-sm">
                <p className="font-medium text-slate-900">{q.text}</p>
                {canEdit ? (
                  <select
                    value={q.quadrant}
                    onChange={(e) => void setQuadrant(q, e.target.value as QuestionQuadrant)}
                    className="mt-2 rounded border border-slate-300 px-2 py-1 text-xs"
                  >
                    <option value="unassigned">象限を選択…</option>
                    {QUADRANT_IDS.map((id) => (
                      <option key={id} value={id}>
                        {QUESTION_QUADRANTS.find((x) => x.id === id)?.short}
                      </option>
                    ))}
                  </select>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {QUADRANT_IDS.map((qid) => (
          <div key={qid} className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-indigo-950">
              {QUESTION_QUADRANTS.find((q) => q.id === qid)?.label}
            </h3>
            <ul className="mt-3 space-y-2">
              {byQuadrant(qid).length === 0 ? (
                <li className="text-xs text-slate-500">まだ質問がありません</li>
              ) : (
                byQuadrant(qid).map((q) => (
                  <li key={q.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
                    <p className="font-medium text-slate-900">{q.text}</p>
                    {q.purpose ? <p className="mt-1 text-xs text-slate-600">目的: {q.purpose}</p> : null}
                    {canEdit ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setEditing(q)}
                          className="text-xs text-indigo-700 underline"
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteQuestion(q.id)}
                          className="text-xs text-rose-700 underline"
                        >
                          削除
                        </button>
                        <select
                          value={q.quadrant}
                          onChange={(e) => void setQuadrant(q, e.target.value as QuestionQuadrant)}
                          className="rounded border border-slate-300 px-1 py-0.5 text-xs"
                        >
                          {QUADRANT_IDS.map((id) => (
                            <option key={id} value={id}>
                              {QUESTION_QUADRANTS.find((x) => x.id === id)?.short}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </div>
        ))}
      </div>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}
