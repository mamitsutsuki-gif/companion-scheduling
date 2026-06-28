"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Row = {
  matchId: string;
  negotiationId: string;
  sessionNumber: number;
  clientDisplayName: string;
  partnerDisplayName: string;
  status: string;
  proposedAt: string | null;
  responseDeadline: string | null;
  clientRespondedAt: string | null;
  confirmedStartAt: string | null;
  isOverdue: boolean;
};

function formatJa(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function ScheduleNegotiationsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/schedule-negotiations", { cache: "no-store" });
    const json = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(json?.error ?? "取得に失敗しました。");
      return;
    }
    setRows(Array.isArray(json?.rows) ? json.rows : []);
  }, []);

  useEffect(() => {
    void reload();
    const id = window.setInterval(() => void reload(), 30_000);
    return () => window.clearInterval(id);
  }, [reload]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">日程調整状況一覧</h2>
          <p className="mt-1 text-sm text-slate-600">
            候補提示・回答待ち・確定待ちなど、各ペアの日程調整ステータスを表示します。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          再読込
        </button>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-slate-600">読込中…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center text-sm text-slate-600">
          データがありません。
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-3 py-3">クライアント</th>
                <th className="px-3 py-3">担当パートナー</th>
                <th className="px-3 py-3">回</th>
                <th className="px-3 py-3">ステータス</th>
                <th className="px-3 py-3">候補提示日</th>
                <th className="px-3 py-3">回答期限</th>
                <th className="px-3 py-3">クライアント回答日</th>
                <th className="px-3 py-3">確定日時</th>
                <th className="px-3 py-3">ルーム</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.matchId}-${r.sessionNumber}-${r.negotiationId || "none"}`}
                  className={`border-b border-slate-100 ${r.isOverdue ? "bg-amber-50/80" : ""}`}
                >
                  <td className="px-3 py-2">{r.clientDisplayName}</td>
                  <td className="px-3 py-2">{r.partnerDisplayName}</td>
                  <td className="px-3 py-2">{r.sessionNumber}回</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        r.isOverdue
                          ? "bg-amber-200 text-amber-950"
                          : r.status === "確定"
                            ? "bg-emerald-100 text-emerald-900"
                            : r.status === "未提示"
                              ? "bg-slate-100 text-slate-700"
                              : "bg-indigo-100 text-indigo-900"
                      }`}
                    >
                      {r.isOverdue ? `${r.status}（期限切れ）` : r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatJa(r.proposedAt)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatJa(r.responseDeadline)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatJa(r.clientRespondedAt)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatJa(r.confirmedStartAt)}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/match/${r.matchId}#schedule`}
                      className="font-medium text-indigo-700 no-underline hover:underline"
                    >
                      日程調整
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
