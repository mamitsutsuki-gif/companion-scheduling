"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Row = { id: string; name: string; pairCount: number };

export default function AdminCompaniesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [orphan, setOrphan] = useState<Array<{ id: string; pairCount: number }>>([]);
  const [pairsWithoutCompany, setPairsWithoutCompany] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/companies", { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as
          | {
              companies?: Row[];
              orphanCompanies?: Array<{ id: string; pairCount: number }>;
              pairsWithoutCompany?: number;
              error?: string;
            }
          | null;
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error ?? "取得に失敗しました。");
          setLoading(false);
          return;
        }
        setRows(Array.isArray(data?.companies) ? data!.companies! : []);
        setOrphan(Array.isArray(data?.orphanCompanies) ? data!.orphanCompanies! : []);
        setPairsWithoutCompany(typeof data?.pairsWithoutCompany === "number" ? data!.pairsWithoutCompany! : 0);
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

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:gap-10">
      <header className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">Administrator</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">企業（テナント）</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
          登録済みの企業ごとに、ペア一覧・企業専用のアプリ設定にアクセスできます。
          企業の追加／削除は「アプリ設定 → 企業（テナント）」で行います。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/admin/settings"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 no-underline hover:bg-slate-50"
          >
            アプリ設定で企業を編集 →
          </Link>
        </div>
      </header>

      {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}

      {loading ? (
        <p className="text-slate-600">読込中…</p>
      ) : rows.length === 0 && orphan.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-slate-600">
          まだ企業が登録されていません。「アプリ設定 → 企業（テナント）」で追加してください。
        </div>
      ) : (
        <div className="space-y-6">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm text-slate-800">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">企業名</th>
                  <th className="px-4 py-3">企業ID</th>
                  <th className="px-4 py-3 text-right">ペア数</th>
                  <th className="px-4 py-3">アクション</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="px-4 py-2 font-medium text-slate-900">{c.name}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-600">{c.id}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{c.pairCount}</td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/admin/companies/${encodeURIComponent(c.id)}`}
                        className="font-medium text-indigo-700 no-underline hover:underline"
                      >
                        詳細を開く →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {pairsWithoutCompany > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              企業ID未設定のクライアントが含まれるペアが{" "}
              <span className="font-semibold">{pairsWithoutCompany}件</span>{" "}
              あります。マッチ管理画面でクライアントのロール編集から企業IDを設定してください。
            </div>
          ) : null}

          {orphan.length > 0 ? (
            <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-rose-900">
                登録解除済みの企業IDが付いたクライアントが存在します
              </h2>
              <p className="mt-2 text-sm text-rose-900/80">
                以下の企業IDは「アプリ設定」に存在しません。再登録するか、該当クライアントの企業IDを差し替えてください。
              </p>
              <ul className="mt-3 space-y-1 text-sm text-rose-900">
                {orphan.map((o) => (
                  <li key={o.id} className="font-mono">
                    {o.id} <span className="text-rose-900/70">（ペア数 {o.pairCount}）</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
