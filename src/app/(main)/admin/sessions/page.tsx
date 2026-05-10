"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Row = {
  matchId: string;
  negotiationId: string;
  sessionNumber: number;
  round: number;
  partnerDisplayName: string;
  clientDisplayName: string;
  startAt: string;
  endAt: string;
};

function formatJa(iso: string) {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function AdminSessionsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/confirmed-sessions", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "取得に失敗しました。");
      return;
    }
    setRows(Array.isArray(data?.sessions) ? data.sessions : []);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const nowMs = Date.now();

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const end = new Date(r.endAt).getTime();
      if (!Number.isFinite(end)) return false;
      if (tab === "past") return end < nowMs;
      return end >= nowMs;
    });
  }, [rows, tab, nowMs]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) =>
      tab === "past"
        ? new Date(b.endAt).getTime() - new Date(a.endAt).getTime()
        : new Date(a.endAt).getTime() - new Date(b.endAt).getTime(),
    );
    return copy;
  }, [filtered, tab]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:gap-10">
      <header className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">Administrator</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">1on1セッション日程一覧</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
          全ペアの「現在の確定日程」（同一回で再調整済みの場合は最新ラウンドのみ）を表示します。終了時刻が基準です。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/admin/matches"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 no-underline hover:bg-slate-50"
          >
            ← マッチ管理
          </Link>
          <button
            type="button"
            onClick={() => void reload()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            再読込
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setTab("upcoming")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            tab === "upcoming" ? "bg-indigo-700 text-white" : "border border-slate-300 bg-white text-slate-700"
          }`}
        >
          これから実施
        </button>
        <button
          type="button"
          onClick={() => setTab("past")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            tab === "past" ? "bg-indigo-700 text-white" : "border border-slate-300 bg-white text-slate-700"
          }`}
        >
          過去
        </button>
      </div>

      {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}

      {loading ? (
        <p className="text-slate-600">読込中…</p>
      ) : sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-slate-600">
          該当する確定日程がありません。
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm text-slate-800">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-3">回</th>
                <th className="px-3 py-3">パートナー</th>
                <th className="px-3 py-3">クライアント</th>
                <th className="px-3 py-3">開始</th>
                <th className="px-3 py-3">終了</th>
                <th className="px-3 py-3">ルーム</th>
                <th className="px-3 py-3">回の詳細</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={`${r.negotiationId}-${r.sessionNumber}`} className="border-b border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.sessionNumber}回 / R{r.round}
                  </td>
                  <td className="px-3 py-2">{r.partnerDisplayName}さん</td>
                  <td className="px-3 py-2">{r.clientDisplayName}さん</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatJa(r.startAt)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatJa(r.endAt)}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/match/${r.matchId}`}
                      className="font-medium text-indigo-700 no-underline hover:underline"
                    >
                      ルームを開く
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/match/${r.matchId}/sessions/${r.sessionNumber}`}
                      className="font-medium text-indigo-700 no-underline hover:underline"
                    >
                      振り返り＆レポート
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
