"use client";

import { useState } from "react";
import { FtaViewer } from "@/components/fta-chart";
import type { FtaChart } from "@/lib/fta";

/**
 * 自分FTA の編集画面に「例を見る」ボタンを置き、押すと
 * - 例文（テキスト）
 * - 例の FtaChart をそのまま FtaViewer でレンダリングしたもの
 * の両方が見られるようにする。
 *
 * これは初めて FTA を書く人が A/B/C の対応関係で詰まるのを防ぐためで、
 * デフォルトは閉じている。閉じている状態では既存 UI を一切触らない。
 */
const EXAMPLE_CHART: FtaChart = {
  vision: {
    text: "会議で自分の意見を率直に伝えられるようになっている",
    locked: false,
  },
  elements: [
    {
      id: "ex-b-1",
      text: "B① 会議前に論点を整理している",
      locked: false,
      actions: [
        {
          id: "ex-b-1-c-1",
          text: "会議前日に 3 行メモを書く",
          locked: false,
        },
        {
          id: "ex-b-1-c-2",
          text: "アジェンダを確認し、自分の論点を 1 つ決める",
          locked: false,
        },
      ],
    },
    {
      id: "ex-b-2",
      text: "B② 上司との 1on1 で発言の練習をしている",
      locked: false,
      actions: [
        {
          id: "ex-b-2-c-1",
          text: "月初に上司に練習依頼を送る",
          locked: false,
        },
        {
          id: "ex-b-2-c-2",
          text: "1on1 で自分の意見を必ず 1 つ伝える",
          locked: false,
        },
      ],
    },
    {
      id: "ex-b-3",
      text: "B③ 安全に発言できる場を増やしている",
      locked: false,
      actions: [
        {
          id: "ex-b-3-c-1",
          text: "週 1 回、同期とランチで業務の話をする",
          locked: false,
        },
      ],
    },
    {
      id: "ex-b-4",
      text: "B④ フィードバックを記録している",
      locked: false,
      actions: [
        {
          id: "ex-b-4-c-1",
          text: "会議後にもらった反応をノートに 3 行残す",
          locked: false,
        },
      ],
    },
  ],
};

export function FtaExampleToggle() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-950">
            初めての方へ：書き方の例を見る
          </p>
          <p className="mt-1 text-xs text-amber-900/80">
            中心（ありたい姿）→ 要素（B）→ 行動（C）の対応関係を、サンプルで確認できます。
            実際の書き方の参考にしてください。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-100"
        >
          {open ? "例を閉じる" : "例を見る"}
        </button>
      </div>
      {open ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl bg-white p-4 text-sm text-slate-800">
            <p className="font-semibold text-slate-900">テキストでの例：</p>
            <ul className="mt-2 space-y-1 leading-relaxed">
              <li>
                <strong>A（ありたい姿）</strong>：会議で自分の意見を率直に伝えられるようになっている
              </li>
              <li>
                <strong>B（要素）</strong>：① 会議前に論点を整理している ／ ② 上司との 1on1 で発言の練習をしている
              </li>
              <li>
                <strong>C（行動）</strong>：B① に対し → 会議前日に 3 行メモを書く ／ B② に対し →
                月初に上司に練習依頼を送る
              </li>
            </ul>
            <p className="mt-3 text-xs text-slate-500">
              ※ 完璧な答えではなく、書きながら整理していくのがおすすめです。最初は中央 1 行だけでも問題ありません。
            </p>
          </div>
          <div className="rounded-xl bg-white p-2">
            <FtaViewer chart={EXAMPLE_CHART} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
