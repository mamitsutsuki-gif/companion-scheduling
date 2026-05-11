"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { companyLabelFromRegistry } from "@/lib/company-display";
import type { CompanyOption } from "@/lib/repositories/app-settings-repository";

type ClientUser = { id: string; displayName: string; role: string; companyId?: string | null };

type PerQuestionResult = {
  format: "per-question";
  itemsCount: number;
  perQuestion: {
    insight: string[];
    feeling: string[];
    nextActions: string[];
    satisfactionReason: string[];
    other: string[];
  };
  satisfaction: { values: number[]; average: number | null };
};

type PerPersonResult = {
  format: "per-person";
  itemsCount: number;
  perPerson: Array<{
    clientId: string;
    displayName: string;
    sessions: Array<{
      sessionNumber: number;
      sessionDateIso: string | null;
      satisfactionScore: number | null;
      answers: {
        insight: string;
        feeling: string;
        nextActions: string;
        satisfactionReason: string;
        other: string;
      };
    }>;
  }>;
};

type ReportResult = PerQuestionResult | PerPersonResult;

const QUESTION_LABELS: Record<string, string> = {
  insight: "1. 今回の1on1でどのような気づきがありましたか？",
  feeling: "2. 1on1が終わってどのような気持ちになりましたか？",
  nextActions: "3. 次回の1on1までに、取り組みたいことはありますか？",
  satisfactionReason: "5. （満足度の理由）",
  other: "7. その他、ご自由にご記載ください",
};

function formatJaDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type AnswerKey = "insight" | "feeling" | "nextActions" | "satisfactionReason" | "other";
const ANSWER_KEYS: readonly AnswerKey[] = [
  "insight",
  "feeling",
  "nextActions",
  "satisfactionReason",
  "other",
] as const;

/** per-person 用キー: clientId|sessionNumber|question */
function ppKey(clientId: string, sessionNumber: number, q: AnswerKey) {
  return `${clientId}|${sessionNumber}|${q}`;
}

export default function AdminReportsPage() {
  const [clients, setClients] = useState<ClientUser[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [filterCompanyId, setFilterCompanyId] = useState<string>("");
  const [totalSessions, setTotalSessions] = useState<number>(8);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [selectedSessions, setSelectedSessions] = useState<number[]>([]);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [anonymous, setAnonymous] = useState<boolean>(false);
  const [format, setFormat] = useState<"per-person" | "per-question">("per-person");
  const [result, setResult] = useState<ReportResult | null>(null);
  const [editableIntro, setEditableIntro] = useState<string>(
    "本レポートは、対象期間のクライアント・アンケート結果を集計したものです。",
  );
  const [editableConclusion, setEditableConclusion] = useState<string>("");
  /** クライアント回答の編集オーバーライド（per-person） */
  const [editedAnswersPp, setEditedAnswersPp] = useState<Record<string, string>>({});
  /** クライアント回答の編集オーバーライド（per-question）。キー: `${question}|${index}` */
  const [editedAnswersPq, setEditedAnswersPq] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 初期データ：クライアント一覧 + 合計セッション数
  useEffect(() => {
    async function load() {
      const [uA, uB, sRes, appRes] = await Promise.all([
        fetch("/api/admin/users?role=CLIENT").then((r) => r.json().catch(() => null)),
        fetch("/api/admin/users?role=CLIENT_ADMIN").then((r) => r.json().catch(() => null)),
        fetch("/api/settings").then((r) => r.json().catch(() => null)),
        fetch("/api/admin/app-settings").then((r) => r.json().catch(() => null)),
      ]);
      const all: ClientUser[] = [
        ...(Array.isArray(uA?.users) ? uA.users : []),
        ...(Array.isArray(uB?.users) ? uB.users : []),
      ];
      setClients(all);
      if (typeof sRes?.totalSessions === "number") {
        setTotalSessions(Math.max(1, Math.min(20, sRes.totalSessions)));
      }
      if (appRes?.settings && Array.isArray(appRes.settings.companies)) {
        const list = (appRes.settings.companies as unknown[])
          .map((v) => {
            if (!v || typeof v !== "object") return null;
            const o = v as Record<string, unknown>;
            const id = typeof o.id === "string" ? o.id : "";
            const name = typeof o.name === "string" ? o.name : "";
            if (!id || !name) return null;
            return { id, name };
          })
          .filter((x): x is CompanyOption => x !== null);
        setCompanies(list);
      }
    }
    void load();
  }, []);

  const sessionOptions = useMemo(
    () => Array.from({ length: totalSessions }, (_, i) => i + 1),
    [totalSessions],
  );

  /**
   * 企業が選択されている場合、対象クライアントの候補は **その企業に所属するメンバーのみ** に絞る。
   * 別企業のクライアントが選択 UI に出ない（=チェックも入らない）ことで、
   * 別企業のデータが集計に混入する経路を UI 上完全に排除する。
   * （API 側でも filterCompanyId による厳密チェックは行っている。）
   */
  const visibleClients = useMemo(() => {
    if (!filterCompanyId.trim()) return clients;
    const want = filterCompanyId.trim();
    return clients.filter((c) => (c.companyId ?? "").trim() === want);
  }, [clients, filterCompanyId]);

  // 企業フィルタを変えたとき、対象外になった選択クライアントを自動で外す。
  useEffect(() => {
    if (!filterCompanyId.trim()) return;
    const visibleIds = new Set(visibleClients.map((c) => c.id));
    setSelectedClientIds((prev) => prev.filter((id) => visibleIds.has(id)));
  }, [filterCompanyId, visibleClients]);

  function toggleClient(id: string) {
    setSelectedClientIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleSession(n: number) {
    setSelectedSessions((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n],
    );
  }

  const onGenerate = useCallback(async () => {
    setError(null);
    setLoading(true);
    setResult(null);
    setEditedAnswersPp({});
    setEditedAnswersPq({});
    const body: Record<string, unknown> = { format, anonymous };
    if (selectedClientIds.length > 0) body.clientIds = selectedClientIds;
    if (filterCompanyId.trim()) body.filterCompanyId = filterCompanyId.trim();
    if (selectedSessions.length > 0) body.sessionNumbers = selectedSessions;
    if (fromDate) body.fromIso = new Date(`${fromDate}T00:00:00`).toISOString();
    if (toDate) body.toIso = new Date(`${toDate}T23:59:59`).toISOString();
    const res = await fetch("/api/admin/reports/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? "レポート作成に失敗しました。");
      return;
    }
    setResult(data as ReportResult);
  }, [format, anonymous, selectedClientIds, selectedSessions, fromDate, toDate, filterCompanyId]);

  function onPrintPdf() {
    if (typeof window === "undefined") return;
    window.print();
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:gap-10">
      <header className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-8 print:hidden">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">
          Administrator
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          レポート作成
        </h1>
        <div className="mt-4 flex flex-wrap gap-2 border-b border-slate-200 pb-2">
          <span className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white">
            アンケート集計レポート
          </span>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
          クライアントの 1on1 セッション・フィードバック（毎回入力）を、対象者・回・期間・形式で集計し、PDF として出力できます。
        </p>
      </header>

      <section className="space-y-6 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-6 print:hidden">
        <h2 className="text-lg font-semibold text-slate-900">抽出条件</h2>

        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
          <h3 className="text-sm font-semibold text-slate-800">企業で絞り込み（任意）</h3>
          <p className="mt-1 text-xs text-slate-500">
            選択すると、その企業 ID に所属するクライアント／クライアント管理者の回答だけが集計されます。
            <strong>対象クライアントの候補も、その企業に所属するメンバーだけに絞られます。</strong>
            別企業のデータがレポートに混じることはありません。
          </p>
          <label className="mt-3 block max-w-md text-sm font-medium text-slate-800">
            企業（テナント）
            <select
              value={filterCompanyId}
              onChange={(e) => setFilterCompanyId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
            >
              <option value="">すべての企業</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}（{c.id}）
                </option>
              ))}
            </select>
          </label>
          {companies.length === 0 ? (
            <p className="mt-2 text-xs text-amber-800">
              企業が未登録です。「アプリ設定 → 企業（テナント）」で登録すると選択できます。
            </p>
          ) : null}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">対象クライアント</h3>
            <p className="mt-1 text-xs text-slate-500">
              {filterCompanyId
                ? "選択企業に所属するメンバーのみ表示しています。未選択の場合は表示中の全員を対象とします。"
                : "未選択の場合は全クライアントを対象とします。"}
            </p>
            <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200 p-3">
              {visibleClients.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {filterCompanyId
                    ? "この企業に所属するクライアントは登録されていません。"
                    : "クライアントがいません。"}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {visibleClients.map((c) => {
                    const coLabel = companyLabelFromRegistry(c.companyId, companies);
                    return (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedClientIds.includes(c.id)}
                          onChange={() => toggleClient(c.id)}
                          className="mt-0.5 h-4 w-4 accent-indigo-700"
                        />
                        <span>
                          <span className="font-medium text-slate-900">{c.displayName}</span>
                          {coLabel ? (
                            <span className="ml-2 text-xs text-slate-500">({coLabel})</span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-800">対象セッション回</h3>
            <p className="mt-1 text-xs text-slate-500">
              未選択の場合は全回（1〜{totalSessions}）が対象になります。
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {sessionOptions.map((n) => (
                <label
                  key={n}
                  className={`cursor-pointer rounded-md border px-2.5 py-1.5 text-sm ${
                    selectedSessions.includes(n)
                      ? "border-indigo-700 bg-indigo-50 text-indigo-900"
                      : "border-slate-300 bg-white text-slate-800"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={selectedSessions.includes(n)}
                    onChange={() => toggleSession(n)}
                  />
                  第{n}回
                </label>
              ))}
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-800">
                または期間（実施日 from / to）
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
                <span className="text-slate-500">〜</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">匿名性</h3>
            <label className="mt-2 inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
                className="h-4 w-4 accent-indigo-700"
              />
              <span>名前を「匿名」と表示</span>
            </label>
            <p className="mt-1 text-xs text-slate-500">
              「項目ごと」形式は常に匿名前提です（個人特定なし）。
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-800">形式</h3>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setFormat("per-person")}
                className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${
                  format === "per-person"
                    ? "border-indigo-700 bg-indigo-700 text-white"
                    : "border-slate-300 bg-white text-slate-800"
                }`}
              >
                一人一人
              </button>
              <button
                type="button"
                onClick={() => setFormat("per-question")}
                className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${
                  format === "per-question"
                    ? "border-indigo-700 bg-indigo-700 text-white"
                    : "border-slate-300 bg-white text-slate-800"
                }`}
              >
                項目ごと
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void onGenerate()}
            className="rounded-lg bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-800 disabled:opacity-60"
          >
            {loading ? "集計中…" : "レポートを作成"}
          </button>
          {result ? (
            <button
              type="button"
              onClick={onPrintPdf}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              PDF として出力（印刷）
            </button>
          ) : null}
          {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
        </div>
      </section>

      {result ? (
        <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm print:border-0 print:p-0 print:shadow-none">
          <div className="print:hidden">
            <p className="text-xs text-slate-500">
              レポート本文は編集できます（クライアントの回答も書き換え可）。編集内容を反映した状態で PDF に出力されます。
            </p>
          </div>
          <textarea
            value={editableIntro}
            onChange={(e) => setEditableIntro(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-slate-300 p-3 text-sm leading-relaxed print:border-0 print:p-0"
          />

          <div className="print:break-inside-avoid">
            <h2 className="text-lg font-semibold text-slate-900">アンケート集計レポート</h2>
            <p className="mt-1 text-xs text-slate-500">
              対象データ: {result.itemsCount} 件 ／ 形式:{" "}
              {result.format === "per-person" ? "一人一人" : "項目ごと（匿名）"}
            </p>
          </div>

          {result.format === "per-person" ? (
            <div className="space-y-6">
              {result.perPerson.length === 0 ? (
                <p className="text-sm text-slate-600">該当データがありません。</p>
              ) : (
                result.perPerson.map((person) => (
                  <article
                    key={person.clientId}
                    className="rounded-xl border border-slate-200 p-4 print:break-inside-avoid"
                  >
                    <h3 className="text-base font-semibold text-slate-900">
                      {person.displayName}
                    </h3>
                    <div className="mt-3 space-y-4">
                      {person.sessions.map((s) => (
                        <div key={s.sessionNumber} className="rounded-lg border border-slate-100 bg-slate-50 p-3 print:bg-white">
                          <p className="text-sm font-semibold text-slate-800">
                            第{s.sessionNumber}回　{formatJaDate(s.sessionDateIso)}
                          </p>
                          <dl className="mt-2 space-y-2 text-sm">
                            {ANSWER_KEYS.map((q) => {
                              if (q === "satisfactionReason") return null;
                              const key = ppKey(person.clientId, s.sessionNumber, q);
                              const value = key in editedAnswersPp ? editedAnswersPp[key]! : s.answers[q];
                              return (
                                <div key={q}>
                                  <dt className="font-semibold text-slate-700">
                                    {QUESTION_LABELS[q]}
                                  </dt>
                                  <dd>
                                    <textarea
                                      value={value}
                                      onChange={(e) =>
                                        setEditedAnswersPp((prev) => ({ ...prev, [key]: e.target.value }))
                                      }
                                      rows={Math.max(2, Math.min(6, (value || "").split("\n").length))}
                                      className="mt-1 w-full whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-2 text-slate-800 print:border-0 print:bg-transparent print:p-0"
                                    />
                                  </dd>
                                </div>
                              );
                            })}
                            <div>
                              <dt className="font-semibold text-slate-700">4. 満足度（1〜10）</dt>
                              <dd className="text-slate-800">
                                {s.satisfactionScore != null ? `${s.satisfactionScore} / 10` : "—"}
                              </dd>
                            </div>
                            {(() => {
                              const key = ppKey(person.clientId, s.sessionNumber, "satisfactionReason");
                              const value = key in editedAnswersPp ? editedAnswersPp[key]! : s.answers.satisfactionReason;
                              return (
                                <div>
                                  <dt className="font-semibold text-slate-700">
                                    {QUESTION_LABELS.satisfactionReason}
                                  </dt>
                                  <dd>
                                    <textarea
                                      value={value}
                                      onChange={(e) =>
                                        setEditedAnswersPp((prev) => ({ ...prev, [key]: e.target.value }))
                                      }
                                      rows={Math.max(2, Math.min(6, (value || "").split("\n").length))}
                                      className="mt-1 w-full whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-2 text-slate-800 print:border-0 print:bg-transparent print:p-0"
                                    />
                                  </dd>
                                </div>
                              );
                            })()}
                          </dl>
                        </div>
                      ))}
                    </div>
                  </article>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {ANSWER_KEYS.map((k) => (
                <section key={k} className="rounded-xl border border-slate-200 p-4 print:break-inside-avoid">
                  <h3 className="text-base font-semibold text-slate-900">{QUESTION_LABELS[k]}</h3>
                  <ul className="mt-2 space-y-2 text-sm text-slate-800">
                    {result.perQuestion[k].length === 0 ? (
                      <li className="text-slate-500">回答なし</li>
                    ) : (
                      result.perQuestion[k].map((v, idx) => {
                        const pqKey = `${k}|${idx}`;
                        const value = pqKey in editedAnswersPq ? editedAnswersPq[pqKey]! : v;
                        return (
                          <li key={idx} className="flex items-start gap-2">
                            <span aria-hidden className="mt-2 select-none text-slate-400 print:text-slate-700">
                              •
                            </span>
                            <textarea
                              value={value}
                              onChange={(e) =>
                                setEditedAnswersPq((prev) => ({ ...prev, [pqKey]: e.target.value }))
                              }
                              rows={Math.max(2, Math.min(6, (value || "").split("\n").length))}
                              className="w-full whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-2 text-slate-800 print:border-0 print:bg-transparent print:p-0"
                            />
                          </li>
                        );
                      })
                    )}
                  </ul>
                </section>
              ))}
              <section className="rounded-xl border border-slate-200 p-4 print:break-inside-avoid">
                <h3 className="text-base font-semibold text-slate-900">4. 満足度（1〜10）</h3>
                <p className="mt-1 text-sm text-slate-800">
                  全回答: {result.satisfaction.values.join(", ") || "—"}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  平均値: {result.satisfaction.average ?? "—"}
                </p>
              </section>
            </div>
          )}

          <textarea
            value={editableConclusion}
            onChange={(e) => setEditableConclusion(e.target.value)}
            rows={3}
            placeholder="まとめ・所感などを自由に記載してください（PDFにそのまま反映されます）。"
            className="w-full rounded-md border border-slate-300 p-3 text-sm leading-relaxed print:border-0 print:p-0"
          />
        </section>
      ) : null}

      {/* PDF（印刷）用スタイル */}
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }
          header,
          nav,
          .print\\:hidden {
            display: none !important;
          }
          textarea {
            border: none !important;
            resize: none !important;
            background: white !important;
          }
        }
      `}</style>
    </div>
  );
}
