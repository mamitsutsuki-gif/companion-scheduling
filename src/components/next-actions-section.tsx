"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ActionItem, ActionSeverity } from "@/lib/next-actions";

/**
 * 「あなたが次にやること」リスト。
 *
 * ダッシュボード最上部に出す。 `/api/me/next-actions` を 30 秒ごとに polling し、
 * 担当ペアごとに集計された「あなたが今日やる用事」を 1 件ずつカード表示する。
 *
 * 管理者・管理者アシスタント のときは API 側で空配列を返すので、結果として
 * このセクションは「すべて完了です」ステートになり邪魔にならない。
 */
const sevPalette: Record<ActionSeverity, { card: string; tag: string; tagLabel: string }> = {
  info: {
    card: "border-slate-200 bg-white",
    tag: "bg-slate-100 text-slate-700",
    tagLabel: "情報",
  },
  todo: {
    card: "border-indigo-200 bg-indigo-50/40",
    tag: "bg-indigo-100 text-indigo-900",
    tagLabel: "やること",
  },
  warn: {
    card: "border-amber-300 bg-amber-50",
    tag: "bg-amber-200 text-amber-900",
    tagLabel: "要対応",
  },
  critical: {
    card: "border-rose-300 bg-rose-50",
    tag: "bg-rose-200 text-rose-900",
    tagLabel: "至急",
  },
};

export function NextActionsSection() {
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hasMatches, setHasMatches] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/me/next-actions", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as
          | { actions?: ActionItem[]; matches?: { matchId: string }[] }
          | null;
        if (cancelled) return;
        setActions(Array.isArray(json?.actions) ? (json.actions as ActionItem[]) : []);
        setHasMatches(Array.isArray(json?.matches) ? (json.matches?.length ?? 0) > 0 : false);
        setLoaded(true);
      } catch {
        /* ignore */
      }
    }
    void load();
    const id = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // マッチが無いときは「アサイン待ち」が出るので、このセクションは黙る
  if (loaded && !hasMatches) return null;
  if (!loaded) return null;

  // 全部完了している時は穏やかな「今は対応必要なし」を出す
  if (actions.length === 0) {
    return (
      <section className="app-surface-emerald rounded-2xl p-4 sm:p-5">
        <h2 className="text-base font-semibold text-emerald-900">あなたの次のアクション</h2>
        <p className="mt-1 text-sm text-emerald-900/80">
          いま対応が必要な用事はありません。担当パートナー／クライアントからの動きがあると、ここに表示されます。
        </p>
      </section>
    );
  }

  return (
    <section className="app-surface-raised rounded-2xl p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">
          あなたの次のアクション{" "}
          <span className="text-sm font-normal text-slate-500">({actions.length} 件)</span>
        </h2>
        <p className="hidden text-xs text-slate-500 sm:block">30 秒ごとに自動更新</p>
      </div>
      <ul className="mt-3 space-y-2">
        {actions.map((a, i) => {
          const pal = sevPalette[a.severity];
          return (
            <li
              key={`${a.kind}-${a.matchId ?? "global"}-${i}`}
              className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border px-4 py-3 ${pal.card}`}
            >
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${pal.tag}`}>
                    {pal.tagLabel}
                  </span>
                </div>
                <p className="break-words text-sm text-slate-900">{a.message}</p>
              </div>
              <Link
                href={a.href}
                className="app-btn-primary shrink-0 rounded-md px-3 py-1.5 text-sm no-underline"
              >
                {a.ctaLabel}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
