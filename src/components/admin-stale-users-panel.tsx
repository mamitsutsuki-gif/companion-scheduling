"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type StaleUser = {
  id: string;
  displayName: string;
  email: string | null;
  role: string;
  companyId: string | null;
  lastSeenAt: string | null;
  daysSinceLastSeen: number | null;
};

const roleLabel: Record<string, string> = {
  CLIENT: "クライアント",
  CLIENT_ADMIN: "クライアント管理者",
  CLIENT_HR: "クライアント人事",
  PARTNER: "パートナー",
};

/**
 * 管理者ホームで「最近ログインしていないユーザー」を炙り出すパネル。
 *
 * `lastSeenAt` は `requireUser()` の中で 1 時間ごとに書き込まれる。
 * - 14 日以上アクセスしていないユーザー
 * - そもそも一度もログインしていないユーザー（lastSeenAt が無い）
 * の両方をひとまとめにして表示する。
 *
 * 管理者は「声がけ／削除／ロール変更」などのオペレーションをここから判断できる。
 */
export function AdminStaleUsersPanel() {
  const [rows, setRows] = useState<StaleUser[]>([]);
  const [days, setDays] = useState<number>(14);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/stale-users?days=${days}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as {
          users?: StaleUser[];
          thresholdDays?: number;
        } | null;
        if (cancelled) return;
        setRows(Array.isArray(json?.users) ? (json.users as StaleUser[]) : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (loading && rows.length === 0) return null;
  if (!loading && rows.length === 0) return null;

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-amber-950">
            最近アクセスのないユーザー（要フォロー）
          </h2>
          <p className="mt-1 text-sm text-amber-900/90">
            {days} 日以上ログインがないユーザー、または登録後 1 度もアクセスしていないユーザーです。
            放置防止のため、必要に応じて声がけ／削除／ロール変更をご検討ください。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-amber-900">
            閾値（日）
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="ml-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-sm text-amber-900"
            >
              {[7, 14, 21, 30, 60, 90].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-100"
          >
            {collapsed ? `${rows.length} 件を表示` : "折りたたむ"}
          </button>
        </div>
      </div>
      {!collapsed ? (
        <ul className="mt-3 divide-y divide-amber-200/70 rounded-xl border border-amber-200 bg-white">
          {rows.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  {u.displayName}{" "}
                  <span className="ml-1 text-xs font-normal text-slate-500">
                    ({roleLabel[u.role] ?? u.role})
                  </span>
                </p>
                <p className="text-xs text-slate-500">
                  {u.email ? `${u.email} · ` : ""}
                  {u.daysSinceLastSeen === null
                    ? "登録後一度もログインなし"
                    : `最終アクセス: ${u.daysSinceLastSeen} 日前`}
                </p>
              </div>
              <Link
                href={`/admin/users/${u.id}`}
                className="rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-900 no-underline hover:bg-amber-100"
              >
                ユーザー詳細
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
