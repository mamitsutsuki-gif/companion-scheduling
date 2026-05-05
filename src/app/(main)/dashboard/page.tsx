import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { APP_DISPLAY_NAME } from "@/lib/brand";

function withHonorificSan(name: string) {
  return `${name}さん`;
}

export default async function DashboardPage() {
  const me = await requireUser();

  const where =
    me.role === "ADMIN"
      ? {}
      : me.role === "PARTNER"
        ? { partnerId: me.id }
        : { clientId: me.id };

  const matches = await prisma.match.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      partner: { select: { displayName: true } },
      client: { select: { displayName: true } },
    },
  });

  return (
    <div className="space-y-10">
      <header className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold tracking-widest text-indigo-700 uppercase">Overview</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {me.displayName} さん
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
          {APP_DISPLAY_NAME} では、担当ペアごとにチャットと日程調整をまとめて行えます。外部にメールアドレスを出さずにやり取りできます。
        </p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
          ロール: {me.role === "ADMIN" ? "管理者" : me.role === "PARTNER" ? "パートナー" : "クライアント"}
        </div>
      </header>

      <section className="space-y-5">
        {(me.role === "CLIENT" || me.role === "PARTNER") ? (
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-4">
            <h2 className="text-lg font-semibold text-indigo-900">自分FTA</h2>
            <p className="mt-1 text-sm text-indigo-800">
              ホーム右上メニューの「自分FTA」から編集できます。ありたい姿(A)と要素(B)・アクション(C)を整理してください。
            </p>
            <Link
              href="/fta"
              className="mt-3 inline-flex rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white no-underline"
            >
              自分FTAを開く
            </Link>
          </div>
        ) : null}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">担当ペア</h2>
            <p className="mt-1 text-sm text-slate-600">各ペアのルームでメッセージと日程を管理します。</p>
          </div>
        </div>

        <ul className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
          {matches.length === 0 ? (
            <li className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center text-sm text-slate-600">
              まだ担当ペアがありません。管理者の方は「マッチ管理」から登録してください。
            </li>
          ) : (
            matches.map((match) => (
              <li
                key={match.id}
                className="group flex flex-col justify-between gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
              >
                <div>
                  <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Pair</p>
                  <p className="mt-2 text-base font-semibold text-slate-900">
                    {withHonorificSan(match.partner.displayName)}
                    <span className="mx-2 font-normal text-slate-400">↔</span>
                    {withHonorificSan(match.client.displayName)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-mono text-[11px] text-slate-400">ID {match.id}</span>
                  <Link
                    href={`/match/${match.id}`}
                    className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white no-underline shadow-sm transition hover:bg-indigo-700"
                  >
                    ルームを開く
                  </Link>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
