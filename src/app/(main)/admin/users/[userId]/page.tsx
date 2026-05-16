import { requireRole } from "@/lib/require-user";
import { getUserById, isDeletedUser } from "@/lib/repositories/user-repository";
import { listMatchesForRole } from "@/lib/repositories/match-repository";
import { getStoredClientPartnerBriefingForUser } from "@/lib/repositories/client-partner-briefing-repository";
import { getFtaByUserId } from "@/lib/repositories/fta-repository";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";
import { FtaViewer } from "@/components/fta-chart";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * 管理者専用：あるユーザーの「現在の状態」を把握するためのインスペクション画面。
 * 「クライアントが自分FTAを編集したのに反映されない／チャットが反映されない」等の
 * 問い合わせを受けた時に、当該ユーザーが実際に見ているもの・触っているデータを
 * 管理者側から確認するために用意する。
 *
 * - 直接「相手としてログイン」する機能（impersonation）は提供しない。
 *   なりすましは監査・セキュリティの観点で重く、現状は readonly ビューで充分。
 * - FTA は管理者がそのまま閲覧可能（/api/fta/users/[userId] 等と同じ権限）。
 * - 参加マッチ一覧から /match/[id] へジャンプすればチャット履歴等は管理者として確認できる。
 */
type RouteContext = { params: Promise<{ userId: string }> };

const CLIENT_ROLES = ["CLIENT", "CLIENT_ADMIN", "CLIENT_HR"] as const;

export default async function AdminUserDetailPage(ctx: RouteContext) {
  const viewer = await requireRole(["ADMIN", "ADMIN_ASSISTANT"]);
  const { userId } = await ctx.params;
  const user = await getUserById(userId);
  if (!user) return notFound();

  const isInspectClientRole = (CLIENT_ROLES as readonly string[]).includes(user.role);

  const [fta, matches, settings, briefing] = await Promise.all([
    getFtaByUserId(userId),
    listMatchesForRole({ role: user.role, userId: user.id }),
    getAppSettingsRow(),
    viewer.role === "ADMIN" && isInspectClientRole
      ? getStoredClientPartnerBriefingForUser(userId)
      : Promise.resolve<{ age: number | null; jobTitle: string | null } | null>(null),
  ]);

  const roleLabel: Record<string, string> = {
    ADMIN: "管理者",
    ADMIN_ASSISTANT: "管理者アシスタント",
    PARTNER: "パートナー",
    CLIENT: "クライアント",
    CLIENT_ADMIN: "クライアント管理者",
    CLIENT_HR: "クライアント人事",
  };

  const companyId = (user as { companyId?: string | null }).companyId ?? null;
  const companyName = companyId
    ? settings.companies.find((c) => c.id === companyId)?.name ?? null
    : null;

  const deleted = isDeletedUser(user);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:gap-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">
          Administrator / User Inspection
        </p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            {user.displayName}
          </h1>
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-900">
            {roleLabel[user.role] ?? user.role}
          </span>
          {deleted ? (
            <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-900">
              削除済み
            </span>
          ) : null}
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-slate-700 sm:grid-cols-2">
          <div className="flex flex-wrap gap-2">
            <dt className="text-slate-500">メール:</dt>
            <dd className="break-all">{user.email || "（未登録）"}</dd>
          </div>
          <div className="flex flex-wrap gap-2">
            <dt className="text-slate-500">ユーザーID:</dt>
            <dd className="font-mono text-xs break-all text-slate-600">{user.id}</dd>
          </div>
          <div className="flex flex-wrap gap-2">
            <dt className="text-slate-500">所属企業:</dt>
            <dd>
              {companyId
                ? `${companyName ?? "（未登録ID）"}（${companyId}）`
                : "未所属"}
            </dd>
          </div>
        </dl>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-600">
          このページは管理者が「該当ユーザーの状況」を確認するための読み取り専用ビューです。
          画面下の自分FTA・参加マッチを通じて、ユーザー本人が見ているはずのデータを確認できます。
          チャット履歴の確認は、参加マッチを開いてください（管理者として参加・閲覧可能）。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/admin/matches"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 no-underline hover:bg-slate-50"
          >
            ← マッチ管理に戻る
          </Link>
          {companyId ? (
            <Link
              href={`/admin/companies/${encodeURIComponent(companyId)}`}
              className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-900 no-underline hover:bg-indigo-100"
            >
              所属企業ページへ
            </Link>
          ) : null}
        </div>
      </header>

      {viewer.role === "ADMIN" && isInspectClientRole && briefing ? (
        <section className="rounded-2xl border border-slate-300 bg-slate-50 p-5 shadow-sm sm:p-8">
          <h2 className="text-lg font-semibold text-slate-900">パートナー共有用クライアント属性（機密）</h2>
          <p className="mt-2 text-sm text-slate-700">
            このユーザーへの年齢・役職の登録状態です。<strong className="text-slate-900">運用 ADMIN のみ</strong>
            が閲覧・編集できます。編集は企業単位画面から行ってください。
          </p>
          <dl className="mt-4 grid gap-2 text-sm text-slate-800 sm:grid-cols-2">
            <div className="flex flex-wrap gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
              <dt className="text-slate-500">年齢</dt>
              <dd className="tabular-nums font-medium">
                {briefing.age !== null ? `${briefing.age} 歳` : "未入力"}
              </dd>
            </div>
            <div className="flex flex-wrap gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
              <dt className="text-slate-500">役職</dt>
              <dd className="font-medium">{briefing.jobTitle?.trim() ? briefing.jobTitle : "未入力"}</dd>
            </div>
          </dl>
          {companyId ? (
            <p className="mt-4 text-sm text-slate-600">
              <Link
                href={`/admin/companies/${encodeURIComponent(companyId)}/settings#client-partner-briefings`}
                className="font-semibold text-indigo-800 underline-offset-4 hover:underline"
              >
                所属企業の「パートナー共有用クライアント属性」を編集
              </Link>
            </p>
          ) : (
            <p className="mt-4 text-sm text-amber-900">
              所属企業IDが未設定のため一覧には出ません。先にユーザーに所属企業を設定してください。
            </p>
          )}
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold text-slate-900">参加マッチ一覧</h2>
        <p className="mt-1 text-sm text-slate-600">
          このユーザーが含まれているマッチを古い順から表示します。各行をクリックすると管理者として
          マッチワークスペースを開き、チャット・日程・レポート等を確認できます。
        </p>
        {matches.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            このユーザーが参加しているマッチはありません。
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {matches.map((m) => (
              <li
                key={m.id}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                <Link
                  href={`/match/${encodeURIComponent(m.id)}`}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 no-underline"
                >
                  <span className="font-semibold text-indigo-900 hover:underline">
                    マッチを開く →
                  </span>
                  <span className="text-slate-800">
                    クライアント: {m.client.displayName}
                  </span>
                  <span className="text-slate-500">×</span>
                  <span className="text-slate-800">
                    パートナー: {m.partner.displayName}
                  </span>
                  <span className="ml-auto font-mono text-xs text-slate-500">
                    {m.id}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold text-slate-900">自分FTA</h2>
        <p className="mt-1 text-sm text-slate-600">
          このユーザーが入力した最新の自分FTAを管理者として表示します。
          反映されないという問い合わせがあった場合は、ここで実データの有無・最終更新を確認してください。
        </p>
        <div className="mt-4 overflow-x-auto">
          <FtaViewer chart={fta} />
        </div>
      </section>
    </div>
  );
}
