import type { FtaChart } from "@/lib/fta";
import { FtaViewerVariantA, FtaViewerVariantB, FtaViewerVariantC, FtaViewerVariantD } from "./variants";

export const dynamic = "force-dynamic";

/**
 * 自分FTA のビジュアル候補プレビュー（管理者専用）。
 * 4 つの異なる配色 / 縁の太さ / 影 の組み合わせを、同じサンプル入力で比較できる。
 * 重要: 4 種すべて元の FtaViewer と「同じ座標計算」を使う。色・線幅・テキストの
 * 重み・微妙な影（filter） のみを変えているため、ノード同士の重なりは発生しない。
 */
const sampleChart: FtaChart = {
  vision: { text: "1年後、自信を持ってチームを率いるリーダーになる", locked: false },
  elements: [
    {
      id: "b-1",
      text: "対話力を磨く",
      locked: false,
      actions: [
        { id: "c-1-1", text: "毎週 1on1 を続ける", locked: false },
        { id: "c-1-2", text: "傾聴の本を月1冊", locked: false },
        { id: "c-1-3", text: "週次でメンバーに質問", locked: false },
      ],
    },
    {
      id: "b-2",
      text: "意思決定を速くする",
      locked: false,
      actions: [
        { id: "c-2-1", text: "判断ログを毎日記録", locked: false },
        { id: "c-2-2", text: "10分でNG基準を整理", locked: false },
        { id: "c-2-3", text: "翌日朝に振り返り", locked: false },
      ],
    },
    {
      id: "b-3",
      text: "戦略思考を鍛える",
      locked: false,
      actions: [
        { id: "c-3-1", text: "業界動向を週次収集", locked: false },
        { id: "c-3-2", text: "競合分析を月次更新", locked: false },
        { id: "c-3-3", text: "3年シナリオを描く", locked: false },
      ],
    },
    {
      id: "b-4",
      text: "メンバー育成",
      locked: false,
      actions: [
        { id: "c-4-1", text: "成長機会を月1提供", locked: false },
        { id: "c-4-2", text: "フィードバック隔週", locked: false },
        { id: "c-4-3", text: "個別キャリア面談", locked: false },
      ],
    },
    {
      id: "b-5",
      text: "健康・体力管理",
      locked: false,
      actions: [
        { id: "c-5-1", text: "週3回の運動", locked: false },
        { id: "c-5-2", text: "睡眠 7 時間以上", locked: false },
        { id: "c-5-3", text: "月1で健診", locked: false },
      ],
    },
    {
      id: "b-6",
      text: "業界ネットワーク",
      locked: false,
      actions: [
        { id: "c-6-1", text: "月1で外部勉強会", locked: false },
        { id: "c-6-2", text: "週1で新規アポ", locked: false },
        { id: "c-6-3", text: "LinkedIn 整備", locked: false },
      ],
    },
    {
      id: "b-7",
      text: "プロダクト理解",
      locked: false,
      actions: [
        { id: "c-7-1", text: "ユーザー対話 月5", locked: false },
        { id: "c-7-2", text: "競合プロダクト調査", locked: false },
        { id: "c-7-3", text: "メトリクス週次確認", locked: false },
      ],
    },
    {
      id: "b-8",
      text: "プライベート充実",
      locked: false,
      actions: [
        { id: "c-8-1", text: "家族と週末活動", locked: false },
        { id: "c-8-2", text: "趣味の時間確保", locked: false },
        { id: "c-8-3", text: "年2回の旅行", locked: false },
      ],
    },
  ],
};

export default async function FtaPreviewPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">
          Administrator / FTA Preview
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          自分FTA ビジュアル候補
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          現状の自分FTA の見た目に対して、4 種類のデザイン候補を同じサンプル入力で表示しています。
          ノード（円）同士の配置計算はすべて現状と同一で、色・線の太さ・文字の濃さ・微妙な影のみを変えています。
          下記から好みの番号を教えてください。「Variant 0（現状）」も比較用に残しています。
        </p>
        <ul className="mt-3 list-inside list-disc text-sm leading-relaxed text-slate-700">
          <li>
            <strong>Variant 0</strong>: 現状のデザイン（比較用）
          </li>
          <li>
            <strong>Variant A</strong>: コントラスト強化 — 縁を太く、文字をはっきり、Bは白＋濃いめスレートで読みやすく
          </li>
          <li>
            <strong>Variant B</strong>: ソフトカード — 控えめな影でほんのり立体感、淡い配色で上品
          </li>
          <li>
            <strong>Variant C</strong>: ブランド統一 — インディゴ系で統一感、A/B/C それぞれにアクセントを残す
          </li>
          <li>
            <strong>Variant D</strong>: エディトリアル — フラットで濃いテキスト、太めの輪郭、印刷物のような落ち着き
          </li>
        </ul>
      </header>

      <section className="space-y-4">
        <header>
          <h2 className="text-lg font-semibold text-slate-900">Variant 0 — 現状</h2>
          <p className="text-sm text-slate-600">
            現状の見た目です。B の灰色が薄め、文字が細め、輪郭が細い。
          </p>
        </header>
        <FtaViewerVariantA chart={sampleChart} variant="current" />
      </section>

      <section className="space-y-4">
        <header>
          <h2 className="text-lg font-semibold text-slate-900">Variant A — コントラスト強化</h2>
          <p className="text-sm text-slate-600">
            縁を太く（A: 3, B/C: 2.5）、テキストは中央と同じ濃さ・太さ（font-semibold）、
            B は白背景＋スレート濃いめの輪郭で「枠」がはっきり。控えめなドロップシャドウで奥行きを出します。
          </p>
        </header>
        <FtaViewerVariantA chart={sampleChart} variant="A" />
      </section>

      <section className="space-y-4">
        <header>
          <h2 className="text-lg font-semibold text-slate-900">Variant B — ソフトカード</h2>
          <p className="text-sm text-slate-600">
            柔らかい配色（B: ライムベージュ、C: エメラルド薄）と、ごく薄い影で立体感を出します。
            線は細めですが、影でカード感が出るため見やすさは向上します。
          </p>
        </header>
        <FtaViewerVariantB chart={sampleChart} />
      </section>

      <section className="space-y-4">
        <header>
          <h2 className="text-lg font-semibold text-slate-900">Variant C — ブランド統一</h2>
          <p className="text-sm text-slate-600">
            アプリのインディゴ系に揃えつつ、B はティールトーン、C はアンバートーンの差し色。
            縁太め＋影で立体感も出します。一番「アプリらしい」雰囲気になります。
          </p>
        </header>
        <FtaViewerVariantC chart={sampleChart} />
      </section>

      <section className="space-y-4">
        <header>
          <h2 className="text-lg font-semibold text-slate-900">Variant D — エディトリアル（フラット）</h2>
          <p className="text-sm text-slate-600">
            影なしのフラット。輪郭を太めにし、テキスト濃度で立体感の代わりに「重さ」を出します。
            シャープに見せたい場合の選択肢。
          </p>
        </header>
        <FtaViewerVariantD chart={sampleChart} />
      </section>
    </div>
  );
}
