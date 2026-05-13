"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Role =
  | "ADMIN"
  | "PARTNER"
  | "CLIENT"
  | "CLIENT_ADMIN"
  | "CLIENT_HR"
  | "ADMIN_ASSISTANT";

type FeedbackAnswers = {
  insight?: string;
  feeling?: string;
  nextActions?: string;
  satisfactionReason?: string;
  other?: string;
};
type PartnerChange = "continue" | "undecided" | "want_change";

type AbandonReason = "no_show" | "late_cancel";

type SessionDetail = {
  matchId: string;
  sessionNumber: number;
  plan: {
    sessionNumber: number;
    confirmed: boolean;
    round: number | null;
    startAt: string | null;
    endAt: string | null;
    negotiationId: string | null;
  };
  openable: boolean;
  viewerRole: Role;
  partnerExtraQuestions: string[];
  /**
   * 管理者が「企業ごとの設定 → クライアント振り返りの追加質問」で
   * この回（sessionNumber）に追加した自由設問。
   * 通常設問とは別に表示され、回答は feedback.extraAnswers に保存される。
   */
  clientExtraQuestions: string[];
  guideline: { client: string; partner: string } | null;
  abandonment: { reason: AbandonReason; markedAt: string; markedBy: string } | null;
  feedback: {
    answers: FeedbackAnswers;
    extraAnswers: Record<string, string>;
    satisfactionScore: number | null;
    partnerChange: PartnerChange | null;
    updatedAt: string;
  } | null;
  report: {
    reflection: string;
    extraAnswers: Record<string, string>;
    updatedAt: string;
  } | null;
  match: { partnerId: string; clientId: string };
};

function formatJa(iso: string | null) {
  if (!iso) return "未確定";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ja-JP", {
    weekday: "short",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function SessionWorkspace({
  matchId,
  sessionNumber,
}: {
  matchId: string;
  sessionNumber: string;
}) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // client form state
  const [insight, setInsight] = useState("");
  const [feeling, setFeeling] = useState("");
  const [nextActions, setNextActions] = useState("");
  const [satisfactionScore, setSatisfactionScore] = useState<number | "">("");
  const [satisfactionReason, setSatisfactionReason] = useState("");
  const [partnerChange, setPartnerChange] = useState<PartnerChange | "">("");
  const [other, setOther] = useState("");
  // クライアント追加質問の回答（インデックス→文字列）
  const [clientExtraAnswers, setClientExtraAnswers] = useState<Record<number, string>>({});

  // partner form state
  const [reflection, setReflection] = useState("");
  const [extraAnswers, setExtraAnswers] = useState<Record<number, string>>({});
  const [abandonSubmitting, setAbandonSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/matches/${matchId}/sessions/${sessionNumber}`, {
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) {
      setError(json?.error ?? "取得できませんでした。");
      setLoading(false);
      return;
    }
    const d = json as SessionDetail;
    setDetail(d);
    setLoading(false);
    if (d.feedback) {
      setInsight(d.feedback.answers.insight ?? "");
      setFeeling(d.feedback.answers.feeling ?? "");
      setNextActions(d.feedback.answers.nextActions ?? "");
      setSatisfactionScore(d.feedback.satisfactionScore ?? "");
      setSatisfactionReason(d.feedback.answers.satisfactionReason ?? "");
      setPartnerChange(d.feedback.partnerChange ?? "");
      setOther(d.feedback.answers.other ?? "");
      const cea: Record<number, string> = {};
      for (const [k, v] of Object.entries(d.feedback.extraAnswers ?? {})) {
        cea[Number(k)] = v;
      }
      setClientExtraAnswers(cea);
    }
    if (d.report) {
      setReflection(d.report.reflection ?? "");
      const ea: Record<number, string> = {};
      for (const [k, v] of Object.entries(d.report.extraAnswers)) {
        ea[Number(k)] = v;
      }
      setExtraAnswers(ea);
    }
  }, [matchId, sessionNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmitFeedback(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!detail) return;
    setSubmitting(true);
    setNotice(null);
    setError(null);
    const extraOut: Record<string, string> = {};
    for (const [k, v] of Object.entries(clientExtraAnswers)) {
      extraOut[String(k)] = v.trim();
    }
    const body = {
      answers: {
        insight: insight.trim(),
        feeling: feeling.trim(),
        nextActions: nextActions.trim(),
        satisfactionReason: satisfactionReason.trim(),
        other: other.trim(),
      },
      extraAnswers: extraOut,
      satisfactionScore: satisfactionScore === "" ? null : Number(satisfactionScore),
      partnerChange: partnerChange === "" ? null : partnerChange,
    };
    const res = await fetch(
      `/api/matches/${matchId}/sessions/${sessionNumber}/feedback`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const json = await res.json().catch(() => null);
    setSubmitting(false);
    if (!res.ok) {
      setError(json?.error ?? "送信に失敗しました。");
      return;
    }
    setNotice("振り返りを保存しました。");
    void load();
  }

  async function onMarkAbandoned(reason: AbandonReason) {
    if (!detail) return;
    const reasonLabel =
      reason === "no_show"
        ? "クライアントが連絡なく参加しなかった"
        : "クライアントが24時間前を過ぎてキャンセルした";
    if (!window.confirm(`この回を【未実施・消化】(${reasonLabel}) としてマークします。よろしいですか？`)) {
      return;
    }
    setAbandonSubmitting(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/matches/${matchId}/sessions/${sessionNumber}/abandon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const json = await res.json().catch(() => null);
    setAbandonSubmitting(false);
    if (!res.ok) {
      setError(json?.error ?? "マークに失敗しました。");
      return;
    }
    setNotice("【未実施・消化】としてマークしました。");
    void load();
  }

  async function onClearAbandonment() {
    if (!detail) return;
    if (!window.confirm("【未実施・消化】マークを解除します。よろしいですか？")) return;
    setAbandonSubmitting(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/matches/${matchId}/sessions/${sessionNumber}/abandon`, {
      method: "DELETE",
    });
    const json = await res.json().catch(() => null);
    setAbandonSubmitting(false);
    if (!res.ok) {
      setError(json?.error ?? "解除に失敗しました。");
      return;
    }
    setNotice("マークを解除しました。");
    void load();
  }

  async function onSubmitReport(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!detail) return;
    setSubmitting(true);
    setNotice(null);
    setError(null);
    const extra: Record<string, string> = {};
    for (const [k, v] of Object.entries(extraAnswers)) {
      extra[String(k)] = v.trim();
    }
    const body = { reflection: reflection.trim(), extraAnswers: extra };
    const res = await fetch(
      `/api/matches/${matchId}/sessions/${sessionNumber}/report`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const json = await res.json().catch(() => null);
    setSubmitting(false);
    if (!res.ok) {
      setError(json?.error ?? "送信に失敗しました。");
      return;
    }
    setNotice("レポートを保存しました。");
    void load();
  }

  if (loading) {
    return <div className="px-6 py-10 text-base text-zinc-600">読込中…</div>;
  }

  if (error && !detail) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        <p className="mt-3">
          <Link className="text-indigo-700 underline" href={`/match/${matchId}`}>
            ← マッチページへ戻る
          </Link>
        </p>
      </div>
    );
  }

  if (!detail) return null;

  const role = detail.viewerRole;
  const reflectionLength = reflection.length;
  const reflectionTooLong = reflectionLength > 800;

  const now = Date.now();
  const endMs = detail.plan.endAt ? new Date(detail.plan.endAt).getTime() : null;
  const isPast = endMs !== null && endMs <= now;
  const isAbandoned = detail.abandonment !== null;
  const statusInfo: { label: string; tone: string } = isAbandoned
    ? { label: "未実施・消化", tone: "border-red-300 bg-red-50 text-red-800" }
    : !detail.plan.confirmed
      ? { label: "未確定", tone: "border-zinc-300 bg-white text-zinc-700" }
      : isPast
        ? { label: "実施済", tone: "border-emerald-300 bg-emerald-50 text-emerald-800" }
        : { label: "予定", tone: "border-indigo-300 bg-indigo-50 text-indigo-800" };
  const abandonReasonLabel = detail.abandonment
    ? detail.abandonment.reason === "no_show"
      ? "クライアントが連絡なく参加しなかった"
      : "クライアントが24時間前を過ぎてキャンセルした"
    : null;
  const guidelineText =
    role === "PARTNER"
      ? detail.guideline?.partner?.trim() ?? ""
      : role === "ADMIN" || role === "ADMIN_ASSISTANT"
        ? // 管理者は両方表示するため、ここでは便宜上両方を結合せず別途出す
          ""
        : detail.guideline?.client?.trim() ?? "";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-3 py-5 sm:gap-8 sm:px-6 sm:py-8">
      <header className="space-y-2 border-b border-zinc-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">1on1 Session</p>
        <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl">
          {detail.sessionNumber} 回目のセッション
        </h1>
        <p className="text-base text-zinc-700">
          実施日時：{formatJa(detail.plan.startAt)}
          {detail.plan.endAt ? ` 〜 ${formatJa(detail.plan.endAt)}` : ""}
        </p>
        <div className="flex flex-wrap gap-2 pt-2 text-sm">
          <Link
            href={`/match/${matchId}`}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-zinc-800 no-underline hover:bg-zinc-50"
          >
            ← マッチページへ戻る
          </Link>
        </div>
      </header>

      {error ? <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-900">{notice}</p> : null}

      <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-sm font-semibold ${statusInfo.tone}`}
          >
            {statusInfo.label}
          </span>
          {isAbandoned ? (
            <span className="text-sm text-zinc-700">理由：{abandonReasonLabel}</span>
          ) : null}
        </div>

        {role === "PARTNER" ? (
          isAbandoned ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void onClearAbandonment()}
                disabled={abandonSubmitting}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:opacity-60"
              >
                {abandonSubmitting ? "解除中…" : "マークを解除"}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-zinc-900">
                クライアントの状況により、この回を【未実施・消化】としてマークします
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void onMarkAbandoned("no_show")}
                  disabled={abandonSubmitting}
                  className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-800 shadow-sm transition hover:bg-red-100 disabled:opacity-60"
                >
                  クライアントが連絡なく参加しなかった
                </button>
                <button
                  type="button"
                  onClick={() => void onMarkAbandoned("late_cancel")}
                  disabled={abandonSubmitting}
                  className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-800 shadow-sm transition hover:bg-red-100 disabled:opacity-60"
                >
                  クライアントが24時間前を過ぎてキャンセルした
                </button>
              </div>
            </div>
          )
        ) : null}
      </section>

      {detail.guideline ? (
        role === "ADMIN" || role === "ADMIN_ASSISTANT" ? (
          <section className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/60 p-4 shadow-sm sm:p-5">
            <h2 className="text-lg font-semibold text-violet-950">
              {detail.sessionNumber}回目 のガイドライン（管理者ビュー）
            </h2>
            {detail.guideline.client?.trim() ? (
              <div>
                <h3 className="text-sm font-semibold text-violet-900">クライアント向け</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-900">
                  {detail.guideline.client}
                </p>
              </div>
            ) : null}
            {detail.guideline.partner?.trim() ? (
              <div>
                <h3 className="text-sm font-semibold text-violet-900">パートナー向け</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-900">
                  {detail.guideline.partner}
                </p>
              </div>
            ) : null}
          </section>
        ) : guidelineText ? (
          <section className="space-y-2 rounded-2xl border border-violet-200 bg-violet-50/60 p-4 shadow-sm sm:p-5">
            <h2 className="text-lg font-semibold text-violet-950">
              {detail.sessionNumber}回目 のガイドライン
            </h2>
            <p className="whitespace-pre-wrap text-sm text-zinc-900">{guidelineText}</p>
          </section>
        ) : null
      ) : null}

      {role === "CLIENT" || role === "CLIENT_ADMIN" || role === "CLIENT_HR" || role === "ADMIN" || role === "ADMIN_ASSISTANT" ? (
        <section className="space-y-4 rounded-3xl border border-violet-100 bg-white p-4 shadow-sm sm:p-6">
          <header>
            <h2 className="text-xl font-semibold text-violet-900">クライアント振り返り</h2>
            {role === "ADMIN" || role === "ADMIN_ASSISTANT" ? (
              <p className="text-sm text-zinc-600">管理者として閲覧しています（編集不可）。</p>
            ) : (
              <p className="text-sm text-zinc-600">回答内容はパートナーには表示されません。サポートデスクが匿名で集計します。</p>
            )}
          </header>

          {isAbandoned ? (
            <div className="space-y-2 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-3 text-sm text-red-900">
              <p className="font-semibold">この回は【未実施・消化】としてマークされています。</p>
              {abandonReasonLabel ? <p>理由：{abandonReasonLabel}</p> : null}
              <p className="text-xs text-red-800/85">
                振り返りの入力はできません。本件は実施回としてカウントされません。
              </p>
            </div>
          ) : null}

          {!isAbandoned && (role === "ADMIN" || role === "ADMIN_ASSISTANT") && !detail.feedback ? (
            <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-sm text-zinc-600">
              まだクライアントの振り返りは提出されていません。
            </p>
          ) : null}

          {!isAbandoned && (role === "CLIENT" || role === "CLIENT_ADMIN" || role === "CLIENT_HR") ? (
            <form onSubmit={onSubmitFeedback} className="space-y-5">
              <label className="block space-y-1 text-base font-medium text-zinc-900">
                1. 今回の1on1でどのような気づきがありましたか？
                <textarea
                  value={insight}
                  onChange={(e) => setInsight(e.target.value)}
                  rows={4}
                  maxLength={4000}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base"
                />
              </label>
              <label className="block space-y-1 text-base font-medium text-zinc-900">
                2. 1on1が終わってどのような気持ちになりましたか？
                <textarea
                  value={feeling}
                  onChange={(e) => setFeeling(e.target.value)}
                  rows={4}
                  maxLength={4000}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base"
                />
              </label>
              <label className="block space-y-1 text-base font-medium text-zinc-900">
                3. 次回の1on1までに、取り組みたいことはありますか？
                <textarea
                  value={nextActions}
                  onChange={(e) => setNextActions(e.target.value)}
                  rows={4}
                  maxLength={4000}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base"
                />
              </label>
              <fieldset className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/40 px-4 py-3">
                <legend className="px-1 text-base font-semibold text-violet-950">
                  4. 今回の1on1に対する満足度（1〜10）
                </legend>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <label
                      key={n}
                      className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                        satisfactionScore === n
                          ? "border-violet-500 bg-violet-600 text-white"
                          : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="satisfaction"
                        value={n}
                        checked={satisfactionScore === n}
                        onChange={() => setSatisfactionScore(n)}
                        className="sr-only"
                      />
                      {n}
                    </label>
                  ))}
                </div>
                <label className="block text-base font-medium text-zinc-900">
                  5. そう答えられた理由を教えてください。
                  <textarea
                    value={satisfactionReason}
                    onChange={(e) => setSatisfactionReason(e.target.value)}
                    rows={3}
                    maxLength={4000}
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base"
                  />
                </label>
              </fieldset>

              <fieldset className="space-y-2 rounded-2xl border border-violet-200 bg-violet-50/40 px-4 py-3">
                <legend className="px-1 text-base font-semibold text-violet-950">
                  6. 今後の1on1について、対話パートナーを変更したいと思いますか？
                </legend>
                <p className="text-xs text-violet-900/85">
                  ※ より有意義に1on1セッションを受けていただくための確認項目です。
                </p>
                <div className="space-y-2">
                  {(
                    [
                      { v: "continue", label: "今の対話パートナーとの1on1を続けたい" },
                      { v: "undecided", label: "今のところは変更の希望はないが、状況によっては相談したい" },
                      { v: "want_change", label: "変更を希望する" },
                    ] as { v: PartnerChange; label: string }[]
                  ).map((opt) => (
                    <label key={opt.v} className="flex items-start gap-2 text-sm text-zinc-900">
                      <input
                        type="radio"
                        name="partnerChange"
                        value={opt.v}
                        checked={partnerChange === opt.v}
                        onChange={() => setPartnerChange(opt.v)}
                        className="mt-1"
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="block space-y-1 text-base font-medium text-zinc-900">
                7. その他、何かございましたらご自由にご記載ください。
                <textarea
                  value={other}
                  onChange={(e) => setOther(e.target.value)}
                  rows={3}
                  maxLength={4000}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base"
                />
              </label>

              {detail.clientExtraQuestions.length > 0 ? (
                <fieldset className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/40 px-4 py-3">
                  <legend className="px-1 text-base font-semibold text-violet-900">
                    {detail.sessionNumber} 回目の追加質問
                  </legend>
                  {detail.clientExtraQuestions.map((q, i) => (
                    <label key={i} className="block space-y-1 text-sm font-medium text-zinc-900">
                      {q}
                      <textarea
                        value={clientExtraAnswers[i] ?? ""}
                        onChange={(e) =>
                          setClientExtraAnswers((prev) => ({ ...prev, [i]: e.target.value }))
                        }
                        rows={3}
                        maxLength={4000}
                        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base"
                      />
                    </label>
                  ))}
                </fieldset>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-violet-700 px-4 py-2.5 text-base font-semibold text-white shadow-sm transition hover:bg-violet-800 disabled:opacity-60"
                >
                  {submitting ? "送信中…" : detail.feedback ? "上書き保存" : "提出する"}
                </button>
                {detail.feedback ? (
                  <span className="text-sm text-zinc-600">
                    最終更新: {formatJa(detail.feedback.updatedAt)}
                  </span>
                ) : null}
              </div>
              {/*
                クライアントが「提出する」を押した結果、何が起きるのかを 1 行で明示。
                内容がパートナーに開示されるか・管理者に通知が飛ぶかなど、
                プライバシー上の不安を取り除く文言にする。
              */}
              <p className="text-xs text-zinc-500">
                → 内容は管理者と担当パートナーに共有されます。提出後も「上書き保存」で内容を更新できます。
              </p>
            </form>
          ) : !isAbandoned ? (
            detail.feedback && (
              <dl className="grid gap-3 text-sm">
                <ReadOnlyItem label="1. 気づき" value={detail.feedback.answers.insight} />
                <ReadOnlyItem label="2. 終わっての気持ち" value={detail.feedback.answers.feeling} />
                <ReadOnlyItem label="3. 次回まで取り組みたいこと" value={detail.feedback.answers.nextActions} />
                <ReadOnlyItem
                  label="4. 満足度（1〜10）"
                  value={detail.feedback.satisfactionScore != null ? String(detail.feedback.satisfactionScore) : ""}
                />
                <ReadOnlyItem label="5. その理由" value={detail.feedback.answers.satisfactionReason} />
                <ReadOnlyItem
                  label="6. パートナー変更希望"
                  value={
                    detail.feedback.partnerChange === "continue"
                      ? "続けたい"
                      : detail.feedback.partnerChange === "undecided"
                        ? "状況による"
                        : detail.feedback.partnerChange === "want_change"
                          ? "変更希望"
                          : ""
                  }
                />
                <ReadOnlyItem label="7. その他" value={detail.feedback.answers.other} />
                {detail.clientExtraQuestions.map((q, i) => (
                  <ReadOnlyItem
                    key={`feedback-extra-${i}`}
                    label={q}
                    value={detail.feedback?.extraAnswers[String(i)] ?? ""}
                  />
                ))}
                <p className="text-xs text-zinc-500">最終更新: {formatJa(detail.feedback.updatedAt)}</p>
              </dl>
            )
          ) : null}
        </section>
      ) : null}

      {role === "PARTNER" || role === "ADMIN" || role === "ADMIN_ASSISTANT" ? (
        <section className="space-y-4 rounded-3xl border border-amber-100 bg-white p-4 shadow-sm sm:p-6">
          <header>
            <h2 className="text-xl font-semibold text-amber-900">1on1セッションレポート（パートナー）</h2>
            {role === "ADMIN" || role === "ADMIN_ASSISTANT" ? (
              <p className="text-sm text-zinc-600">管理者として閲覧しています（編集不可）。</p>
            ) : (
              <p className="text-sm text-zinc-600">
                内容は相手（クライアント）には表示されません。匿名性を持ってモチベイジからスポンサーへ報告します。
              </p>
            )}
          </header>

          {(role === "ADMIN" || role === "ADMIN_ASSISTANT") && !detail.report ? (
            <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-sm text-zinc-600">
              まだパートナーのレポートは提出されていません。
            </p>
          ) : null}

          {role === "PARTNER" ? (
            <form onSubmit={onSubmitReport} className="space-y-5">
              <label className="block space-y-1 text-base font-medium text-zinc-900">
                クライアントに対する所感（200字程度）
                <textarea
                  value={reflection}
                  onChange={(e) => setReflection(e.target.value)}
                  rows={6}
                  maxLength={4000}
                  className={`mt-1 w-full rounded-lg border bg-white px-3 py-2 text-base ${
                    reflectionTooLong ? "border-red-400" : "border-zinc-300"
                  }`}
                />
                <span className="mt-1 block text-xs text-zinc-500">
                  目安: 200字程度（現在 {reflectionLength} 字）
                </span>
              </label>

              {detail.partnerExtraQuestions.length > 0 ? (
                <fieldset className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/40 px-4 py-3">
                  <legend className="px-1 text-base font-semibold text-amber-900">
                    {detail.sessionNumber} 回目の追加質問
                  </legend>
                  {detail.partnerExtraQuestions.map((q, i) => (
                    <label key={i} className="block space-y-1 text-sm font-medium text-zinc-900">
                      {q}
                      <textarea
                        value={extraAnswers[i] ?? ""}
                        onChange={(e) =>
                          setExtraAnswers((prev) => ({ ...prev, [i]: e.target.value }))
                        }
                        rows={4}
                        maxLength={4000}
                        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base"
                      />
                    </label>
                  ))}
                </fieldset>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-amber-700 px-4 py-2.5 text-base font-semibold text-white shadow-sm transition hover:bg-amber-800 disabled:opacity-60"
                >
                  {submitting ? "送信中…" : detail.report ? "上書き保存" : "提出する"}
                </button>
                {detail.report ? (
                  <span className="text-sm text-zinc-600">
                    最終更新: {formatJa(detail.report.updatedAt)}
                  </span>
                ) : null}
              </div>
              {/*
                パートナー側のレポート提出後の挙動を明示。
                クライアントには見えない／管理者にのみ届く、というプライバシーの保証は
                安心して書いてもらう上で重要なため、UI 側でも繰り返し伝える。
              */}
              <p className="text-xs text-zinc-500">
                → 提出内容は管理者のみが閲覧します（クライアントには表示されません）。
              </p>
            </form>
          ) : (
            detail.report && (
              <dl className="grid gap-3 text-sm">
                <ReadOnlyItem label="クライアントに対する所感" value={detail.report.reflection} />
                {detail.partnerExtraQuestions.map((q, i) => (
                  <ReadOnlyItem key={i} label={q} value={detail.report?.extraAnswers[String(i)] ?? ""} />
                ))}
                <p className="text-xs text-zinc-500">最終更新: {formatJa(detail.report.updatedAt)}</p>
              </dl>
            )
          )}
        </section>
      ) : null}
    </div>
  );
}

function ReadOnlyItem({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-900">
        {value && value.trim().length > 0 ? value : "（未記入）"}
      </dd>
    </div>
  );
}
