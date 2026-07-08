"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type AuditClient = {
  userId: string;
  displayName: string;
  role: string;
  matchCount: number;
  assignedCount: number;
  pendingCount: number;
  needsReview: boolean;
  matches: Array<{
    id: string;
    programId: string | null;
    partnerPending: boolean;
    createdAt: string;
  }>;
};

type Audit = {
  programCount: number;
  clients: AuditClient[];
  clientsNeedingReview: number;
};

function formatJa(iso: string) {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function CompanyMatchAuditSection({ companyId }: { companyId: string }) {
  const [audit, setAudit] = useState<Audit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/companies/${encodeURIComponent(companyId)}/match-audit`,
        { cache: "no-store" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : "取得に失敗しました。");
        return;
      }
      setAudit(json as Audit);
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">マッチ監査（クライアント別）</h2>
          <p className="mt-1 text-sm text-slate-600">
            所属クライアントごとのマッチ数を確認できます。未決定が2件以上ある場合は要整理です。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
        >
          再読込
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}
      {loading ? <p className="mt-4 text-sm text-slate-600">読込中…</p> : null}

      {audit && !loading ? (
        <>
          <p className="mt-4 text-sm text-slate-700">
            プログラム <strong>{audit.programCount}</strong> 件 · クライアント系{" "}
            <strong>{audit.clients.length}</strong> 名 · 要確認{" "}
            <strong className={audit.clientsNeedingReview > 0 ? "text-amber-800" : "text-emerald-800"}>
              {audit.clientsNeedingReview}
            </strong>{" "}
            名
          </p>
          {audit.clientsNeedingReview === 0 ? (
            <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              全クライアントとも、マッチは1件以下（または未決定が1件以下）です。
            </p>
          ) : (
            <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              要確認のクライアントがいます。マッチ管理で未決定の重複を整理してください。
            </p>
          )}
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                <tr>
                  <th className="px-3 py-2">クライアント</th>
                  <th className="px-3 py-2">マッチ</th>
                  <th className="px-3 py-2">割当済み</th>
                  <th className="px-3 py-2">未決定</th>
                  <th className="px-3 py-2">状態</th>
                </tr>
              </thead>
              <tbody>
                {audit.clients.map((c) => (
                  <tr key={c.userId} className="border-b border-slate-100 align-top">
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-900">{c.displayName}</p>
                      <p className="text-xs text-slate-500">{c.role}</p>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{c.matchCount}</td>
                    <td className="px-3 py-2 tabular-nums">{c.assignedCount}</td>
                    <td className="px-3 py-2 tabular-nums">{c.pendingCount}</td>
                    <td className="px-3 py-2">
                      {c.needsReview ? (
                        <span className="font-medium text-amber-800">要確認</span>
                      ) : c.matchCount === 0 ? (
                        <span className="text-slate-500">マッチなし</span>
                      ) : (
                        <span className="text-emerald-800">OK</span>
                      )}
                      {c.matches.length > 0 ? (
                        <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                          {c.matches.map((m) => (
                            <li key={m.id}>
                              <Link
                                href={`/admin/matches?focus=${encodeURIComponent(m.id)}`}
                                className="text-indigo-800 hover:underline"
                              >
                                {m.partnerPending ? "未決定" : "割当済"}
                              </Link>
                              {" · "}
                              {formatJa(m.createdAt)}
                              {m.programId ? ` · ${m.programId.slice(0, 12)}…` : ""}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
