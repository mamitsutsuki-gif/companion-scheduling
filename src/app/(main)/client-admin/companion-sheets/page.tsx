"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SkillCheckPanel } from "@/components/skill-check-panel";

type Row = {
  linkId: string | null;
  clientId: string;
  clientName: string;
  matchId: string | null;
  partnerName: string | null;
  programId: string | null;
  managerBaselineFilled: number;
  managerCurrentFilled: number;
};

type Scope = "company" | "subordinates";

function withHonorificSan(name: string) {
  return `${name}さん`;
}

export default function ClientAdminCompanionSheetsPage() {
  const [clients, setClients] = useState<Row[]>([]);
  const [scope, setScope] = useState<Scope>("subordinates");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const isHr = scope === "company";

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
    const list: Row[] = Array.isArray(data?.clients) ? data.clients : [];
    setClients(list);
    setScope(data?.scope === "company" ? "company" : "subordinates");
    if (typeof data?.message === "string") setInfo(data.message);
    setSelectedId((prev) => {
      if (prev && list.some((c) => c.clientId === prev)) return prev;
      return list[0]?.clientId ?? null;
    });
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selected = clients.find((c) => c.clientId === selectedId) ?? null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:gap-10">
      <header className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">
          {isHr ? "Client HR" : "Client Administrator"}
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          {isHr ? "社内の伴走シート" : "部下の伴走シート"}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
          {isHr
            ? "同じ企業に割り当てられた受講者の伴走シートを確認できます（閲覧中心）。スキルチェックの上司評価入力やチャット・1on1 セッションには入りません。"
            : "紐づけられた部下のスキルチェック（上司評価・重点育成項目）をこの画面で入力できます。ライフライン・FTA などのシートは「シートを開く」から確認できます。チャット・1on1 セッションには入りません。"}
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

      {loading ? (
        <p className="text-sm text-slate-500">読込中…</p>
      ) : clients.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-slate-600">
          {isHr ? "表示できる受講者がいません。" : "表示できる部下がいません。"}
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(12rem,17rem)_1fr]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <h2 className="px-2 text-sm font-semibold text-slate-800">
              {isHr ? "受講者一覧" : "部下一覧"}
            </h2>
            <ul className="mt-2 space-y-1">
              {clients.map((row) => (
                <li key={row.clientId}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(row.clientId)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                      selectedId === row.clientId
                        ? "bg-indigo-700 font-semibold text-white"
                        : "text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    {withHonorificSan(row.clientName)}
                    <span
                      className={`mt-0.5 block text-xs ${
                        selectedId === row.clientId ? "text-indigo-100" : "text-slate-500"
                      }`}
                    >
                      上司評価 開始時{row.managerBaselineFilled} / 終了時{row.managerCurrentFilled}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <div className="min-w-0 space-y-4">
            {selected ? (
              <>
                <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {withHonorificSan(selected.clientName)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {selected.partnerName
                        ? `パートナー: ${withHonorificSan(selected.partnerName)}`
                        : "パートナールーム未作成"}
                    </p>
                  </div>
                  {selected.matchId ? (
                    <Link
                      href={`/match/${encodeURIComponent(selected.matchId)}`}
                      className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white no-underline hover:bg-indigo-800"
                    >
                      シートを開く
                    </Link>
                  ) : (
                    <span className="text-sm text-slate-400">ルームなし</span>
                  )}
                </section>
                <SkillCheckPanel key={selected.clientId} userId={selected.clientId} />
              </>
            ) : (
              <p className="text-sm text-slate-500">
                {isHr ? "一覧から受講者を選んでください。" : "一覧から部下を選んでください。"}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
