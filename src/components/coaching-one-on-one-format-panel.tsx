"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OneOnOneFormatDoc, OneOnOneStepMemos } from "@/lib/coaching-one-on-one-format";
import {
  MOTIVAGE_ONE_ON_ONE_STEPS,
  type MotivageOneOnOneStepId,
} from "@/lib/motivage-one-on-one-model";

function emptyMemos(): OneOnOneStepMemos {
  return {};
}

export function CoachingOneOnOneFormatPanel({ matchId }: { matchId: string }) {
  const [loading, setLoading] = useState(true);
  const [doc, setDoc] = useState<OneOnOneFormatDoc | null>(null);
  const [stepMemos, setStepMemos] = useState<OneOnOneStepMemos>(emptyMemos);
  const [activeStepId, setActiveStepId] = useState<MotivageOneOnOneStepId>("icebreak");
  const [canEdit, setCanEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/coaching/one-on-one-format`, {
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.doc) {
      setDoc(json.doc);
      setStepMemos(json.doc.stepMemos ?? {});
      setCanEdit(Boolean(json.permissions?.canEditClient || json.permissions?.canEditPartner));
      setDirty(false);
    }
    setLoading(false);
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeStep = useMemo(
    () => MOTIVAGE_ONE_ON_ONE_STEPS.find((s) => s.id === activeStepId) ?? MOTIVAGE_ONE_ON_ONE_STEPS[0]!,
    [activeStepId],
  );

  const activeMemo = stepMemos[activeStepId] ?? "";
  const memoFilledCount = MOTIVAGE_ONE_ON_ONE_STEPS.filter((s) => (stepMemos[s.id] ?? "").trim()).length;

  function updateActiveMemo(value: string) {
    setStepMemos((prev) => ({ ...prev, [activeStepId]: value }));
    setDirty(true);
    setNotice(null);
  }

  async function saveStepMemos() {
    setSaving(true);
    setNotice(null);
    const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/coaching/one-on-one-format`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepMemos }),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);
    if (res.ok && json?.doc) {
      setDoc(json.doc);
      setStepMemos(json.doc.stepMemos ?? {});
      setDirty(false);
      setNotice("保存しました。");
    } else {
      setNotice("保存に失敗しました。もう一度お試しください。");
    }
  }

  function goStep(delta: number) {
    const idx = MOTIVAGE_ONE_ON_ONE_STEPS.findIndex((s) => s.id === activeStepId);
    const next = MOTIVAGE_ONE_ON_ONE_STEPS[idx + delta];
    if (next) setActiveStepId(next.id);
  }

  if (loading) return <p className="text-sm text-slate-500">読込中…</p>;

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">1on1フォーマット</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          モチベイジが提唱する1on1の型です。全体の流れと例文を参照しながら、各パートに自分用のメモを残せます。
        </p>
      </div>

      {/* 全体フロー（横スクロール可） */}
      <div className="overflow-x-auto rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 via-white to-slate-50 p-4">
        <p className="mb-3 text-xs font-semibold tracking-wide text-indigo-800/80 uppercase">
          全体の流れ · {memoFilledCount}/6 パートにメモあり
        </p>
        <ol className="flex min-w-max gap-2 md:min-w-0 md:flex-wrap">
          {MOTIVAGE_ONE_ON_ONE_STEPS.map((step, i) => {
            const selected = step.id === activeStepId;
            const hasMemo = Boolean((stepMemos[step.id] ?? "").trim());
            return (
              <li key={step.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveStepId(step.id)}
                  className={[
                    "relative flex w-[9.5rem] flex-col rounded-xl border px-3 py-2.5 text-left transition",
                    selected
                      ? "border-indigo-700 bg-indigo-700 text-white shadow-md shadow-indigo-200"
                      : "border-indigo-100 bg-white text-slate-800 hover:border-indigo-300 hover:bg-indigo-50/50",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "text-[11px] font-bold",
                      selected ? "text-indigo-100" : "text-indigo-600",
                    ].join(" ")}
                  >
                    {step.number}
                  </span>
                  <span className="mt-0.5 text-sm font-semibold leading-snug">{step.title}</span>
                  <span
                    className={[
                      "mt-1 text-[11px] leading-snug",
                      selected ? "text-indigo-100/90" : "text-slate-500",
                    ].join(" ")}
                  >
                    {step.goal}
                  </span>
                  {hasMemo ? (
                    <span
                      className={[
                        "absolute top-2 right-2 h-2 w-2 rounded-full",
                        selected ? "bg-emerald-300" : "bg-emerald-500",
                      ].join(" ")}
                      title="メモあり"
                    />
                  ) : null}
                </button>
                {i < MOTIVAGE_ONE_ON_ONE_STEPS.length - 1 ? (
                  <span className="hidden text-indigo-300 sm:inline" aria-hidden>
                    →
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* サイドバー（デスクトップ） */}
        <nav
          className="hidden lg:block"
          aria-label="1on1の型ステップ"
        >
          <ul className="space-y-1.5">
            {MOTIVAGE_ONE_ON_ONE_STEPS.map((step) => {
              const selected = step.id === activeStepId;
              const hasMemo = Boolean((stepMemos[step.id] ?? "").trim());
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={() => setActiveStepId(step.id)}
                    className={[
                      "flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition",
                      selected
                        ? "border-indigo-700 bg-indigo-700 text-white"
                        : "border-slate-200 bg-white text-slate-800 hover:border-indigo-200 hover:bg-indigo-50/40",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                        selected ? "bg-white/20 text-white" : "bg-indigo-50 text-indigo-800",
                      ].join(" ")}
                    >
                      {step.number}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold leading-snug">{step.title}</span>
                      <span
                        className={[
                          "mt-0.5 block text-[11px] leading-snug",
                          selected ? "text-indigo-100" : "text-slate-500",
                        ].join(" ")}
                      >
                        {step.goal}
                      </span>
                    </span>
                    {hasMemo ? (
                      <span
                        className={[
                          "mt-1 h-2 w-2 shrink-0 rounded-full",
                          selected ? "bg-emerald-300" : "bg-emerald-500",
                        ].join(" ")}
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* 詳細 + メモ */}
        <div className="space-y-4">
          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="border-b border-indigo-100 bg-indigo-50/60 px-5 py-4">
              <p className="text-xs font-semibold tracking-wide text-indigo-700">
                ①〜⑥の型 · 第{activeStep.number}パート
              </p>
              <h3 className="mt-1 text-xl font-bold text-indigo-950 sm:text-2xl">
                {activeStep.number}. {activeStep.title}
              </h3>
              <p className="mt-2 inline-flex rounded-lg bg-indigo-700 px-3 py-1 text-sm font-semibold text-white">
                {activeStep.goal}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-slate-700">{activeStep.lead}</p>
            </header>

            <div className="space-y-5 px-5 py-5">
              {activeStep.exampleGroups.map((group, gi) => (
                <div key={gi}>
                  {group.title ? (
                    <h4 className="mb-2 text-sm font-semibold text-indigo-900">{group.title}</h4>
                  ) : (
                    <h4 className="mb-2 text-sm font-semibold text-indigo-900">例文</h4>
                  )}
                  <ul className="space-y-2">
                    {group.examples.map((ex) => (
                      <li
                        key={ex}
                        className="rounded-xl border border-indigo-200/80 bg-indigo-50/40 px-3.5 py-2.5 text-sm leading-relaxed text-slate-800"
                      >
                        {ex}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <div className="space-y-2">
                {activeStep.tips.map((tip, ti) => (
                  <div
                    key={ti}
                    className={[
                      "rounded-xl border px-3.5 py-3 text-sm leading-relaxed",
                      tip.tone === "emphasis"
                        ? "border-amber-200 bg-amber-50 text-amber-950"
                        : "border-sky-100 bg-sky-50/80 text-sky-950",
                    ].join(" ")}
                  >
                    {tip.text}
                  </div>
                ))}
              </div>

              {activeStep.footerNote ? (
                <p className="text-xs leading-relaxed text-slate-500">※ {activeStep.footerNote}</p>
              ) : null}
            </div>
          </article>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <label className="block">
              <span className="text-sm font-semibold text-slate-900">
                このパートについてのメモ
              </span>
              <p className="mt-1 text-xs text-slate-600">
                例文の使い方・自分なりの言い回し・部下への配慮など、型を実践するときのメモを残せます。
              </p>
              <textarea
                value={activeMemo}
                disabled={!canEdit}
                onChange={(e) => updateActiveMemo(e.target.value)}
                rows={5}
                maxLength={4000}
                className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm leading-relaxed text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50 disabled:text-slate-500"
                placeholder={`例：①で使うアイスブレイクのネタ、言い回しのアレンジなど（${activeStep.title}）`}
              />
            </label>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!canEdit || saving || !dirty}
                onClick={() => void saveStepMemos()}
                className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "保存中…" : "メモを保存"}
              </button>
              <button
                type="button"
                disabled={activeStep.number <= 1}
                onClick={() => goStep(-1)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
              >
                前のパート
              </button>
              <button
                type="button"
                disabled={activeStep.number >= 6}
                onClick={() => goStep(1)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
              >
                次のパート
              </button>
              {notice ? (
                <span
                  className={
                    notice.includes("失敗")
                      ? "text-sm text-rose-700"
                      : "text-sm text-emerald-700"
                  }
                >
                  {notice}
                </span>
              ) : dirty && canEdit ? (
                <span className="text-sm text-amber-700">未保存の変更があります</span>
              ) : null}
            </div>
            {!canEdit ? (
              <p className="mt-2 text-xs text-slate-500">このマッチではメモの編集権限がありません（参照のみ）。</p>
            ) : null}
            {doc?.updatedAt ? (
              <p className="mt-2 text-[11px] text-slate-400">
                最終更新: {new Date(doc.updatedAt).toLocaleString("ja-JP")}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
