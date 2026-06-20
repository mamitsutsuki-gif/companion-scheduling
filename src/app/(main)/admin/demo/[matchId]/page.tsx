"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import type { AdminDemoMatchPreview, DemoRole } from "@/lib/admin-demo";
import {
  AdminDemoRolePreviewPanel,
  AdminDemoRoleTabs,
} from "@/components/admin-demo-role-preview";

export default function AdminDemoMatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<AdminDemoMatchPreview | null>(null);
  const [role, setRole] = useState<DemoRole>("CLIENT");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/demo/${encodeURIComponent(matchId)}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as
          | { preview?: AdminDemoMatchPreview; error?: string }
          | null;
        if (cancelled) return;
        if (!res.ok || !json?.preview) {
          setError(json?.error ?? "取得に失敗しました。");
          return;
        }
        setPreview(json.preview);
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
  }, [matchId]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 sm:gap-10">
      <header className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-8">
        <Link
          href="/admin/demo"
          className="text-sm font-medium text-indigo-700 no-underline hover:underline"
        >
          ← デモ一覧に戻る
        </Link>
        {preview ? (
          <>
            <h1 className="mt-3 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              {preview.clientName} × {preview.partnerName}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {preview.companyName} · {preview.planLabel} · 全 {preview.totalSessions} 回
            </p>
          </>
        ) : (
          <h1 className="mt-3 text-xl font-semibold text-slate-900">デモプレビュー</h1>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={`/match/${encodeURIComponent(matchId)}`}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 no-underline hover:bg-slate-50"
          >
            管理者としてマッチルームを開く
          </Link>
          {preview?.companyId ? (
            <Link
              href={`/admin/companies/${encodeURIComponent(preview.companyId)}/settings`}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 no-underline hover:bg-slate-50"
            >
              企業設定
            </Link>
          ) : null}
        </div>
      </header>

      {loading ? <p className="text-sm text-slate-500">読込中…</p> : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

      {preview && !loading ? (
        <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <AdminDemoRoleTabs role={role} onRole={setRole} />
          <AdminDemoRolePreviewPanel preview={preview} role={role} />
          <p className="border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
            このプレビューは登録データから自動生成しています。実際の画面とレイアウトは一致しますが、操作はできません。
            操作デモが必要な場合は、デモ用アカウントでログインする方法と併用してください。
          </p>
        </section>
      ) : null}
    </div>
  );
}
