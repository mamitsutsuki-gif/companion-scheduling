import { APP_DISPLAY_NAME, APP_SHORT_DESCRIPTION } from "@/lib/brand";
import { MotiveIjiLogo } from "@/components/motive-iji-logo";
import Link from "next/link";

export default function Home() {
  const capabilities = [
    {
      title: "担当者との1対1",
      body: "あなたに設定されたパートナー（コーチ）とのルームだけにアクセスできます。",
    },
    {
      title: "日程の調整",
      body: "候補日時への回答と確定を、アプリ内で行えます。",
    },
    {
      title: "メッセージ",
      body: "セッションに関する連絡は、マッチルームのメッセージで行います。",
    },
    {
      title: "必要な記録",
      body: "プログラムの内容に応じて、目標設定や振り返りなどの記録を行えます。",
    },
  ];

  return (
    <div className="min-h-full bg-white">
      <header className="app-shell-header">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight text-slate-900 no-underline">
            <MotiveIjiLogo variant="icon" />
            <span className="text-base">{APP_DISPLAY_NAME}</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="app-btn-primary rounded-lg px-4 py-2 text-sm no-underline"
            >
              ログイン
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-gradient-to-b from-indigo-50/85 via-white to-white">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:gap-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-20">
            <div className="space-y-6">
              <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl lg:text-[2.75rem] lg:leading-tight">
                担当者とのセッションを、
                <br className="hidden sm:inline" />
                ひとつの場所で。
              </h1>
              <p className="max-w-lg text-lg leading-relaxed text-slate-600">{APP_SHORT_DESCRIPTION}</p>
              <div className="space-y-3">
                <Link
                  href="/login"
                  className="app-btn-primary inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm no-underline"
                >
                  ログイン
                </Link>
                <p className="text-sm leading-relaxed text-slate-500">
                  初めてご利用の方は、案内メールのURLからアカウント作成を行ってください。
                  {" "}
                  <Link href="/register" className="font-semibold text-indigo-800 underline">
                    アカウント作成
                  </Link>
                </p>
              </div>
            </div>
            <div className="app-surface-raised relative rounded-3xl p-6 backdrop-blur-sm sm:p-8">
              <div className="absolute -top-10 -right-8 h-40 w-40 rounded-full bg-indigo-200/50 blur-3xl" aria-hidden />
              <h2 className="text-sm font-semibold tracking-wide text-slate-500">ご利用の流れ</h2>
              <ol className="mt-5 space-y-4 text-sm text-slate-700">
                <li className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-indigo-500 to-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-900/30 ring-1 ring-indigo-600/35">
                    1
                  </span>
                  <span>案内メールからログイン、またはアカウントを作成</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-indigo-500 to-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-900/30 ring-1 ring-indigo-600/35">
                    2
                  </span>
                  <span>マッチルームでメッセージや日程候補のやり取り</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-indigo-500 to-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-900/30 ring-1 ring-indigo-600/35">
                    3
                  </span>
                  <span>確定後、日時とオンライン会議の案内を確認</span>
                </li>
              </ol>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-100 bg-slate-50/50 py-14 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-semibold tracking-tight text-slate-900">
              このアプリでできること
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-slate-600">
              ご利用中のプログラムに応じて、利用できる機能は異なります。
            </p>
            <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {capabilities.map((item) => (
                <li key={item.title} className="app-surface-raised rounded-2xl p-5">
                  <h3 className="font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-slate-100 bg-white py-10 sm:py-12">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <p className="text-sm font-semibold text-slate-900">情報セキュリティへの取り組み</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              当社のセキュリティ自己宣言・自己評価の詳細は、専用ページでご確認いただけます。
            </p>
            <p className="mt-4">
              <Link
                href="/legal/security"
                className="text-sm font-semibold text-indigo-800 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-950"
              >
                セキュリティページを見る
              </Link>
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 text-center text-xs text-slate-500 sm:flex-row sm:items-center sm:text-left sm:px-6">
          <span className="font-medium text-slate-700">{APP_DISPLAY_NAME}</span>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/legal/security" className="text-slate-600 no-underline hover:text-slate-900">
              セキュリティ
            </Link>
            <Link href="/legal/privacy" className="text-slate-600 no-underline hover:text-slate-900">
              プライバシーポリシー
            </Link>
            <Link href="/login" className="text-slate-600 no-underline hover:text-slate-900">
              ログイン
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
