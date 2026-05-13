/**
 * クライアント／パートナーが、まだ管理者にマッチングされていない時に出す
 * 「あなた専属の対話パートナーのアサインをお待ちください」プレースホルダ。
 *
 * - マッチが 1 件も無い場合のみ表示する
 * - 管理者・管理者アシスタントには表示しない
 * - クライアント側とパートナー側で文言だけ少し変える
 */
type Role = "CLIENT" | "CLIENT_ADMIN" | "CLIENT_HR" | "PARTNER";

export function AwaitingAssignment({ role }: { role: Role }) {
  const isClient = role === "CLIENT" || role === "CLIENT_ADMIN" || role === "CLIENT_HR";
  const headline = isClient
    ? "あなた専属の対話パートナーのアサインをお待ちください"
    : "担当クライアントのアサインをお待ちください";
  const body = isClient
    ? "管理者があなたに担当パートナーを割り当てると、ここに「担当ペア」が表示され、チャット・日程調整・1on1セッションが始められるようになります。"
    : "管理者があなたに担当クライアントを割り当てると、ここに「担当ペア」が表示され、チャット・日程調整・1on1セッションが始められるようになります。";
  const subline = isClient
    ? "通常は登録から数営業日以内にアサインされます。お待たせしている場合は管理者までご連絡ください。"
    : "通常は登録から数営業日以内にアサインされます。お待たせしている場合は管理者までご連絡ください。";

  return (
    <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 px-5 py-8 text-center shadow-sm sm:px-8 sm:py-12">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4">
        <div className="rounded-full bg-white px-4 py-1 text-xs font-semibold tracking-wider text-indigo-800 uppercase shadow-xs">
          Pending Assignment
        </div>
        <h2 className="text-xl font-semibold text-indigo-950 sm:text-2xl">{headline}</h2>
        <p className="text-base leading-relaxed text-indigo-900/90">{body}</p>
        <p className="text-sm text-indigo-900/80">{subline}</p>
        {isClient ? (
          <p className="mt-2 rounded-lg bg-white px-4 py-3 text-sm text-indigo-900 shadow-xs">
            お時間があれば、ホーム右上メニューから「自分FTA」を先に書いておくと、
            アサイン後すぐに担当パートナーと対話を始められます。
          </p>
        ) : null}
      </div>
    </section>
  );
}
