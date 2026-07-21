"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  COMPANY_PLAN_OPTIONS,
  companyPlanLabel,
  type CompanyPlan,
} from "@/lib/company-plan";

type ProgramRow = {
  id: string;
  name: string;
  plan: CompanyPlan;
  createdAt?: string;
  matchCount?: number;
  assignedMatchCount?: number;
  pendingMatchCount?: number;
};

export function CompanyProgramsSection({ companyId }: { companyId: string }) {
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [hasDuplicatePlans, setHasDuplicatePlans] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [consolidating, setConsolidating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newPlan, setNewPlan] = useState<CompanyPlan>("individual_companion");

  const usedPlans = useMemo(() => new Set(programs.map((p) => p.plan)), [programs]);
  const availablePlanOptions = useMemo(
    () => COMPANY_PLAN_OPTIONS.filter((o) => !usedPlans.has(o.value)),
    [usedPlans],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/companies/${encodeURIComponent(companyId)}/programs`,
        { cache: "no-store" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : "取得に失敗しました。");
        setPrograms([]);
        setHasDuplicatePlans(false);
        return;
      }
      const list = Array.isArray(json?.programs) ? (json.programs as ProgramRow[]) : [];
      setPrograms(list);
      setHasDuplicatePlans(Boolean(json?.hasDuplicatePlans));
      const available = COMPANY_PLAN_OPTIONS.filter(
        (o) => !list.some((p) => p.plan === o.value),
      );
      setNewPlan((prev) =>
        available.some((o) => o.value === prev) ? prev : (available[0]?.value ?? prev),
      );
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (usedPlans.has(newPlan)) {
      setError("このプランは既に追加済みです（1企業・1プランにつき1つまで）。");
      return;
    }
    setCreating(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/admin/companies/${encodeURIComponent(companyId)}/programs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newName.trim() || undefined,
            plan: newPlan,
          }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(typeof json?.error === "string" ? json.error : "作成に失敗しました。");
        return;
      }
      setMessage("プログラムを追加しました。");
      setNewName("");
      await reload();
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setCreating(false);
    }
  }

  async function onConsolidate() {
    if (
      !confirm(
        "同一プランの重複プログラムを、最も古い1件（正本）に統合します。\n\n" +
          "・マッチは正本のプログラムIDへ付け替えます（クライアントとパートナーの関係はそのまま）\n" +
          "・余分なプログラム行を削除します\n\n" +
          "この企業のみが対象です。よろしいですか？",
      )
    ) {
      return;
    }
    setConsolidating(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/admin/companies/${encodeURIComponent(companyId)}/programs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "consolidate_duplicates" }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(typeof json?.error === "string" ? json.error : "統合に失敗しました。");
        return;
      }
      setMessage(
        `重複を統合しました（削除 ${json.removedProgramIds?.length ?? 0} 件 / マッチ付け替え ${json.matchesReassigned ?? 0} 件）。`,
      );
      await reload();
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setConsolidating(false);
    }
  }

  async function onDelete(program: ProgramRow) {
    if (
      !confirm(
        `プログラム「${program.name}」を削除します。未割当（パートナー未決定）のマッチだけ紐づいている場合は、マッチも一緒に削除されます。よろしいですか？`,
      )
    ) {
      return;
    }
    setDeletingId(program.id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/programs/${encodeURIComponent(program.id)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(typeof json?.error === "string" ? json.error : "削除に失敗しました。");
        return;
      }
      setMessage(`「${program.name}」を削除しました。`);
      await reload();
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold text-slate-900">導入プログラム</h2>
      <p className="mt-1 text-sm text-slate-600">
        1企業内で<strong>別プラン同士</strong>（例: 個別伴走 + コーチング研修）は並行できます。
        同じプランを2つ以上追加することはできません。
      </p>
      {hasDuplicatePlans ? (
        <div className="mt-3 space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <p>
            同じプランのプログラムが複数あります（過去の重複作成）。
            クライアントが紐づいている場合は、個別削除ではなく下の「重複を統合」を使ってください。
            マッチは正本へ付け替えられ、関係は維持されます。
          </p>
          <button
            type="button"
            disabled={consolidating}
            onClick={() => void onConsolidate()}
            className="rounded-lg border border-amber-500 bg-white px-3 py-1.5 text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
          >
            {consolidating ? "統合中…" : "同一プランの重複を統合する"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}
      {message ? (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-slate-600">読込中…</p>
      ) : programs.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">プログラムがありません。</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {programs.map((p) => {
            const dupCount = programs.filter((x) => x.plan === p.plan).length;
            return (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-slate-900">
                    {p.name}
                    {dupCount > 1 ? (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                        プラン重複
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {companyPlanLabel(p.plan)} · ID: <span className="font-mono">{p.id}</span>
                    {typeof p.assignedMatchCount === "number" ? (
                      <>
                        {" "}
                        · 割当済マッチ {p.assignedMatchCount}
                        {typeof p.pendingMatchCount === "number" && p.pendingMatchCount > 0
                          ? ` / 未割当 ${p.pendingMatchCount}`
                          : ""}
                      </>
                    ) : null}
                    {p.createdAt ? (
                      <>
                        {" "}
                        · 作成:{" "}
                        {new Intl.DateTimeFormat("ja-JP", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(p.createdAt))}
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/admin/companies/${encodeURIComponent(companyId)}/settings?programId=${encodeURIComponent(p.id)}`}
                    className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-900 no-underline hover:bg-indigo-100"
                  >
                    設定を編集 →
                  </Link>
                  <button
                    type="button"
                    disabled={deletingId === p.id}
                    onClick={() => void onDelete(p)}
                    className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-900 hover:bg-rose-100 disabled:opacity-50"
                  >
                    {deletingId === p.id ? "削除中…" : "削除"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={(e) => void onCreate(e)} className="mt-6 space-y-3 rounded-xl border border-dashed border-slate-300 p-4">
        <h3 className="text-sm font-semibold text-slate-800">プログラムを追加</h3>
        {availablePlanOptions.length === 0 ? (
          <p className="text-sm text-slate-600">
            追加できるプランがありません（各プランはすでに1つずつ登録済みです）。
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600">名称（任意）</span>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="例: 2026年度 個別伴走"
                  maxLength={80}
                  className="min-w-[14rem] rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600">プラン（未追加のみ）</span>
                <select
                  value={newPlan}
                  onChange={(e) => setNewPlan(e.target.value as CompanyPlan)}
                  className="min-w-[14rem] rounded-lg border border-slate-300 px-3 py-2"
                >
                  {availablePlanOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
            >
              {creating ? "作成中…" : "追加する"}
            </button>
          </>
        )}
      </form>
    </section>
  );
}
