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
          {
            title: "パートナーから日程調整の連絡が届くまでお待ちください",
            tab: "sessions",
            tabLabel: "1on1セッション",
          },
          {
            title: "候補日が届いたら 1on1セッションで ○× 回答",
            tab: "sessions",
            tabLabel: "1on1セッション",
          },
          {
            title: "1on1 後は同じタブでロールプレイ評価",
            tab: "sessions",
            tabLabel: "1on1セッション",
          },
        ]
      : [
          { title: "チャットでクライアントに挨拶", tab: "chat", tabLabel: "チャット" },
          {
            title: "1on1セッションから候補日を送る",
            tab: "sessions",
            tabLabel: "1on1セッション",
          },
          {
            title: "1on1 後は同じタブでロールプレイ評価",
            tab: "sessions",
            tabLabel: "1on1セッション",
          },
        ];
  }

  if (isClient) {
    const steps: GuideStep[] = [
      {
        title: "パートナーから日程調整の連絡が届くまでお待ちください",
        tab: "sessions",
        tabLabel: "1on1セッション",
      },
      {
        title: "候補日が届いたら 1on1セッションで ○× 回答",
        tab: "sessions",
        tabLabel: "1on1セッション",
      },
      {
        title: "1on1 後は同じタブで振り返り",
        tab: "sessions",
        tabLabel: "1on1セッション",
      },
    ];
    if (planFeatures.fta) {
      steps.unshift({ title: "自分FTA でありたい姿を整理", tab: "fta", tabLabel: "自分FTA" });
    }
    return steps;
  }

  return [
    { title: "チャットでクライアントに挨拶", tab: "chat", tabLabel: "チャット" },
    {
      title: "1on1セッションから候補日を送る",
      tab: "sessions",
      tabLabel: "1on1セッション",
    },
    {
      title: "1on1 後は同じタブでレポート",
      tab: "sessions",
      tabLabel: "1on1セッション",
    },
  ];
}

/**
 * マッチルーム初回のみ — 短いステップガイド（説明はここだけ、以降は各タブに集約）。
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
  const storageKey = `companion:match-room-guide:v2:${userId}`;
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
    <section className="app-surface-raised rounded-3xl border border-slate-200/90 px-5 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            ここから始めてください
          </h2>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-xl px-3 py-2 text-[15px] font-medium text-slate-600 hover:bg-slate-100"
        >
          閉じる
        </button>
      </div>
      <ol className="mt-5 space-y-3">
        {steps.map((step, i) => (
          <li
            key={`${step.tab}-${i}`}
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-indigo-700">STEP {i + 1}</p>
              <p className="mt-1 text-[17px] font-medium leading-snug text-slate-900">{step.title}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                onGoTab(step.tab);
                dismiss();
              }}
              className="app-btn-secondary shrink-0 rounded-xl px-4 py-2.5 text-[15px] font-semibold"
            >
              {step.tabLabel}へ
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-slate-500">初回のみ表示されます。</p>
    </section>
  );
}
