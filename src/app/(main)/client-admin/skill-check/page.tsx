"use client";

import { useCallback, useEffect, useState } from "react";
import { SkillCheckPanel } from "@/components/skill-check-panel";

type ClientRow = {
  id: string;
  displayName: string;
  managerBaselineFilled: number;
  managerCurrentFilled: number;
  focusSkillCount: number;
};

export default function ClientAdminSkillCheckPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    const res = await fetch("/api/client-admin/skill-check", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "取得に失敗しました。");
      return;
    }
    const list = Array.isArray(data?.clients) ? (data.clients as ClientRow[]) : [];
    setClients(list);
    if (typeof data?.message === "string") setInfo(data.message);
    setSelectedId((prev) => {
      if (prev && list.some((c) => c.id === prev)) return prev;
      return list[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selected = clients.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:gap-10">
      <header className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">
          Client Administrator
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          スキルチェック（上司評価）
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
          自社メンバーのスキルチェックシートに、上司評価と重点育成スキルを入力できます。
          本人評価はメンバー本人がマッチルームから入力します。
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
        <p className="text-slate-600">読込中…</p>
      ) : clients.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-slate-600">
          スキルチェックの対象メンバーがいません。
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(12rem,16rem)_1fr]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <h2 className="px-2 text-sm font-semibold text-slate-800">メンバー一覧</h2>
            <ul className="mt-2 space-y-1">
              {clients.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                      selectedId === c.id
                        ? "bg-indigo-700 font-semibold text-white"
                        : "text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    {c.displayName}さん
                    <span
                      className={`mt-0.5 block text-xs ${
                        selectedId === c.id ? "text-indigo-100" : "text-slate-500"
                      }`}
                    >
                      上司評価 開始時{c.managerBaselineFilled} / 終了時{c.managerCurrentFilled}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <div className="min-w-0">
            {selected ? (
              <SkillCheckPanel userId={selected.id} />
            ) : (
              <p className="text-sm text-slate-500">左の一覧からメンバーを選んでください。</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
