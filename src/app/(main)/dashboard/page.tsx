import Link from "next/link";
import { requireUser } from "@/lib/require-user";
import { APP_DISPLAY_NAME } from "@/lib/brand";
import { listMatchesForRole } from "@/lib/repositories/match-repository";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";
import { PartnerInvoiceAlert } from "@/components/partner-invoice-alert";
import { NextActionsSection } from "@/components/next-actions-section";
import { AwaitingAssignment } from "@/components/awaiting-assignment";
import { OnboardingModal } from "@/components/onboarding-modal";
import { AdminStaleUsersPanel } from "@/components/admin-stale-users-panel";
import { DashboardCompanyFilter } from "./company-filter";

function withHonorificSan(name: string) {
  return `${name}さん`;
}

type DashboardSearchParams = { [key: string]: string | string[] | undefined };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<DashboardSearchParams>;
}) {
  const me = await requireUser();
  const sp = (await searchParams) ?? {};
  const rawCompany = sp.company;
  const companyFilter = typeof rawCompany === "string" ? rawCompany.trim() : "";

  const [allMatches, settings] = await Promise.all([
    listMatchesForRole({ role: me.role, userId: me.id }),
    getAppSettingsRow(),
  ]);

  // 管理者・管理者アシスタントだけが企業フィルタを使える。それ以外は全件のままで挙動を変えない。
  const isAdmin = me.role === "ADMIN" || me.role === "ADMIN_ASSISTANT";
  type MatchClient = { companyId?: string | null; companyName?: string | null };
  const matches = !isAdmin || !companyFilter
    ? allMatches
    : allMatches.filter((m) => {
        const cid = (((m as { client: MatchClient }).client.companyId) ?? "").trim();
        if (companyFilter === "__none__") return !cid;
        return cid === companyFilter;
      });

  // 企業ID未割当のクライアント数（管理者用警告）
  const adminUnassignedPairs = isAdmin
    ? allMatches.filter(
        (m) => !(((m as { client: MatchClient }).client.companyId) ?? "").trim(),
      )
    : [];
  const adminUnassignedClientIds = new Set(
    adminUnassignedPairs.map(
      (m) => String((m as { client: { id?: string } }).client.id ?? ""),
    ),
  );
  const adminUnassignedClientCount = adminUnassignedClientIds.size;
  const adminUnassignedPairCount = adminUnassignedPairs.length;

  return (
    <div className="space-y-6 sm:space-y-10">
      <header className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-6 md:p-8">
        <p className="text-xs font-semibold tracking-widest text-indigo-700 uppercase">Overview</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {me.displayName} さん
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
          {APP_DISPLAY_NAME} では、担当ペアごとにチャットと日程調整をまとめて行えます。外部にメールアドレスを出さずにやり取りできます。
        </p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
          ロール: {me.role === "ADMIN"
            ? "管理者"
            : me.role === "ADMIN_ASSISTANT"
              ? "管理者アシスタント"
              : me.role === "PARTNER"
                ? "パートナー"
                : me.role === "CLIENT_ADMIN"
                  ? "クライアント管理者"
                  : me.role === "CLIENT_HR"
                    ? "クライアント人事"
                    : "クライアント"}
        </div>
      </header>

      {me.role === "PARTNER" ? <PartnerInvoiceAlert /> : null}

      {/*
        初回オンボーディングモーダル（クライアント/パートナー系のみ）。
        - `onboardedAt` がセットされていない && 管理者でない 場合に表示する。
        - マッチがまだ無いときは「アサイン待ち」前提の文言に切り替える。
        モーダル自体はクライアント側でしか表示しないが、出すかどうかの判定は
        サーバー側で済ませて props として渡す（チラつき防止）。
      */}
      {!isAdmin ? (
        <OnboardingModal
          userId={me.id}
          shouldShow={!((me as { onboardedAt?: string | null }).onboardedAt ?? null)}
          role={me.role as "CLIENT" | "CLIENT_ADMIN" | "CLIENT_HR" | "PARTNER"}
          hasMatches={allMatches.length > 0}
        />
      ) : null}

      {/*
        まだ管理者にマッチングされていないクライアント/パートナー向けの
        「アサイン待ち」プレースホルダ。
        - 自分の役割がメンバー側 (CLIENT / CLIENT_ADMIN / CLIENT_HR / PARTNER) で
          かつ allMatches が空の時だけ出す。
        - 出すと下の「担当ペア」セクションは冗長になるので、その下のセクションも
          条件付きで隠す（後段で `allMatches.length === 0` を見て分岐）。
      */}
      {!isAdmin && allMatches.length === 0 ? (
        <AwaitingAssignment
          role={me.role as "CLIENT" | "CLIENT_ADMIN" | "CLIENT_HR" | "PARTNER"}
        />
      ) : null}

      {/*
        「あなたが次にやること」リスト。
        - 管理者には何も表示しない（API が空配列を返す）
        - マッチ未割当のときは API 側で抑制される
      */}
      {!isAdmin && allMatches.length > 0 ? <NextActionsSection /> : null}

      {/*
        管理者ホーム下部に「最近アクセスのないユーザー」を出す。
        - `lastSeenAt` (requireUser から書き込み) が 14 日以上前 もしくは無い ユーザーが対象。
        - 0 件のときは描画しない（API 側で 0 件を返したらコンポーネント側で抑制）。
      */}
      {isAdmin ? <AdminStaleUsersPanel /> : null}

      {isAdmin && adminUnassignedPairCount > 0 ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h2 className="text-base font-semibold text-amber-900">
                企業ID未割当のクライアントがいます
              </h2>
              <p className="text-sm text-amber-900/90">
                クライアント <strong>{adminUnassignedClientCount} 名</strong>（ペア{" "}
                <strong>{adminUnassignedPairCount} 件</strong>）に「所属企業」が設定されていません。
                同企業の閲覧スコープ・企業ごとの設定が効かない状態です。マッチ管理から所属企業を割り当ててください。
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <Link
                href="/admin/matches?company=__none__"
                className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold !text-white no-underline shadow-sm hover:bg-amber-800"
              >
                未割当のペアを開く →
              </Link>
              <Link
                href="/admin/companies"
                className="text-center text-sm text-amber-900 no-underline underline-offset-2 hover:underline"
              >
                企業ページを開く
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {/*
        以下「自分FTA への導線 + 担当ペア一覧」は、
        - 管理者は常に表示（マッチ管理画面の代わりに使う）
        - メンバー側は「マッチが 1 件でもある」場合のみ表示
        とする。マッチ未割当のメンバーには上の「アサイン待ち」表示だけにして、
        押せない情報を並べないようにする。
      */}
      {(!isAdmin && allMatches.length === 0) ? null : (
      <section className="space-y-5">
        {(me.role === "CLIENT" || me.role === "PARTNER" || me.role === "CLIENT_ADMIN" || me.role === "CLIENT_HR") ? (
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-4">
            <h2 className="text-xl font-semibold text-indigo-900">自分FTA</h2>
            <p className="mt-1 text-base text-indigo-800">
              ホーム右上メニューの「自分FTA」から編集できます。ありたい姿(A)と要素(B)・アクション(C)を整理してください。
            </p>
            <Link
              href="/fta"
              className="mt-3 inline-flex rounded-lg bg-indigo-700 px-4 py-2 text-base font-semibold !text-white no-underline hover:bg-indigo-800"
            >
              自分FTAを開く
            </Link>
          </div>
        ) : null}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">担当ペア</h2>
            <p className="mt-1 text-base text-slate-600">
              各ペアのルームでメッセージと日程を管理します。
              {isAdmin ? (
                <span className="ml-1 text-sm text-slate-500">
                  企業フィルタで表示を絞り込めます。
                </span>
              ) : null}
            </p>
          </div>
          {isAdmin ? (
            <DashboardCompanyFilter
              companies={settings.companies}
              activeCompanyId={companyFilter}
            />
          ) : null}
        </div>

        <ul className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
          {matches.length === 0 ? (
            <li className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center text-base text-slate-600">
              {isAdmin && companyFilter
                ? "この絞り込み条件に該当するペアはありません。"
                : "まだ担当ペアがありません。管理者の方は「マッチ管理」から登録してください。"}
            </li>
          ) : (
            matches.map((match) => (
              <li
                key={match.id}
                className="group flex flex-col justify-between gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
              >
                <div>
                  <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Pair</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {withHonorificSan(match.client.displayName)}
                    <span className="mx-2 font-normal text-slate-400">↔</span>
                    {withHonorificSan(match.partner.displayName)}
                  </p>
                  {(match.client as { companyName?: string | null }).companyName ? (
                    <p className="mt-1.5 text-sm text-slate-600">
                      クライアント企業: {(match.client as { companyName?: string | null }).companyName}
                    </p>
                  ) : null}
                </div>
                <div
                  className={`flex flex-wrap items-center gap-3 ${isAdmin ? "justify-between" : "justify-end"}`}
                >
                  {isAdmin ? (
                    <span className="font-mono text-xs text-slate-400">ID {match.id}</span>
                  ) : null}
                  <Link
                    href={`/match/${match.id}`}
                    className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-base font-semibold !text-white no-underline shadow-sm transition hover:bg-indigo-700"
                  >
                    ルームを開く
                  </Link>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
      )}
    </div>
  );
}
