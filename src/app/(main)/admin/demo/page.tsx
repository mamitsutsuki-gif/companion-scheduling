"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { companyPlanLabel, type CompanyPlan } from "@/lib/company-plan";
import type { AdminDemoMatchOption } from "@/lib/admin-demo";

type ApiList = {
  companies: Array<{
    id: string;
    name: string;
    plan: CompanyPlan;
    planLabel: string;
    matchCount: number;
  }>;
  matchesByCompany: Record<string, AdminDemoMatchOption[]>;
  unassignedMatches: AdminDemoMatchOption[];
};

export default function AdminDemoPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiList | null>(null);
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/demo", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as (ApiList & { error?: string }) | null;
        if (cancelled) return;
        if (!res.ok || !json) {
          setError(json?.error ?? "取得に失敗しました。");
          return;
        }
        setData(json);
        const firstWithMatches =
          json.companies.find((c) => c.matchCount > 0)?.id ?? json.companies[0]?.id ?? "";
        setCompanyId(firstWithMatches);
      } catch {
        if (!cancelled) setError("ネットワークエラーが発生しました。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCompany = useMemo(
    () => data?.companies.find((c) => c.id === companyId) ?? null,
    [data, companyId],
  );

  const matches = useMemo(() => {
    if (!data || !companyId) return [];
    return data.matchesByCompany[companyId] ?? [];
  }, [data, companyId]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 sm:gap-10">
      <header className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">
          Administrator / Demo
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          クライアント向けデモ
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
          クライアント・クライアント管理者・パートナーそれぞれに、実際のマッチデータをもとにした画面イメージを表示します。
          商談や社内説明で「このロールではこう見える」をその場で共有できます。
        </p>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
          <strong>ヒント:</strong> デモ用に数回分の日程確定・振り返り入力済みのマッチを1組用意しておくと、プレビューが説得力を持ちます。
        </div>
      </header>

      {loading ? <p className="text-sm text-slate-500">読込中…</p> : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

      {data && !loading ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <label className="block max-w-md space-y-2">
              <span className="text-sm font-semibold text-slate-800">企業を選択</span>
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"
              >
                {data.companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}（{c.planLabel} · マッチ {c.matchCount}）
                  </option>
                ))}
              </select>
            </label>
            {selectedCompany ? (
              <p className="mt-3 text-sm text-slate-600">
                プラン: {companyPlanLabel(selectedCompany.plan)} — マッチ {selectedCompany.matchCount} 組
              </p>
            ) : null}
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">プレビューするマッチ</h2>
            {matches.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                この企業に紐づくマッチがありません。
                <Link href="/admin/matches" className="ml-1 font-medium text-indigo-700 no-underline hover:underline">
                  マッチ管理
                </Link>
                から作成してください。
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {matches.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/admin/demo/${encodeURIComponent(m.id)}`}
                      className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 no-underline shadow-sm transition hover:border-indigo-200 hover:shadow-md"
                    >
                      <p className="font-semibold text-slate-900">
                        {m.clientName} × {m.partnerName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{m.companyName}</p>
                      <span className="mt-3 text-sm font-medium text-indigo-700">ロール別プレビューを開く →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.unassignedMatches.length > 0 ? (
            <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
              <h2 className="text-sm font-semibold text-amber-950">企業未割当のマッチ</h2>
              <ul className="mt-2 space-y-2">
                {data.unassignedMatches.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/admin/demo/${encodeURIComponent(m.id)}`}
                      className="text-sm font-medium text-indigo-800 no-underline hover:underline"
                    >
                      {m.clientName} × {m.partnerName}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
