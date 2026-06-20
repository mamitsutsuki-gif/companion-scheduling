"use client";

import { useCallback, useEffect, useState } from "react";
import {
  QUESTION_QUADRANTS,
  type CoachingQuestion,
  type CoachingQuestionStore,
  type QuestionQuadrant,
} from "@/lib/coaching-questions";

const QUADRANT_IDS = QUESTION_QUADRANTS.map((q) => q.id).filter(
  (id): id is Exclude<QuestionQuadrant, "unassigned"> => id !== "unassigned",
);

export function CoachingQuestionsPanel({ matchId }: { matchId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [store, setStore] = useState<CoachingQuestionStore | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [draft, setDraft] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
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
  }

  async function addQuestion() {
    const text = draft.trim();
    if (!text) {
      setError("質問を入力してください。");
      return;
    }
    await saveQuestion({ text, quadrant: "unassigned" });
    setDraft("");
  }

  async function setQuadrant(q: CoachingQuestion, quadrant: QuestionQuadrant) {
    if (quadrant === "unassigned") return;
    await saveQuestion({ ...q, quadrant });
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

  if (loading) return <p className="text-sm text-slate-500">読込中…</p>;
  if (error && !store) return <p className="text-sm text-rose-700">{error}</p>;

  const questions = store?.questions ?? [];
  const byQuadrant = (qid: Exclude<QuestionQuadrant, "unassigned">) =>
    questions.filter((q) => q.quadrant === qid);

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">質問リスト</h2>
        <p className="mt-1 text-sm text-slate-600">
          1on1で使う質問を1文ずつ登録し、プルダウンで4象限に分類します。
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
            placeholder="例：その判断でうれしかったことは？"
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

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-800">質問一覧</h3>
        {questions.length === 0 ? (
          <p className="text-sm text-slate-500">まだ質問がありません。</p>
        ) : (
          <ul className="space-y-2">
            {questions.map((q) => (
              <li
                key={q.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm"
              >
                <p className="min-w-0 flex-1 text-sm text-slate-900">{q.text}</p>
                {canEdit ? (
                  <>
                    <select
                      value={q.quadrant}
                      disabled={saving}
                      onChange={(e) => void setQuadrant(q, e.target.value as QuestionQuadrant)}
                      className="max-w-[11rem] rounded-md border border-slate-300 px-2 py-1 text-xs"
                    >
                      <option value="unassigned">象限を選択…</option>
                      {QUADRANT_IDS.map((id) => (
                        <option key={id} value={id}>
                          {QUESTION_QUADRANTS.find((x) => x.id === id)?.short}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void deleteQuestion(q.id)}
                      className="text-xs text-rose-700"
                    >
                      削除
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-slate-500">
                    {q.quadrant === "unassigned"
                      ? "未分類"
                      : QUESTION_QUADRANTS.find((x) => x.id === q.quadrant)?.short}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 border-t border-slate-200 pt-6">
        <h3 className="text-sm font-semibold text-slate-800">4象限での分類</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {QUADRANT_IDS.map((qid) => (
            <div key={qid} className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-4">
              <h4 className="text-sm font-semibold text-indigo-950">
                {QUESTION_QUADRANTS.find((q) => q.id === qid)?.label}
              </h4>
              <ul className="mt-3 space-y-2">
                {byQuadrant(qid).length === 0 ? (
                  <li className="text-xs text-slate-500">まだ質問がありません</li>
                ) : (
                  byQuadrant(qid).map((q) => (
                    <li
                      key={q.id}
                      className="rounded-lg border border-white bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      {q.text}
                    </li>
                  ))
                )}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}
