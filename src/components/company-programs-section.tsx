"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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
};

export function CompanyProgramsSection({ companyId }: { companyId: string }) {
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newPlan, setNewPlan] = useState<CompanyPlan>("individual_companion");

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
        return;
      }
      setPrograms(Array.isArray(json?.programs) ? json.programs : []);
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

  const duplicatePlanHint =
    programs.length > 1 &&
    new Set(programs.map((p) => p.plan)).size < programs.length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold text-slate-900">導入プログラム</h2>
      <p className="mt-1 text-sm text-slate-600">
        1企業内で複数プラン（コーチング研修・個別伴走など）を並行運用できます。設定・マッチはプログラム単位です。
      </p>
      {duplicatePlanHint ? (
        <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          同じプラン名のプログラムが複数あります。移行時の重複作成の可能性があります。
          <strong className="font-semibold">マッチが紐づいている1件を残し</strong>
          、余分な行は「削除」してください。
        </p>
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
          {programs.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-semibold text-slate-900">{p.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {companyPlanLabel(p.plan)} · ID: <span className="font-mono">{p.id}</span>
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
          ))}
        </ul>
      )}

      <form onSubmit={(e) => void onCreate(e)} className="mt-6 space-y-3 rounded-xl border border-dashed border-slate-300 p-4">
        <h3 className="text-sm font-semibold text-slate-800">プログラムを追加</h3>
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
            <span className="text-slate-600">プラン</span>
            <select
              value={newPlan}
              onChange={(e) => setNewPlan(e.target.value as CompanyPlan)}
              className="min-w-[14rem] rounded-lg border border-slate-300 px-3 py-2"
            >
              {COMPANY_PLAN_OPTIONS.map((o) => (
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
      </form>
    </section>
  );
}
