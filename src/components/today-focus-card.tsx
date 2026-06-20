"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
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

function FocusRow({
  label,
  children,
  href,
  cta,
  highlight = false,
}: {
  label: string;
  children: ReactNode;
  href?: string;
  cta?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={[
        "flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-4",
        highlight ? "border border-indigo-200/90 bg-indigo-50/40" : "border border-slate-200/80 bg-white",
      ].join(" ")}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium text-slate-600">{label}</p>
        <div className="mt-1">{children}</div>
      </div>
      {href && cta ? (
        <Link
          href={href}
          className="app-btn-primary shrink-0 rounded-xl px-4 py-2.5 text-[15px] font-semibold no-underline"
        >
          {cta}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * ホーム最上部 — 今日やること1枚（Apple-like: 大きい文字・余白・indigo/slate のみ）。
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

  const { nextSession, pendingVotes, pendingRoleplay, topAction, allActions, hasCoachingMatches } =
    focus;
  const extraActions = allActions.filter(
    (a) =>
      a.kind !== "VOTE_SLOTS" &&
      a.kind !== "SESSION_UPCOMING" &&
      a !== topAction,
  );

  return (
    <section className="app-surface-raised overflow-hidden rounded-3xl border border-slate-200/90">
      <div className="border-b border-slate-100 px-6 py-5 sm:px-7">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[1.65rem]">
          今日のフォーカス
        </h2>
        <p className="mt-1.5 text-base text-slate-600">いま確認すべきことを1枚にまとめています。</p>
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        <FocusRow
          label="次の1on1"
          highlight={Boolean(nextSession && nextSession.daysUntil <= 1)}
          href={nextSession ? `/match/${nextSession.matchId}#sessions` : undefined}
          cta={nextSession ? "詳細" : undefined}
        >
          {nextSession ? (
            <>
              <p className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-[2rem]">
                {formatDaysUntil(nextSession.daysUntil)}
              </p>
              <p className="mt-2 text-[17px] font-medium leading-snug text-slate-800">
                第 {nextSession.sessionNumber} 回 · {nextSession.label}
              </p>
              <p className="mt-1 text-base text-slate-600">{formatSessionWhen(nextSession.startAt)}</p>
            </>
          ) : (
            <p className="text-[17px] font-medium text-slate-700">確定済みの予定はまだありません</p>
          )}
        </FocusRow>

        <FocusRow
          label="未回答の候補日"
          href={pendingVotes[0]?.href}
          cta={pendingVotes.length > 0 ? "回答する" : undefined}
        >
          <p className="text-[17px] font-medium leading-snug text-slate-800">
            {pendingVotes.length === 0
              ? "対応不要です"
              : pendingVotes.length === 1
                ? `${pendingVotes[0]!.label} · 第 ${pendingVotes[0]!.sessionNumber} 回`
                : `${pendingVotes.length} 件 — ○× の回答が必要です`}
          </p>
        </FocusRow>

        {hasCoachingMatches ? (
          <FocusRow
            label="未入力のロールプレイ"
            href={pendingRoleplay[0]?.href}
            cta={pendingRoleplay.length > 0 ? "入力する" : undefined}
          >
            <p className="text-[17px] font-medium leading-snug text-slate-800">
              {pendingRoleplay.length === 0
                ? "対応不要です"
                : pendingRoleplay.length === 1
                  ? `${pendingRoleplay[0]!.label} · 第 ${pendingRoleplay[0]!.sessionNumber} 回`
                  : `${pendingRoleplay.length} 件 — 評価の入力が必要です`}
            </p>
          </FocusRow>
        ) : null}

        {topAction && topAction.kind !== "VOTE_SLOTS" ? (
          <details className="rounded-2xl border border-slate-200 bg-slate-50/70 px-5 py-4">
            <summary className="cursor-pointer text-[15px] font-semibold text-slate-800">
              その他の優先タスク
            </summary>
            <p className="mt-3 text-base leading-relaxed text-slate-800">{topAction.message}</p>
            <Link
              href={topAction.href}
              className="app-btn-primary mt-4 inline-flex rounded-xl px-4 py-2.5 text-[15px] no-underline"
            >
              {topAction.ctaLabel}
            </Link>
          </details>
        ) : null}

        {extraActions.length > 0 ? (
          <details className="rounded-2xl border border-slate-200 bg-slate-50/70 px-5 py-4">
            <summary className="cursor-pointer text-[15px] font-semibold text-slate-800">
              ほかのやること（{extraActions.length} 件）
            </summary>
            <ul className="mt-3 space-y-3">
              {extraActions.map((a: ActionItem, i) => (
                <li
                  key={`${a.kind}-${a.matchId ?? "g"}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-3 first:border-0 first:pt-0"
                >
                  <span className="min-w-0 text-base text-slate-800">{a.message}</span>
                  <Link
                    href={a.href}
                    className="shrink-0 text-[15px] font-semibold text-indigo-800 no-underline hover:underline"
                  >
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
