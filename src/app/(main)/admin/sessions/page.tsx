"use client";

import Link from "next/link";
import { ScheduleNegotiationsPanel } from "@/components/schedule-negotiations-panel";
import { useCallback, useEffect, useMemo, useState } from "react";

type Row = {
  matchId: string;
  negotiationId: string;
  sessionNumber: number;
  round: number;
  partnerDisplayName: string;
  clientDisplayName: string;
  clientCompanyId: string | null;
  clientCompanyName: string | null;
  startAt: string;
  endAt: string;
};

type CompanyOption = { id: string; name: string };

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
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [companyFilter, setCompanyFilter] = useState<string>(""); // "" = 全企業

  // URL の ?company= が来ていれば初期フィルタに反映（ブラウザのみ）
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get("company");
    if (q) setCompanyFilter(q);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [sessionsRes, settingsRes] = await Promise.all([
      fetch("/api/admin/confirmed-sessions", { cache: "no-store" }),
      fetch("/api/admin/app-settings", { cache: "no-store" }),
    ]);
    const data = await sessionsRes.json().catch(() => null);
    const settings = await settingsRes.json().catch(() => null);
    setLoading(false);
    if (!sessionsRes.ok) {
      setError(typeof data?.error === "string" ? data.error : "取得に失敗しました。");
      return;
    }
    setRows(Array.isArray(data?.sessions) ? data.sessions : []);
    // GET /api/admin/app-settings は { settings: { companies: [...] } } という入れ子で返す。
    // 以前は settings.companies を直接見ていたため、企業リストが常に空になっていた（＝企業フィルタが選択不能）。
    const companiesRaw =
      (settings as { settings?: { companies?: unknown } } | null)?.settings?.companies;
    if (Array.isArray(companiesRaw)) {
      setCompanies(
        companiesRaw
          .filter(
            (c: unknown): c is CompanyOption =>
              !!c &&
              typeof (c as { id?: unknown }).id === "string" &&
              typeof (c as { name?: unknown }).name === "string",
          )
          .map((c: CompanyOption) => ({ id: c.id, name: c.name })),
      );
    } else {
      setCompanies([]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const nowMs = Date.now();

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const end = new Date(r.endAt).getTime();
      if (!Number.isFinite(end)) return false;
      if (tab === "past" && !(end < nowMs)) return false;
      if (tab === "upcoming" && !(end >= nowMs)) return false;
      if (companyFilter) {
        if (companyFilter === "__none__") {
          if (r.clientCompanyId) return false;
        } else if (r.clientCompanyId !== companyFilter) {
          return false;
        }
      }
      return true;
    });
  }, [rows, tab, nowMs, companyFilter]);

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

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex flex-wrap gap-2">
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
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <span className="font-medium">企業で絞り込み</span>
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">すべて</option>
            <option value="__none__">未登録（企業ID未設定）</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}（{c.id}）
              </option>
            ))}
          </select>
        </label>
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
                <th className="px-3 py-3">クライアント企業</th>
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
                  <td className="px-3 py-2 text-sm text-slate-700">
                    {r.clientCompanyName ?? (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
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
      <ScheduleNegotiationsPanel />
    </div>
  );
}
