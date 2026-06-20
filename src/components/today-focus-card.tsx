"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ActionItem } from "@/lib/next-actions";
import type { TodayFocus } from "@/lib/today-focus";
import { formatDaysUntil } from "@/lib/today-focus";

type FocusResponse = {
  focus?: TodayFocus | null;
  matches?: { matchId: string }[];
};

function formatSessionWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
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

function Row({
  label,
  value,
  href,
  cta,
  muted = false,
}: {
  label: string;
  value: string;
  href?: string;
  cta?: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3.5 ${
        muted ? "bg-slate-50" : "bg-white"
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 text-base font-semibold leading-snug text-slate-900">{value}</p>
      </div>
      {href && cta ? (
        <Link href={href} className="app-btn-primary shrink-0 rounded-lg px-3.5 py-2 text-sm no-underline">
          {cta}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * ホーム最上部の「今日のフォーカス」1枚カード。
 * 次の1on1・未回答候補・未入力ロールプレイをまとめて表示する。
 */
export function TodayFocusCard() {
  const [focus, setFocus] = useState<TodayFocus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hasMatches, setHasMatches] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/me/next-actions", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as FocusResponse | null;
        if (cancelled) return;
        setFocus(json?.focus ?? null);
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

  if (!loaded || !hasMatches || !focus) return null;

  const { nextSession, pendingVotes, pendingRoleplay, topAction, allActions } = focus;
  const hasTodos = pendingVotes.length > 0 || pendingRoleplay.length > 0 || Boolean(topAction);
  const extraActions = allActions.slice(topAction ? 1 : 0);

  return (
    <section className="app-surface-raised overflow-hidden rounded-2xl border border-slate-200/90 shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-b from-slate-50/90 to-white px-5 py-4 sm:px-6">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-indigo-700 uppercase">Today</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 sm:text-[1.35rem]">
          今日のフォーカス
        </h2>
      </div>

      <div className="space-y-2 p-4 sm:p-5">
        {nextSession ? (
          <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/50 px-4 py-4">
            <p className="text-sm font-medium text-indigo-800/80">次の1on1</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-indigo-950">
              {formatDaysUntil(nextSession.daysUntil)}
            </p>
            <p className="mt-2 text-base leading-relaxed text-slate-800">
              第 {nextSession.sessionNumber} 回 · {nextSession.label}
              <span className="mt-1 block text-sm text-slate-600">
                {formatSessionWhen(nextSession.startAt)}
              </span>
            </p>
            <Link
              href={`/match/${nextSession.matchId}#sessions`}
              className="mt-3 inline-flex text-sm font-semibold text-indigo-800 no-underline hover:text-indigo-950"
            >
              セッション詳細を開く →
            </Link>
          </div>
        ) : (
          <Row label="次の1on1" value="確定済みの予定はまだありません" muted />
        )}

        {pendingVotes.length > 0 ? (
          <Row
            label="未回答の候補日"
            value={
              pendingVotes.length === 1
                ? `${pendingVotes[0]!.label} · 第 ${pendingVotes[0]!.sessionNumber} 回`
                : `${pendingVotes.length} 件（候補日への ○× 回答が必要です）`
            }
            href={pendingVotes[0]!.href}
            cta="回答する"
          />
        ) : (
          <Row label="未回答の候補日" value="対応不要です" muted />
        )}

        {pendingRoleplay.length > 0 ? (
          <Row
            label="未入力のロールプレイ"
            value={
              pendingRoleplay.length === 1
                ? `${pendingRoleplay[0]!.label} · 第 ${pendingRoleplay[0]!.sessionNumber} 回`
                : `${pendingRoleplay.length} 件（評価の入力が必要です）`
            }
            href={pendingRoleplay[0]!.href}
            cta="入力する"
          />
        ) : null}

        {topAction && topAction.kind !== "VOTE_SLOTS" ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5">
            <p className="text-sm font-medium text-slate-500">いちばん優先</p>
            <p className="mt-1 text-base font-semibold leading-snug text-slate-900">{topAction.message}</p>
            <Link
              href={topAction.href}
              className="app-btn-primary mt-3 inline-flex rounded-lg px-3.5 py-2 text-sm no-underline"
            >
              {topAction.ctaLabel}
            </Link>
          </div>
        ) : null}

        {!hasTodos && !nextSession ? (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            いま対応が必要な用事はありません。
          </p>
        ) : null}

        {extraActions.length > 0 ? (
          <details className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">
              その他のやること（{extraActions.length} 件）
            </summary>
            <ul className="mt-3 space-y-2">
              {extraActions.map((a: ActionItem, i) => (
                <li key={`${a.kind}-${a.matchId ?? "g"}-${i}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 text-slate-800">{a.message}</span>
                  <Link href={a.href} className="shrink-0 font-semibold text-indigo-800 no-underline hover:underline">
                    {a.ctaLabel}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}
