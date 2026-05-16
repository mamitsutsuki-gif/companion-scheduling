"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Role = "CLIENT" | "CLIENT_ADMIN" | "CLIENT_HR" | "PARTNER";

/**
 * 初回ログイン時に 1 回だけ出す「ようこそ」モーダル。
 *
 * - 既に `onboardedAt` がセットされているユーザーには出さない
 * - マッチなし／ありで文言を切り替え（運用側のご案内に合わせる）
 * - 「閉じる」を押した時点で `POST /api/me/onboarding` で `onboardedAt` を保存
 *
 * 表示判定は親（dashboard）の `shouldShow` を信頼する。
 */
export function OnboardingModal({
  userId,
  shouldShow,
  role,
  hasMatches,
}: {
  userId: string;
  shouldShow: boolean;
  role: Role;
  hasMatches: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const storageKey = `companion:onboarding:v1:${userId}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(storageKey) === "1") {
        setOpen(false);
        return;
      }
    } catch {
      /* private mode 等 */
    }
    setOpen(Boolean(shouldShow));
  }, [shouldShow, storageKey]);

  if (!open) return null;

  const isClient = role === "CLIENT" || role === "CLIENT_ADMIN" || role === "CLIENT_HR";
  const headline = "登録ありがとうございます";
  const subline = hasMatches
    ? "マッチングが成立しました。次のステップに沿ってアプリをご利用ください。"
    : "アサインが完了するまで、次の内容をご確認ください。";

  const steps: { title: string; desc: string }[] = !hasMatches
    ? isClient
      ? [
          {
            title: "① 自分FTA を入力しましょう",
            desc:
              "ホームのメニューから「自分FTA」に入力できます。入力は担当パートナーとの対話の土台になります。",
          },
          {
            title: "② あなた専属の対話パートナーをアサインするまでお待ちください",
            desc: "アサインが決まりましたら、このアプリからメールでもお知らせします。",
          },
        ]
      : [
          {
            title: "① 皆さんも自分FTA に入力してみましょう",
            desc:
              "クライアントやほかの方に公開されることはありません。ご自身での整理にもお使いください。",
          },
          {
            title: "② アサインが決まるまでお待ちください",
            desc: "担当クライアントが決まりましたら、このアプリからメールでもお知らせします。",
          },
        ]
    : isClient
      ? [
          {
            title: "① 自分FTA を入力しましょう",
            desc: "ありたい姿や行動を整理しておくと、対話がスムーズです。",
          },
          {
            title: "② 対話パートナーと挨拶しましょう",
            desc: "担当ペアのルームを開き、チャットでまずはご挨拶を送ってください。",
          },
          {
            title: "③ 日程調整の候補日は対話パートナーから届きます",
            desc: "候補日はパートナーから送られます。届くまでお待ちください。",
          },
        ]
      : [
          {
            title: "① クライアントに挨拶しましょう",
            desc: "担当ペアのルームを開き、チャットではじめの一言を送ってください。",
          },
          {
            title: "② 日程調整を進めましょう",
            desc:
              "候補日はパートナーからしか送れません。「日程調整」タブから第1回などの候補日を送ってください。",
          },
        ];

  async function dismiss() {
    if (closing) return;
    setClosing(true);
    try {
      try {
        window.localStorage.setItem(storageKey, "1");
      } catch {
        /* ignore */
      }
      await fetch("/api/me/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
      /* ignore */
    }
    setOpen(false);
    setClosing(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <p className="text-xs font-semibold tracking-widest text-indigo-700 uppercase">Welcome</p>
        <h2 className="mt-2 text-[1.6rem] font-semibold leading-snug tracking-tight text-slate-900 sm:text-3xl">
          {headline}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-slate-700">{subline}</p>

        <ol className="mt-6 space-y-4">
          {steps.map((s, i) => (
            <li key={i} className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 shadow-xs">
              <p className="text-base font-semibold text-slate-900">{s.title}</p>
              <p className="mt-2 text-base leading-relaxed text-slate-700">{s.desc}</p>
            </li>
          ))}
        </ol>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">このご案内は最初の 1 回だけ表示されます。</p>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/fta"
              onClick={() => void dismiss()}
              className="rounded-lg border border-indigo-300 bg-white px-4 py-2.5 text-base font-semibold text-indigo-900 no-underline hover:bg-indigo-50"
            >
              自分FTAへ
            </Link>
            <button
              type="button"
              onClick={() => void dismiss()}
              disabled={closing}
              className="app-btn-primary rounded-lg px-5 py-2.5 text-base disabled:opacity-60"
            >
              はじめる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
