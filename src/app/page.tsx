import { APP_DISPLAY_NAME, APP_SHORT_DESCRIPTION } from "@/lib/brand";
import Link from "next/link";

export default function Home() {
  const features = [
    {
      title: "個別ペアのみ",
      body: "マッチ済みのパートナーとクライアントだけが同じルームに入れます。「誰とも予約」の誤解がありません。",
    },
    {
      title: "連絡先はアプリに閉じる",
      body: "画面上ではお互いに表示されるのは表示名のみ。メール通知はプラットフォームから送ります。",
    },
    {
      title: "候補ベースで決める",
      body: "空き一覧ではなく「3〜5件の候補に○／×」の流れ。伴走モデルと噛み合う UX です。",
    },
    {
      title: "確定とカレンダー",
      body: "確定後に双方都へ案内。.ics と登録済みオンライン会議リンクも同梱できます。",
    },
  ];

  return (
    <div className="min-h-full bg-white">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-slate-900 no-underline">
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-700 text-sm font-bold text-white"
            >
              伴
            </span>
            <span>{APP_DISPLAY_NAME}</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 no-underline hover:bg-slate-100 hover:text-slate-900"
            >
              ログイン
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white no-underline shadow-sm hover:bg-indigo-800"
            >
              アカウント作成
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-gradient-to-b from-indigo-50/85 via-white to-white">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:gap-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-24">
            <div className="space-y-6">
              <p className="inline-flex rounded-full bg-indigo-100/90 px-3 py-1 text-xs font-semibold tracking-wide text-indigo-950 ring-1 ring-indigo-200/80">
                伴走サービス向けプラットフォーム
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl lg:text-[2.85rem] lg:leading-tight">
                伴走関係に合わせた、
                <br className="hidden sm:inline" /> 日程とコミュニケーション。
              </h1>
              <p className="max-w-lg text-lg leading-relaxed text-slate-600">{APP_SHORT_DESCRIPTION}</p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center rounded-xl bg-indigo-700 px-6 py-3 text-sm font-semibold text-white no-underline shadow-sm hover:bg-indigo-800"
                >
                  利用を始める
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-800 no-underline shadow-xs hover:bg-slate-50"
                >
                  ログイン
                </Link>
              </div>
            </div>
            <div className="relative rounded-3xl border border-slate-200/90 bg-white/90 p-6 shadow-xl shadow-indigo-100/40 ring-1 ring-slate-200/60 backdrop-blur-sm sm:p-8">
              <div className="absolute -top-10 -right-8 h-40 w-40 rounded-full bg-indigo-200/50 blur-3xl" aria-hidden />
              <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Flow</h2>
              <ol className="mt-5 space-y-4 text-sm text-slate-700">
                <li className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-700 text-xs font-bold text-white">
                    1
                  </span>
                  <span>管理者がパートナーとクライアントのマッチを登録</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-700 text-xs font-bold text-white">
                    2
                  </span>
                  <span>ルームでメッセージと日程候補のやり取り</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-700 text-xs font-bold text-white">
                    3
                  </span>
                  <span>確定後、通知とカレンダー登録用データを配信</span>
                </li>
              </ol>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-100 bg-slate-50/50 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-semibold tracking-tight text-slate-900">主な特徴</h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-slate-600">
              汎用予約ツールではなく、長期の 1対1 サポートに必要な最低限に絞っています。
            </p>
            <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((f) => (
                <li
                  key={f.title}
                  className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition hover:border-indigo-200/80 hover:shadow-md"
                >
                  <h3 className="font-semibold text-slate-900">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-center text-xs text-slate-500 sm:flex-row sm:text-left sm:px-6">
          <span className="font-medium text-slate-700">{APP_DISPLAY_NAME}</span>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/login" className="text-slate-600 no-underline hover:text-slate-900">
              ログイン
            </Link>
            <Link href="/register" className="text-slate-600 no-underline hover:text-slate-900">
              アカウント作成
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
