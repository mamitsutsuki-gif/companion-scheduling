"use client";

import type { PlanFeatures } from "@/lib/company-plan";
import { useEffect, useState } from "react";

type Role = "CLIENT" | "CLIENT_ADMIN" | "CLIENT_HR" | "PARTNER";

type GuideStep = { title: string; tab: string; tabLabel: string };

function buildSteps(
  role: Role,
  planFeatures: PlanFeatures,
  isCoachingPlan: boolean,
): GuideStep[] {
  const isClient = role === "CLIENT" || role === "CLIENT_ADMIN" || role === "CLIENT_HR";

  if (isCoachingPlan) {
    return isClient
      ? [
          { title: "チャットでパートナーに挨拶", tab: "chat", tabLabel: "チャット" },
          { title: "候補日が届いたら日程調整で ○× 回答", tab: "schedule", tabLabel: "日程調整" },
          { title: "1on1 後はセッション画面でロールプレイ評価", tab: "sessions", tabLabel: "1on1" },
        ]
      : [
          { title: "チャットでクライアントに挨拶", tab: "chat", tabLabel: "チャット" },
          { title: "日程調整から候補日を送る", tab: "schedule", tabLabel: "日程調整" },
          { title: "1on1 後はセッション画面でロールプレイ評価", tab: "sessions", tabLabel: "1on1" },
        ];
  }

  if (isClient) {
    const steps: GuideStep[] = [
      { title: "チャットでパートナーに挨拶", tab: "chat", tabLabel: "チャット" },
      { title: "候補日が届いたら日程調整で ○× 回答", tab: "schedule", tabLabel: "日程調整" },
      { title: "1on1 後はセッション画面で振り返り", tab: "sessions", tabLabel: "1on1" },
    ];
    if (planFeatures.fta) {
      steps.unshift({ title: "自分FTA でありたい姿を整理", tab: "fta", tabLabel: "自分FTA" });
    }
    return steps;
  }

  return [
    { title: "チャットでクライアントに挨拶", tab: "chat", tabLabel: "チャット" },
    { title: "日程調整から候補日を送る", tab: "schedule", tabLabel: "日程調整" },
    { title: "1on1 後はセッション画面でレポート", tab: "sessions", tabLabel: "1on1" },
  ];
}

/**
 * マッチルーム初回のみ表示する「ここから始めてください」ガイド。
 */
export function MatchRoomGuideBanner({
  userId,
  role,
  planFeatures,
  isCoachingPlan,
  onGoTab,
}: {
  userId: string;
  role: Role;
  planFeatures: PlanFeatures;
  isCoachingPlan: boolean;
  onGoTab: (tab: string) => void;
}) {
  const storageKey = `companion:match-room-guide:v1:${userId}`;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(storageKey) === "1") return;
    } catch {
      /* ignore */
    }
    setOpen(true);
  }, [storageKey]);

  if (!open) return null;

  const steps = buildSteps(role, planFeatures, isCoachingPlan);

  function dismiss() {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  return (
    <section className="rounded-2xl border border-indigo-200/90 bg-gradient-to-b from-indigo-50/80 to-white px-4 py-4 shadow-sm sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-indigo-700 uppercase">Guide</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">ここから始めてください</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            タブが増えていますが、最初はこの順番で進めるとスムーズです。
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          閉じる
        </button>
      </div>
      <ol className="mt-4 space-y-2">
        {steps.map((step, i) => (
          <li
            key={step.tab}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-white px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold text-indigo-700">STEP {i + 1}</p>
              <p className="mt-0.5 text-base font-medium text-slate-900">{step.title}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                onGoTab(step.tab);
                dismiss();
              }}
              className="shrink-0 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm font-semibold text-indigo-900 hover:bg-indigo-50"
            >
              {step.tabLabel}へ
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-slate-500">このガイドは最初の 1 回だけ表示されます。</p>
    </section>
  );
}
