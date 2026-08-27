"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LIFELINE_SUMMARY_TEXT_MAX,
  type LifelineChart,
  type LifelineEvent,
} from "@/lib/companion-lifeline";
import { SheetSaveButton, SheetStickySaveBar } from "@/components/sheet-save-controls";

function LifelineGraph({ events }: { events: LifelineEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-slate-500">グラフを表示する出来事がありません。</p>;
  }
  const w = 600;
  const h = 200;
  const pad = 24;
  const sorted = [...events].sort((a, b) => a.sortOrder - b.sortOrder);
  const pts = sorted.map((e, i) => {
    const x = pad + (i / Math.max(1, sorted.length - 1)) * (w - pad * 2);
    const y = h / 2 - (e.emotionScore / 5) * (h / 2 - pad);
    return { x, y, e };
  });
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full max-w-2xl rounded-xl border border-slate-200 bg-white" preserveAspectRatio="xMidYMid meet">
      <line x1={pad} y1={h / 2} x2={w - pad} y2={h / 2} stroke="#cbd5e1" />
      <path d={path} fill="none" stroke="#4f46e5" strokeWidth={2} />
      {pts.map((p) => (
        <circle key={p.e.id} cx={p.x} cy={p.y} r={4} fill="#4f46e5" />
      ))}
      <text x={pad} y={14} className="fill-slate-500 text-[10px]">
        感情スコア（-5〜+5）／喜び・挫折の波
      </text>
    </svg>
  );
}

const emptyEvent = (i: number): LifelineEvent => ({
  id: "",
  ageOrPeriod: "",
  title: "",
  detail: "",
  emotionScore: 0,
  emotionReason: "",
  insights: "",
  locked: false,
  sortOrder: i,
});

const SAMPLE = {
  ageOrPeriod: "例：24歳・新卒2年目",
  title: "例：初めての顧客向け提案が通った／大きなミスで信頼を損ねた",
  detail:
    "例：先輩に任され、初めて一人で提案資料を作り、顧客の前で説明した。緊張したが「わかりやすい」と言ってもらえた。",
  emotionReason:
    "例（喜び）：自分の工夫が相手の役に立った実感があったから。／例（挫折）：準備不足で期待に応えられず、チームに迷惑をかけたと感じたから。",
  insights:
    "例：人の役に立つこと・信頼を裏切らないことが自分にとって大切だと気づいた。丁寧な準備がエネルギーの源になる。",
  energySources:
    "例：誰かの成長や成功に関わったとき、正直に話せたとき、新しいことを学んで形にできたとき。",
  coreValues:
    "例：誠実さ、貢献、成長、チームの信頼。迷ったときは「相手と自分の両方を大切にできているか」を基準にしたい。",
} as const;

export function LifelinePanel({ matchId }: { matchId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [events, setEvents] = useState<LifelineEvent[]>([]);
  const [energySourcesText, setEnergySourcesText] = useState("");
  const [coreValuesText, setCoreValuesText] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [viewMode, setViewMode] = useState("self");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/matches/${matchId}/lifeline`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError((json as { error?: string })?.error ?? "読み込みに失敗しました。");
      return;
    }
    const chart = (json as { chart?: LifelineChart }).chart;
    setEvents(chart?.events ?? []);
    setEnergySourcesText(chart?.energySourcesText ?? "");
    setCoreValuesText(chart?.coreValuesText ?? "");
    setCanEdit(Boolean((json as { permissions?: { canEditClient?: boolean } }).permissions?.canEditClient));
    setViewMode(
      (json as { permissions?: { lifelineViewMode?: string } }).permissions?.lifelineViewMode ?? "self",
    );
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateEvent(index: number, patch: Partial<LifelineEvent>) {
    setEvents((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }

  function addEvent() {
    setEvents((prev) => [...prev, emptyEvent(prev.length)]);
  }

  function removeEvent(index: number) {
    setEvents((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/matches/${matchId}/lifeline`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events, energySourcesText, coreValuesText }),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError((json as { error?: string })?.error ?? "保存に失敗しました。");
      return;
    }
    const chart = (json as { chart?: LifelineChart }).chart;
    setEvents(chart?.events ?? events);
    setEnergySourcesText(chart?.energySourcesText ?? energySourcesText);
    setCoreValuesText(chart?.coreValuesText ?? coreValuesText);
    setNotice("保存しました。");
    void load();
  }

  if (loading) return <p className="text-sm text-slate-500">読込中…</p>;

  const isManagerView = viewMode === "manager";
  const sharedInsights = events.filter((e) => !e.locked && e.insights.trim().length > 0);
  const lockedInsightCount = events.filter((e) => e.locked).length;
  const emptyInsightCount = events.filter((e) => !e.locked && !e.insights.trim()).length;

  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">ライフラインチャート</h2>
        <p className="mt-2 text-sm text-slate-600">
          自分の価値観・モチベーションの源泉を理解します。人生の出来事（喜び・挫折）を振り返り、「なぜ頑張りたいのか」を言葉にします。
        </p>
      </div>

      {isManagerView ? (
        <aside className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm leading-relaxed break-words text-amber-950">
          <p className="font-semibold">上司・人事向けの表示について</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>感情の推移（グラフ）は、鍵の有無にかかわらず確認できます。</li>
            <li>
              鍵がかかっていない項目では、「価値観・強みの気づき」と、まとめの価値観も確認できます。
            </li>
            <li>
              鍵がかかっている項目では、気づきは「🔒 非公開」と表示され、本文は見えません。
            </li>
            <li>
              鍵なしで未記入の気づきは「未入力」と表示されます（非公開とは区別されます）。
            </li>
            <li>
              人生の出来事の詳細（時期・タイトル・本文・理由など）は、プライバシーのため上司・人事には表示されません。
            </li>
          </ul>
        </aside>
      ) : canEdit ? (
        <aside className="rounded-2xl border border-indigo-200 bg-indigo-50/60 px-4 py-3 text-sm leading-relaxed break-words text-indigo-950">
          <p className="font-semibold">安心して本音で書くための公開範囲</p>
          <p className="mt-2">
            上司・人事には、あなたの人生のエピソード詳細（時期・タイトル・本文・理由）は見えません。
            対話パートナーには1on1セッションでの対話のために共有されます。飾らずにそのまま書いて大丈夫です。
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>上司への共有（鍵なし）:</strong> グラフ（感情の波）と、価値観の気づき・まとめが上司に見えます。
            </li>
            <li>
              <strong>上司への非公開（鍵あり 🔒）:</strong> 上司には気づきが「🔒 非公開」と見え、本文は見えません（グラフは見えます）。
            </li>
            <li>
              <strong>パートナーへの共有:</strong> エピソード詳細を含めてパートナーに共有され、セッションでの自己探求に活用されます。
            </li>
          </ul>
        </aside>
      ) : (
        <aside className="rounded-2xl border border-indigo-200 bg-indigo-50/60 px-4 py-3 text-sm leading-relaxed break-words text-indigo-950">
          <p className="font-semibold">パートナー・管理者向けの表示</p>
          <p className="mt-1">
            受講者本人が記入した人生の出来事、感情スコア、エピソード詳細、理由、価値観の気づきをすべて確認できます。
            1on1セッションでの対話や自己探求の支援にご活用ください。
          </p>
        </aside>
      )}

      {!isManagerView ? (
      <aside className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 sm:p-5 text-sm leading-relaxed text-slate-700">
        <h3 className="text-base font-semibold text-slate-900">価値観とは</h3>
        <p className="mt-3">
          価値観とは、
          <strong className="font-semibold text-slate-900">
            「何を大切だと感じ、何を良い・望ましいと判断するかという、その人の考え方や基準」
          </strong>
          のことです。
        </p>
        <p className="mt-2">
          例えば、同じ出来事でも、人によって感じ方や選択が違うのは価値観が異なるからです。
        </p>
        <p className="mt-2">価値観は、生まれつき決まっているものではなく、</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>育った環境</li>
          <li>家族や友人との関わり</li>
          <li>学校や仕事での経験</li>
          <li>成功や失敗の体験</li>
        </ul>
        <p className="mt-2">などを通じて形づくられ、時間とともに変化することもあります。</p>
        <h4 className="mt-4 font-semibold text-slate-900">価値観を知るメリット</h4>
        <p className="mt-2">自分の価値観を理解すると、</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>自分に合った仕事や生き方を選びやすくなる。</li>
          <li>大切なものが明確になり、迷ったときの判断基準になる。</li>
          <li>他人との価値観の違いを理解しやすくなる。</li>
        </ul>
        <p className="mt-3">
          つまり、
          <strong className="font-semibold text-slate-900">
            価値観とは「自分の人生で何を大切にして生きていきたいかを決める心のものさし」
          </strong>
          と言えます。
        </p>
      </aside>
      ) : null}

      {!isManagerView ? (
      <aside className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/50 p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-indigo-950">入力の見本（参考）</h3>
        <p className="mt-1 text-xs text-indigo-900/80">
          下の欄は空のまま、見本を参考に自分の言葉で書いてください。エピソード詳細は上司に見えません。
        </p>
        <dl className="mt-3 space-y-2 text-sm text-indigo-950/90">
          <div>
            <dt className="font-medium">年齢・時期 / タイトル</dt>
            <dd className="text-indigo-900/80">
              {SAMPLE.ageOrPeriod} — {SAMPLE.title}
            </dd>
          </div>
          <div>
            <dt className="font-medium">詳細（人生の出来事）</dt>
            <dd className="text-indigo-900/80">{SAMPLE.detail}</dd>
          </div>
          <div>
            <dt className="font-medium">喜び・挫折の理由</dt>
            <dd className="text-indigo-900/80">{SAMPLE.emotionReason}</dd>
          </div>
          <div>
            <dt className="font-medium">価値観・強みの気づき</dt>
            <dd className="text-indigo-900/80">{SAMPLE.insights}</dd>
          </div>
        </dl>
      </aside>
      ) : null}

      <div className="min-w-0 max-w-full">
        <LifelineGraph events={events} />
      </div>

      {canEdit ? (
        <div className="space-y-6">
          <SheetStickySaveBar saving={saving} onClick={() => void save()} />
          <div>
            <h3 className="text-lg font-semibold text-slate-900">人生の出来事（喜び・挫折）</h3>
            <p className="mt-1 text-sm text-slate-600">
              感情が大きく動いた出来事を時系列で記録します。スコアは +5（強い喜び）〜 -5（強い挫折）です。
            </p>
          </div>
          {events.map((e, i) => (
            <article key={e.id || i} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex justify-between gap-2">
                <h4 className="font-semibold text-slate-900">出来事 {i + 1}</h4>
                <button type="button" onClick={() => removeEvent(i)} className="text-sm text-red-700">
                  削除
                </button>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="text-sm">
                  年齢・時期
                  <input
                    value={e.ageOrPeriod}
                    onChange={(ev) => updateEvent(i, { ageOrPeriod: ev.target.value })}
                    placeholder={SAMPLE.ageOrPeriod}
                    className="mt-1 w-full rounded-lg border px-3 py-2 placeholder:text-slate-400"
                  />
                </label>
                <label className="text-sm">
                  感情スコア（-5〜+5）／喜び・挫折
                  <input
                    type="number"
                    min={-5}
                    max={5}
                    value={e.emotionScore}
                    onChange={(ev) => updateEvent(i, { emotionScore: Number(ev.target.value) })}
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                  />
                </label>
              </div>
              <label className="block text-sm">
                タイトル
                <input
                  value={e.title}
                  onChange={(ev) => updateEvent(i, { title: ev.target.value })}
                  placeholder={SAMPLE.title}
                  className="mt-1 w-full rounded-lg border px-3 py-2 placeholder:text-slate-400"
                />
              </label>
              <label className="block text-sm">
                詳細（人生の出来事）
                <textarea
                  rows={2}
                  value={e.detail}
                  onChange={(ev) => updateEvent(i, { detail: ev.target.value })}
                  placeholder={SAMPLE.detail}
                  className="mt-1 w-full rounded-lg border px-3 py-2 placeholder:text-slate-400"
                />
              </label>
              <label className="block text-sm">
                なぜ気持ちが上がった／下がったか（喜び・挫折の理由）
                <textarea
                  rows={2}
                  value={e.emotionReason}
                  onChange={(ev) => updateEvent(i, { emotionReason: ev.target.value })}
                  placeholder={SAMPLE.emotionReason}
                  className="mt-1 w-full rounded-lg border px-3 py-2 placeholder:text-slate-400"
                />
              </label>
              <label className="block text-sm">
                この出来事から見える価値観・強み・課題
                <textarea
                  rows={2}
                  value={e.insights}
                  onChange={(ev) => updateEvent(i, { insights: ev.target.value })}
                  placeholder={SAMPLE.insights}
                  className="mt-1 w-full rounded-lg border px-3 py-2 placeholder:text-slate-400"
                />
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={e.locked}
                  onChange={(ev) => updateEvent(i, { locked: ev.target.checked })}
                />
                <span>
                  鍵付き（上司にはグラフのみ。この項目の価値観・気づきは非公開）
                  <span className="mt-0.5 block text-xs text-slate-500">
                    エピソード詳細は鍵の有無にかかわらず上司には表示されません。
                  </span>
                </span>
              </label>
            </article>
          ))}

          {events.length > 0 ? (
            <SheetSaveButton saving={saving} onClick={() => void save()} />
          ) : null}

          {events.length === 0 ? (
            <div className="rounded-xl border border-dashed border-indigo-300 bg-indigo-50/40 px-4 py-8 text-center">
              <p className="text-sm text-indigo-950">まだ出来事がありません。まずは1件追加してみましょう。</p>
              <button
                type="button"
                onClick={addEvent}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-800"
              >
                <span aria-hidden className="text-lg leading-none">
                  ＋
                </span>
                人生の出来事を追加する
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={addEvent}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/60 px-4 py-3.5 text-sm font-semibold text-indigo-900 hover:border-indigo-400 hover:bg-indigo-50"
            >
              <span aria-hidden className="text-lg leading-none">
                ＋
              </span>
              人生の出来事をもう1件追加する
            </button>
          )}

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 sm:p-5 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-emerald-950">まとめ：なぜ頑張りたいのか</h3>
              <p className="mt-1 text-sm text-emerald-900/90">
                出来事を振り返ったうえで、エネルギーの源泉と大切にしている価値観を言語化します。上司にも共有されます。
              </p>
            </div>
            <label className="block text-sm">
              <span className="font-semibold text-emerald-950">エネルギーの源泉</span>
              <textarea
                rows={3}
                value={energySourcesText}
                onChange={(ev) =>
                  setEnergySourcesText(ev.target.value.slice(0, LIFELINE_SUMMARY_TEXT_MAX))
                }
                maxLength={LIFELINE_SUMMARY_TEXT_MAX}
                placeholder={SAMPLE.energySources}
                className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 placeholder:text-slate-400"
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold text-emerald-950">大切にしている価値観</span>
              <textarea
                rows={3}
                value={coreValuesText}
                onChange={(ev) =>
                  setCoreValuesText(ev.target.value.slice(0, LIFELINE_SUMMARY_TEXT_MAX))
                }
                maxLength={LIFELINE_SUMMARY_TEXT_MAX}
                placeholder={SAMPLE.coreValues}
                className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 placeholder:text-slate-400"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <SheetSaveButton saving={saving} onClick={() => void save()} />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {isManagerView ? (
            <>
              <p className="text-sm text-slate-600">
                出来事は {events.length} 件あります（詳細は非公開）。価値観の気づき: 共有{" "}
                {sharedInsights.length} / 🔒 非公開 {lockedInsightCount} / 未入力 {emptyInsightCount}
              </p>
              {events.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="text-base font-semibold text-slate-900">価値観・気づきの一覧</h3>
                  <ul className="space-y-3">
                    {events.map((e, i) => {
                      const status = e.locked
                        ? "locked"
                        : e.insights.trim()
                          ? "shared"
                          : "empty";
                      return (
                        <li
                          key={e.id || i}
                          className={`rounded-xl border p-4 ${
                            status === "locked"
                              ? "border-amber-200 bg-amber-50/50"
                              : status === "shared"
                                ? "border-indigo-100 bg-indigo-50/40"
                                : "border-dashed border-slate-200 bg-slate-50"
                          }`}
                        >
                          <p className="text-xs font-semibold text-slate-600">気づき {i + 1}</p>
                          {status === "locked" ? (
                            <p className="mt-1 text-sm font-medium text-amber-900">🔒 非公開</p>
                          ) : status === "shared" ? (
                            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                              {e.insights}
                            </p>
                          ) : (
                            <p className="mt-1 text-sm text-slate-500">未入力</p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  まだ出来事が登録されていません。
                </p>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-slate-900">人生の出来事一覧（{events.length} 件）</h3>
              {events.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  まだ出来事が登録されていません。
                </p>
              ) : (
                <ul className="space-y-4">
                  {events.map((e, idx) => (
                    <li key={e.id || idx} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 shadow-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600 text-xs font-bold text-white">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-slate-900 text-base">{e.title || "（無題）"}</span>
                          {e.ageOrPeriod ? (
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 font-medium">
                              {e.ageOrPeriod}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-black ${
                              e.emotionScore > 0
                                ? "bg-emerald-100 text-emerald-800"
                                : e.emotionScore < 0
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            感情スコア: {e.emotionScore > 0 ? `+${e.emotionScore}` : e.emotionScore}
                          </span>
                          {e.locked ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                              🔒 上司非公開
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {e.detail ? (
                        <div>
                          <p className="text-xs font-semibold text-slate-500">出来事の詳細</p>
                          <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">{e.detail}</p>
                        </div>
                      ) : null}
                      {e.emotionReason ? (
                        <div>
                          <p className="text-xs font-semibold text-slate-500">なぜ気持ちが上がった／下がったか</p>
                          <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">{e.emotionReason}</p>
                        </div>
                      ) : null}
                      {e.insights ? (
                        <div className="rounded-lg bg-indigo-50/50 p-3 border border-indigo-100">
                          <p className="text-xs font-bold text-indigo-950">価値観・強みの気づき</p>
                          <p className="mt-0.5 whitespace-pre-wrap text-sm text-indigo-950">{e.insights}</p>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {(energySourcesText || coreValuesText) && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 space-y-2 text-sm">
              {energySourcesText ? (
                <p>
                  <span className="font-semibold text-emerald-950">エネルギーの源泉: </span>
                  {energySourcesText}
                </p>
              ) : null}
              {coreValuesText ? (
                <p>
                  <span className="font-semibold text-emerald-950">大切にしている価値観: </span>
                  {coreValuesText}
                </p>
              ) : null}
            </div>
          )}
        </div>
      )}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-800">{notice}</p> : null}
    </section>
  );
}
