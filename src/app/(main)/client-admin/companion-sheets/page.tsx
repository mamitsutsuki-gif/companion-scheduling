"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Row = {
  linkId: string;
  clientId: string;
  clientName: string;
  matchId: string | null;
  partnerName: string | null;
  programId: string | null;
};

function withHonorificSan(name: string) {
  return `${name}さん`;
}

export default function ClientAdminCompanionSheetsPage() {
  const [clients, setClients] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    const res = await fetch("/api/client-admin/companion-sheets", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "取得に失敗しました。");
      return;
    }
    setClients(Array.isArray(data?.clients) ? data.clients : []);
    if (typeof data?.message === "string") setInfo(data.message);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:gap-10">
      <header className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">
          Client Administrator
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          部下の伴走シート
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
          管理者から紐づけられた部下の伴走シートを開けます。チャット・1on1
          セッションには入りません。
        </p>
        <button
          type="button"
          onClick={() => void reload()}
          className="mt-4 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          再読込
        </button>
      </header>

      {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
      {info ? <p className="text-sm font-medium text-amber-800">{info}</p> : null}

      <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-6">
        {loading ? (
          <p className="text-sm text-slate-500">読込中…</p>
        ) : clients.length === 0 ? (
          <p className="text-sm text-slate-600">表示できる部下がいません。</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {clients.map((row) => (
              <li
                key={row.linkId}
                className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="font-semibold text-slate-900">
                    {withHonorificSan(row.clientName)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {row.partnerName
                      ? `パートナー: ${withHonorificSan(row.partnerName)}`
                      : "パートナールーム未作成"}
                  </p>
                </div>
                {row.matchId ? (
                  <Link
                    href={`/match/${encodeURIComponent(row.matchId)}`}
                    className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white no-underline hover:bg-indigo-800"
                  >
                    シートを開く
                  </Link>
                ) : (
                  <span className="text-sm text-slate-400">ルームなし</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
