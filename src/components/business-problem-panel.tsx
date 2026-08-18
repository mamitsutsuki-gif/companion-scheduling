"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  BUSINESS_PROBLEM_STEPS,
  BUSINESS_PROBLEM_TEXT_MAX,
  type BusinessProblemSheet,
  type BusinessProblemStepDef,
} from "@/lib/companion-business-problem";
import { SheetSaveButton } from "@/components/sheet-save-controls";

type Permissions = { canEditClient: boolean; canEditPartner: boolean };
type FillCount = { stepId: number; filled: number; total: number };

const emptySheet = (): BusinessProblemSheet => ({
  userId: "",
  companyId: "",
  stepValues: Object.fromEntries(
    BUSINESS_PROBLEM_STEPS.map((s) => [String(s.id), Object.fromEntries(s.fields.map((f) => [f.key, ""]))]),
  ),
  updatedAt: "",
});

export function BusinessProblemPanel({ matchId }: { matchId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sheet, setSheet] = useState<BusinessProblemSheet>(emptySheet);
  const [steps, setSteps] = useState<BusinessProblemStepDef[]>(BUSINESS_PROBLEM_STEPS);
  const [fillCounts, setFillCounts] = useState<FillCount[]>([]);
  const [perms, setPerms] = useState<Permissions>({ canEditClient: false, canEditPartner: false });
  const [activeStepId, setActiveStepId] = useState(1);
  const [exampleTab, setExampleTab] = useState<"goodA" | "goodB" | "bad">("goodA");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/matches/${matchId}/business-problem`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError((json as { error?: string })?.error ?? "読み込みに失敗しました。");
      return;
    }
    setSheet((json as { sheet?: BusinessProblemSheet }).sheet ?? emptySheet());
    setSteps((json as { steps?: BusinessProblemStepDef[] }).steps ?? BUSINESS_PROBLEM_STEPS);
    setFillCounts((json as { fillCounts?: FillCount[] }).fillCounts ?? []);
    setPerms(
      (json as { permissions?: Permissions }).permissions ?? {
        canEditClient: false,
        canEditPartner: false,
      },
    );
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const step = useMemo(
    () => steps.find((s) => s.id === activeStepId) ?? steps[0],
    [steps, activeStepId],
  );
  const canEditFields = perms.canEditClient || perms.canEditPartner;
  const theme = (sheet.stepValues["1"]?.theme ?? "").trim();

  function setField(stepId: number, key: string, value: string) {
    const sid = String(stepId);
    setSheet((prev) => ({
      ...prev,
      stepValues: {
        ...prev.stepValues,
        [sid]: {
          ...(prev.stepValues[sid] ?? {}),
          [key]: value.slice(0, BUSINESS_PROBLEM_TEXT_MAX),
        },
      },
    }));
    setNotice(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/matches/${matchId}/business-problem`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepValues: sheet.stepValues }),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError((json as { error?: string })?.error ?? "保存に失敗しました。");
      return;
    }
    setSheet((json as { sheet?: BusinessProblemSheet }).sheet ?? sheet);
    setFillCounts((json as { fillCounts?: FillCount[] }).fillCounts ?? fillCounts);
    setNotice("保存しました。");
  }

  if (loading) {
    return <p className="text-sm text-slate-600">読込中…</p>;
  }

  const fill = fillCounts.find((c) => c.stepId === activeStepId);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold text-slate-900">業務課題実践｜問題解決8ステップ</h2>
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
            詳細は任意
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          育成機会で合意した仕事を、ここで具体化します。業務課題は1件記入し、8ステップの詳細はテーマに応じて必要なところから進めてください。
        </p>
        {theme ? (
          <p className="mt-2 text-sm text-indigo-900">
            <span className="font-medium">テーマ：</span>
            {theme}
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      {!canEditFields ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          閲覧のみです。
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {steps.map((s) => {
          const c = fillCounts.find((x) => x.stepId === s.id);
          const done = c && c.filled > 0;
          const complete = c && c.filled === c.total && c.total > 0;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setActiveStepId(s.id);
                setExampleTab("goodA");
              }}
              className={`rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                activeStepId === s.id
                  ? "bg-indigo-700 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span className="block">STEP {s.id}</span>
              <span className={`block text-xs font-medium ${activeStepId === s.id ? "text-indigo-100" : "text-slate-500"}`}>
                {s.shortTitle}
                {complete ? " ✓" : done ? ` ${c?.filled}/${c?.total}` : ""}
              </span>
            </button>
          );
        })}
      </div>

      {step ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                STEP {step.id}：{step.title}
              </h3>
              <p className="mt-1 text-sm text-slate-600">{step.purpose}</p>
              {fill ? (
                <p className="mt-1 text-xs text-slate-500">
                  入力 {fill.filled}/{fill.total}
                </p>
              ) : null}
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-800">何をするか</h4>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {step.tasks.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-800">ポイント</h4>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {step.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-800">よくある誤り</h4>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {step.pitfalls.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-800">記入事例を参照</h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  [
                    ["goodA", "良い例A（見える問題）"],
                    ["goodB", "良い例B（探す問題）"],
                    ["bad", "イマイチ例"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setExampleTab(key)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                      exampleTab === key
                        ? "bg-indigo-600 text-white"
                        : "border border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-2 rounded-lg border border-white bg-white px-3 py-2 text-sm text-slate-700">
                {exampleTab === "goodA" ? step.examples.goodA : null}
                {exampleTab === "goodB" ? step.examples.goodB : null}
                {exampleTab === "bad" ? (
                  <>
                    <p>{step.examples.bad}</p>
                    {step.examples.badFix ? (
                      <p className="mt-2 text-slate-600">
                        <span className="font-medium">改善：</span>
                        {step.examples.badFix}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>

            {step.partnerQuestions.length > 0 ? (
              <div>
                <h4 className="text-sm font-semibold text-slate-800">パートナー向け問い</h4>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {step.partnerQuestions.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="space-y-4 rounded-2xl border border-indigo-100 bg-white p-4 sm:p-5">
            <h3 className="text-base font-semibold text-slate-900">入力項目</h3>
            <div className="space-y-3">
              {step.fields.map((f) => {
                const value = sheet.stepValues[String(step.id)]?.[f.key] ?? "";
                const common = {
                  value,
                  disabled: !canEditFields,
                  maxLength: BUSINESS_PROBLEM_TEXT_MAX,
                  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                    setField(step.id, f.key, e.target.value),
                  className:
                    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500",
                };
                return (
                  <label key={f.key} className="block space-y-1 text-sm">
                    <span className="font-medium text-slate-800">{f.label}</span>
                    {f.type === "text" ? (
                      <input type="text" {...common} />
                    ) : (
                      <textarea rows={4} {...common} />
                    )}
                  </label>
                );
              })}
            </div>
            {canEditFields ? (
              <div className="pt-1">
                <SheetSaveButton saving={saving} onClick={() => void save()} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
