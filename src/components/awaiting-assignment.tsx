/**
 * 管理者によるマッチング前に、ホームへ出すプレースホルダ。
 */

type Role = "CLIENT" | "CLIENT_ADMIN" | "CLIENT_HR" | "PARTNER";

export function AwaitingAssignment({ role }: { role: Role }) {
  const isClient = role === "CLIENT" || role === "CLIENT_ADMIN" || role === "CLIENT_HR";
  const headline = "登録ありがとうございます";

  return (
    <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 px-5 py-8 text-center shadow-sm sm:px-8 sm:py-12">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-5">
        <div className="rounded-full bg-white px-4 py-1 text-xs font-semibold tracking-wider text-indigo-800 uppercase shadow-xs">
          Before assignment
        </div>
        <h2 className="text-xl font-semibold leading-snug text-indigo-950 sm:text-2xl">{headline}</h2>
        <div className="w-full rounded-xl bg-white px-5 py-4 text-left text-base leading-relaxed text-indigo-950 shadow-xs sm:px-6">
          <p className="font-semibold">{isClient ? "クライアントの皆さんへ" : "パートナーの皆さんへ"}</p>
          <ul className="mt-3 list-inside list-decimal space-y-2 text-[0.975rem] sm:text-base">
            {isClient ? (
              <li>専属の対話パートナーが決まるまでお待ちください。決まり次第、アプリおよびメールでお知らせします。</li>
            ) : (
              <>
                <li>自分FTA に入力してみましょう（クライアントや他の方に公開されることはありません）。</li>
                <li>アサインが決まるまでお待ちください。決まり次第、アプリおよびメールでお知らせします。</li>
              </>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}
