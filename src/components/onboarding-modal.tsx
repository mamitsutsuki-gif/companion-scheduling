"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Role = "CLIENT" | "CLIENT_ADMIN" | "CLIENT_HR" | "PARTNER";

/**
 * 初回ログイン時に 1 回だけ出す「ようこそ」モーダル。
 *
 * - 既に `onboardedAt` がセットされているユーザーには出さない
 * - マッチがまだ無い場合は、3 ステップを「アサイン待ち」前提に変える
 *   （いきなり「日程候補を送る」が出ても何も押せないので）
 * - 「閉じる」を押した時点で `POST /api/me/onboarding` を叩いて
 *   `onboardedAt` を保存する（2 回目以降は出ない）
 *
 * 表示判定:
 *   parent から `shouldShow` と `role` / `hasMatches` を受け取って描画する。
 *   表示判定そのものはサーバー側（dashboard ページ）で決める。
 */
export function OnboardingModal({
  shouldShow,
  role,
  hasMatches,
}: {
  shouldShow: boolean;
  role: Role;
  hasMatches: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (shouldShow) setOpen(true);
  }, [shouldShow]);

  if (!open) return null;

  const isClient = role === "CLIENT" || role === "CLIENT_ADMIN" || role === "CLIENT_HR";
  const headline = "ようこそ";
  const subline =
    "最初に簡単な使い方をご案内します（1 分で読めます）。あとから困ったら、ホーム上部のメニューから各画面を開いてください。";

  // マッチ未割当のときは「アサインを待つ」をステップ 1 に置き、操作系は薄める
  const steps: { title: string; desc: string }[] = hasMatches
    ? isClient
      ? [
          {
            title: "① 自分FTA を書く（5〜10 分）",
            desc:
              "ありたい姿（中央）と、そのための要素・行動（B/C）を書きます。最初は中央 1 行だけでもOK。書きながら整理していきましょう。",
          },
          {
            title: "② 担当パートナーに「はじめまして」を送る",
            desc:
              "ホームから担当ペアを開き、チャット欄で挨拶を送ってください。メールは公開されないので安心です。",
          },
          {
            title: "③ パートナーから日程候補が届いたら、◯×で回答",
            desc:
              "候補日が届いたら、各候補に◯（参加できる）／×（参加できない）を入力してください。すべて× の場合は新しい候補が届きます。",
          },
        ]
      : [
          {
            title: "① 担当クライアントに「はじめまして」を送る",
            desc:
              "ホームから担当ペアを開き、チャットで挨拶を送ってください。メールアドレスは公開されないので安心です。",
          },
          {
            title: "② 第1回の候補日を送る",
            desc:
              "日程調整タブから候補日を 2〜3 個提示します。クライアントが ◯× で回答してくれます。",
          },
          {
            title: "③ クライアントの自分FTA を確認",
            desc:
              "ペア画面の「クライアント自分FTA」タブから、相手のありたい姿と行動を確認できます。1on1 の話題作りにご活用ください。",
          },
        ]
    : isClient
      ? [
          {
            title: "① まずは「アサインをお待ちください」",
            desc:
              "管理者があなたに担当パートナーを割り当てるまで、ペアは表示されません。通常は数営業日以内にアサインされます。",
          },
          {
            title: "② 待っている間に「自分FTA」を書いておく",
            desc:
              "ホーム右上メニューから「自分FTA」を開き、中央のありたい姿だけでも先に書いておくと、対話開始がスムーズです。",
          },
          {
            title: "③ アサインされたら、自動でホームに「担当ペア」が出ます",
            desc:
              "ペアを開くとチャット・日程調整ができるようになります。それまで特に操作は必要ありません。",
          },
        ]
      : [
          {
            title: "① まずは「アサインをお待ちください」",
            desc:
              "管理者があなたに担当クライアントを割り当てるまで、ペアは表示されません。通常は数営業日以内にアサインされます。",
          },
          {
            title: "② 会議リンクの設定だけ済ませておく",
            desc:
              "ホーム上部「会議リンク設定」から、ご自身の Zoom 等の URL を登録しておきましょう。日程確定時にクライアントへ自動共有されます。",
          },
          {
            title: "③ アサインされたら、自動でホームに「担当ペア」が出ます",
            desc:
              "ペアを開くと、チャット・日程調整・パートナーレポート・請求書まで一通りこちらで対応できます。",
          },
        ];

  async function dismiss() {
    if (closing) return;
    setClosing(true);
    try {
      await fetch("/api/me/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
      /* ignore: 失敗しても UI 側では閉じる */
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
        <h2 className="mt-1 text-2xl font-semibold text-slate-900">{headline}</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-700">{subline}</p>

        <ol className="mt-5 space-y-3">
          {steps.map((s, i) => (
            <li
              key={i}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-xs"
            >
              <p className="text-sm font-semibold text-slate-900">{s.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{s.desc}</p>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">このご案内は最初の 1 回だけ表示されます。</p>
          <div className="flex flex-wrap items-center gap-2">
            {isClient && hasMatches ? (
              <Link
                href="/fta"
                onClick={() => void dismiss()}
                className="rounded-md border border-indigo-300 bg-white px-4 py-2 text-sm font-semibold text-indigo-900 no-underline hover:bg-indigo-50"
              >
                自分FTAから始める
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => void dismiss()}
              disabled={closing}
              className="rounded-md bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-60"
            >
              はじめる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
