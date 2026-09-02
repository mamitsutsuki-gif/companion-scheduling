"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { CoachingSessionRoleplayPanel } from "@/components/coaching-session-roleplay-panel";
import {
  emptySessionReportAnswers,
  parsePartnerQuestionAnswers,
  parseSessionReportAnswers,
  SESSION_REPORT_FIELDS,
  SESSION_REPORT_MOTIVEAGE_NOTICE,
  type SessionReportAnswers,
} from "@/lib/session-report-fields";
import {
  sessionAbandonmentReasonLabel,
  sessionAbandonmentDisplayForViewer,
  isClientFacingRole,
} from "@/lib/session-abandonment-labels";
import type { SessionAbandonmentReason } from "@/lib/repositories/session-abandonment-repository";

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

type AbandonReason = SessionAbandonmentReason;

type SessionDetail = {
  matchId: string;
  sessionNumber: number;
  companyPlan?: string;
  isCoachingRoleplaySession?: boolean;
  plan: {
    sessionNumber: number;
    confirmed: boolean;
    round: number | null;
    startAt: string | null;
    endAt: string | null;
    negotiationId: string | null;
  };
  openable: boolean;
  postSessionOpenable: boolean;
  viewerRole: Role;
  viewerIsMatchClient?: boolean;
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
  const [reportAnswers, setReportAnswers] = useState<SessionReportAnswers>(
    emptySessionReportAnswers,
  );
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
      setReportAnswers(parseSessionReportAnswers(d.report));
      setExtraAnswers(parsePartnerQuestionAnswers(d.report.extraAnswers));
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

    if (!insight.trim()) {
      setError("「1. 気づき」を入力してください。");
      setSubmitting(false);
      return;
    }
    if (!feeling.trim()) {
      setError("「2. 終わっての気持ち」を入力してください。");
      setSubmitting(false);
      return;
    }
    if (!nextActions.trim()) {
      setError("「3. 次回まで取り組みたいこと」を入力してください。");
      setSubmitting(false);
      return;
    }
    if (satisfactionScore === "") {
      setError("「4. 満足度」を選択してください。");
      setSubmitting(false);
      return;
    }
    if (!satisfactionReason.trim()) {
      setError("「5. その理由」を入力してください。");
      setSubmitting(false);
      return;
    }
    if (partnerChange === "") {
      setError("「6. パートナー変更希望」を選択してください。");
      setSubmitting(false);
      return;
    }
    for (let i = 0; i < detail.clientExtraQuestions.length; i++) {
      if (!(clientExtraAnswers[i] ?? "").trim()) {
        setError(`追加質問「${detail.clientExtraQuestions[i]}」に回答してください。`);
        setSubmitting(false);
        return;
      }
    }

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
      satisfactionScore: Number(satisfactionScore),
      partnerChange,
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
    const reasonLabel = sessionAbandonmentReasonLabel(reason);
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

    for (const field of SESSION_REPORT_FIELDS) {
      if (!field.required) continue;
      if (!reportAnswers[field.key].trim()) {
        setError(`「${field.label}」を入力してください。`);
        setSubmitting(false);
        return;
      }
    }
    for (let i = 0; i < detail.partnerExtraQuestions.length; i++) {
      if (!(extraAnswers[i] ?? "").trim()) {
        setError(`追加質問「${detail.partnerExtraQuestions[i]}」に回答してください。`);
        setSubmitting(false);
        return;
      }
    }

    const extra: Record<string, string> = {};
    for (const [k, v] of Object.entries(extraAnswers)) {
      extra[String(k)] = v.trim();
    }
    const body = {
      reflection: reportAnswers.partnerReflection.trim(),
      answers: {
        sessionTheme: reportAnswers.sessionTheme.trim(),
        clientCurrentFocus: reportAnswers.clientCurrentFocus.trim(),
        clientSmallChange: reportAnswers.clientSmallChange.trim(),
        partnerReflection: reportAnswers.partnerReflection.trim(),
        partnerMemo: reportAnswers.partnerMemo.trim(),
      },
      extraAnswers: extra,
    };
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
  const partnerReflectionLength = reportAnswers.partnerReflection.length;
  const partnerReflectionTooLong = partnerReflectionLength > 800;

  const now = Date.now();
  const startMs = detail.plan.startAt ? new Date(detail.plan.startAt).getTime() : null;
  const endMs = detail.plan.endAt ? new Date(detail.plan.endAt).getTime() : null;
  const isStarted = startMs !== null && startMs <= now;
  const isPast = endMs !== null && endMs <= now;
  const postSessionOpenable = detail.postSessionOpenable;
  const isAbandoned = detail.abandonment !== null;
  const isClientViewer = isClientFacingRole(role);
  const abandonmentDisplay =
    isAbandoned && detail.abandonment
      ? sessionAbandonmentDisplayForViewer(detail.abandonment.reason, { isClientViewer })
      : null;
  const statusInfo: { label: string; tone: string } = abandonmentDisplay
    ? { label: abandonmentDisplay.label, tone: abandonmentDisplay.badgeClass }
    : !detail.plan.confirmed
      ? { label: "未確定", tone: "border-zinc-300 bg-white text-zinc-700" }
      : isPast
        ? { label: "実施済", tone: "border-emerald-300 bg-emerald-50 text-emerald-800" }
        : { label: "予定", tone: "border-indigo-300 bg-indigo-50 text-indigo-800" };
  const showAbandonReasonToStaff =
    isAbandoned &&
    !isClientViewer &&
    (role === "PARTNER" || role === "ADMIN" || role === "ADMIN_ASSISTANT");
  const abandonReasonLabel =
    showAbandonReasonToStaff && detail.abandonment
      ? sessionAbandonmentReasonLabel(detail.abandonment.reason)
      : null;
  const guidelineText =
    role === "PARTNER"
      ? detail.guideline?.partner?.trim() ?? ""
      : role === "ADMIN" || role === "ADMIN_ASSISTANT"
        ? // 管理者は両方表示するため、ここでは便宜上両方を結合せず別途出す
          ""
        : detail.guideline?.client?.trim() ?? "";

  const isCoachingRoleplay = detail.isCoachingRoleplaySession === true;
  const viewerIsMatchClient =
    detail.viewerIsMatchClient ?? (role === "CLIENT" && detail.match.clientId !== "");
  // 人事・上司ロールでも、このマッチの受講者本人なら自己評価を入力できる（API と同じ判定）
  const roleplayReadOnly =
    role === "ADMIN_ASSISTANT" ||
    ((role === "CLIENT_ADMIN" || role === "CLIENT_HR") && !viewerIsMatchClient);
  const formPreview = !postSessionOpenable && !isAbandoned && !isCoachingRoleplay;
  const showClientFeedbackSection =
    !isCoachingRoleplay &&
    !isAbandoned &&
    ((postSessionOpenable &&
      (role === "CLIENT" ||
        role === "CLIENT_ADMIN" ||
        role === "CLIENT_HR" ||
        role === "PARTNER" ||
        role === "ADMIN" ||
        role === "ADMIN_ASSISTANT")) ||
      (formPreview &&
        (role === "CLIENT" ||
          role === "CLIENT_ADMIN" ||
          role === "CLIENT_HR" ||
          role === "ADMIN" ||
          role === "ADMIN_ASSISTANT")));
  const showPartnerReportSection =
    !isCoachingRoleplay &&
    !isAbandoned &&
    ((postSessionOpenable && (role === "PARTNER" || role === "ADMIN" || role === "ADMIN_ASSISTANT")) ||
      (formPreview && (role === "PARTNER" || role === "ADMIN" || role === "ADMIN_ASSISTANT")));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-3 py-5 sm:gap-8 sm:px-6 sm:py-8">
      <header className="space-y-2 border-b border-zinc-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">1on1 Session</p>
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
          {isAbandoned && abandonReasonLabel ? (
            <span className="text-sm text-zinc-700">理由：{abandonReasonLabel}</span>
          ) : null}
        </div>
        {abandonmentDisplay?.clientNotice ? (
          <p className="text-sm leading-relaxed text-amber-950/90">{abandonmentDisplay.clientNotice}</p>
        ) : null}

        {role === "PARTNER" && isStarted ? (
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
          <section className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 shadow-sm sm:p-5">
            <h2 className="text-lg font-semibold text-indigo-950">
              {detail.sessionNumber}回目 のガイドライン（管理者ビュー）
            </h2>
            {detail.guideline.client?.trim() ? (
              <div>
                <h3 className="text-sm font-semibold text-indigo-900">クライアント向け</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-900">
                  {detail.guideline.client}
                </p>
              </div>
            ) : null}
            {detail.guideline.partner?.trim() ? (
              <div>
                <h3 className="text-sm font-semibold text-indigo-900">パートナー向け</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-900">
                  {detail.guideline.partner}
                </p>
              </div>
            ) : null}
          </section>
        ) : guidelineText ? (
          <section className="space-y-2 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 shadow-sm sm:p-5">
            <h2 className="text-lg font-semibold text-indigo-950">
              {detail.sessionNumber}回目 のガイドライン
            </h2>
            <p className="whitespace-pre-wrap text-sm text-zinc-900">{guidelineText}</p>
          </section>
        ) : null
      ) : null}

      {!postSessionOpenable && !isAbandoned ? (
        <section className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
          <h2 className="text-lg font-semibold text-slate-900">
            {isCoachingRoleplay
              ? "ロールプレイ評価の入力はセッション終了後です"
              : "振り返り・セッションレポートはセッション終了後に入力できます"}
          </h2>
          <p className="text-sm text-slate-600">
            下のフォームは項目確認用のプレビューです。入力・保存はセッション終了後に行えます。ガイドラインはこのページで確認できます。
            {detail.plan.endAt ? ` 終了予定：${formatJa(detail.plan.endAt)}` : null}
            {!detail.plan.confirmed ? " 日程は未確定です。" : null}
          </p>
        </section>
      ) : null}

      {isCoachingRoleplay && !isAbandoned ? (
        <section className="space-y-4 rounded-3xl border border-indigo-100 bg-white p-4 shadow-sm sm:p-6">
          <CoachingSessionRoleplayPanel
            matchId={matchId}
            sessionNumber={detail.sessionNumber}
            readOnly={roleplayReadOnly || !postSessionOpenable}
            previewBeforeSession={!postSessionOpenable}
            viewerRole={role}
          />
        </section>
      ) : null}

      {showClientFeedbackSection ? (
        <section className="space-y-4 rounded-3xl border border-indigo-100 bg-white p-4 shadow-sm sm:p-6">
          <header>
            <h2 className="text-xl font-semibold text-indigo-900">クライアント振り返り</h2>
            {role === "ADMIN" || role === "ADMIN_ASSISTANT" ? (
              <p className="text-sm text-zinc-600">管理者として閲覧しています（編集不可）。</p>
            ) : role === "PARTNER" ? (
              <p className="text-sm text-zinc-600">
                クライアントが提出した振り返りです（閲覧のみ）。パートナー変更希望は管理者のみ確認します。
              </p>
            ) : (
              <p className="text-sm text-zinc-600">
                回答内容は担当パートナーにも表示されます。提出後も「上書き保存」で内容を更新できます。
              </p>
            )}
          </header>

          {formPreview ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              クライアント振り返りフォームのプレビューです。セッション終了後に入力・保存できます。
            </p>
          ) : null}

          {!formPreview && (role === "ADMIN" || role === "ADMIN_ASSISTANT" || role === "PARTNER") && !detail.feedback ? (
            <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-sm text-zinc-600">
              まだクライアントの振り返りは提出されていません。
            </p>
          ) : null}

          {(role === "CLIENT" || role === "CLIENT_ADMIN" || role === "CLIENT_HR") ||
          (formPreview && (role === "ADMIN" || role === "ADMIN_ASSISTANT")) ? (
            <form
              onSubmit={formPreview ? (e) => e.preventDefault() : onSubmitFeedback}
              className="space-y-5"
            >
              {!formPreview ? (
                <p className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-sm text-indigo-950">
                  <span className="font-semibold text-red-600">*</span>{" "}
                  は必須項目です。未入力の項目があると、提出時にどの項目かをお知らせします。
                </p>
              ) : null}
              <label className="block space-y-1 text-base font-medium text-zinc-900">
                1. 今回の1on1でどのような気づきがありましたか？ <span className="text-red-600">*</span>
                <textarea
                  value={insight}
                  onChange={(e) => setInsight(e.target.value)}
                  rows={4}
                  maxLength={4000}
                  required={!formPreview}
                  disabled={formPreview}
                  placeholder={formPreview ? "（セッション後に入力）" : undefined}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base disabled:cursor-not-allowed disabled:bg-zinc-50"
                />
              </label>
              <label className="block space-y-1 text-base font-medium text-zinc-900">
                2. 1on1が終わってどのような気持ちになりましたか？ <span className="text-red-600">*</span>
                <textarea
                  value={feeling}
                  onChange={(e) => setFeeling(e.target.value)}
                  rows={4}
                  maxLength={4000}
                  required={!formPreview}
                  disabled={formPreview}
                  placeholder={formPreview ? "（セッション後に入力）" : undefined}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base disabled:cursor-not-allowed disabled:bg-zinc-50"
                />
              </label>
              <label className="block space-y-1 text-base font-medium text-zinc-900">
                3. 次回の1on1までに、取り組みたいことはありますか？ <span className="text-red-600">*</span>
                <textarea
                  value={nextActions}
                  onChange={(e) => setNextActions(e.target.value)}
                  rows={4}
                  maxLength={4000}
                  required={!formPreview}
                  disabled={formPreview}
                  placeholder={formPreview ? "（セッション後に入力）" : undefined}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base disabled:cursor-not-allowed disabled:bg-zinc-50"
                />
              </label>
              <fieldset
                disabled={formPreview}
                className={`space-y-3 rounded-2xl border px-4 py-3 ${
                  satisfactionScore === ""
                    ? "border-amber-300 bg-amber-50/50"
                    : "border-indigo-200 bg-indigo-50/40"
                }`}
              >
                <legend className="px-1 text-base font-semibold text-indigo-950">
                  4. 今回の1on1に対する満足度（1〜10） <span className="text-red-600">*</span>
                  <span className="ml-2 text-xs font-normal text-zinc-600">必須・タップで選択</span>
                </legend>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <label
                      key={n}
                      className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                        satisfactionScore === n
                          ? "border-indigo-500 bg-indigo-600 text-white"
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
                  5. そう答えられた理由を教えてください。 <span className="text-red-600">*</span>
                  <textarea
                    value={satisfactionReason}
                    onChange={(e) => setSatisfactionReason(e.target.value)}
                    rows={3}
                    maxLength={4000}
                    required={!formPreview}
                    disabled={formPreview}
                    placeholder={formPreview ? "（セッション後に入力）" : undefined}
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base disabled:cursor-not-allowed disabled:bg-zinc-50"
                  />
                </label>
              </fieldset>

              <fieldset
                disabled={formPreview}
                className={`space-y-2 rounded-2xl border px-4 py-3 ${
                  partnerChange === ""
                    ? "border-amber-300 bg-amber-50/50"
                    : "border-indigo-200 bg-indigo-50/40"
                }`}
              >
                <legend className="px-1 text-base font-semibold text-indigo-950">
                  6. 今後の1on1について、対話パートナーを変更したいと思いますか？{" "}
                  <span className="text-red-600">*</span>
                  <span className="ml-2 text-xs font-normal text-zinc-600">必須・選択</span>
                </legend>
                <p className="text-xs text-indigo-900/85">
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
                7. その他、何かございましたらご自由にご記載ください。{" "}
                <span className="text-xs font-normal text-zinc-500">（任意）</span>
                <textarea
                  value={other}
                  onChange={(e) => setOther(e.target.value)}
                  rows={3}
                  maxLength={4000}
                  disabled={formPreview}
                  placeholder={formPreview ? "（セッション後に入力）" : undefined}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base disabled:cursor-not-allowed disabled:bg-zinc-50"
                />
              </label>

              {detail.clientExtraQuestions.length > 0 ? (
                <fieldset
                  disabled={formPreview}
                  className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 px-4 py-3"
                >
                  <legend className="px-1 text-base font-semibold text-indigo-900">
                    {detail.sessionNumber} 回目の追加質問
                  </legend>
                  {detail.clientExtraQuestions.map((q, i) => (
                    <label key={i} className="block space-y-1 text-sm font-medium text-zinc-900">
                      {q} <span className="text-red-600">*</span>
                      <textarea
                        value={clientExtraAnswers[i] ?? ""}
                        onChange={(e) =>
                          setClientExtraAnswers((prev) => ({ ...prev, [i]: e.target.value }))
                        }
                        rows={3}
                        maxLength={4000}
                        required={!formPreview}
                        disabled={formPreview}
                        placeholder={formPreview ? "（セッション後に入力）" : undefined}
                        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base disabled:cursor-not-allowed disabled:bg-zinc-50"
                      />
                    </label>
                  ))}
                </fieldset>
              ) : null}

              {!formPreview ? (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-lg bg-indigo-700 px-4 py-2.5 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-800 disabled:opacity-60"
                  >
                    {submitting ? "送信中…" : detail.feedback ? "上書き保存" : "提出する"}
                  </button>
                  {detail.feedback ? (
                    <span className="text-sm text-zinc-600">
                      最終更新: {formatJa(detail.feedback.updatedAt)}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {!formPreview ? (
                <p className="text-xs text-zinc-500">
                  → ご記入内容は担当パートナーにも表示されます。提出後も「上書き保存」で内容を更新できます。
                </p>
              ) : null}
            </form>
          ) : postSessionOpenable ? (
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
                {role !== "PARTNER" ? (
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
                ) : null}
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

      {showPartnerReportSection ? (
        <section className="space-y-4 rounded-3xl border border-amber-100 bg-white p-4 shadow-sm sm:p-6">
          <header>
            <h2 className="text-xl font-semibold text-amber-900">1on1セッションレポート（パートナー）</h2>
            <p className="text-sm text-zinc-600">
              {SESSION_REPORT_MOTIVEAGE_NOTICE}
              {role === "ADMIN" || role === "ADMIN_ASSISTANT"
                ? "（管理者として閲覧しています。編集はできません。）"
                : null}
            </p>
          </header>

          {formPreview ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              パートナーレポートフォームのプレビューです。セッション終了後に入力・保存できます。
            </p>
          ) : null}

          {!formPreview && (role === "ADMIN" || role === "ADMIN_ASSISTANT") && !detail.report ? (
            <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-sm text-zinc-600">
              まだパートナーのレポートは提出されていません。
            </p>
          ) : null}

          {role === "PARTNER" || (formPreview && (role === "ADMIN" || role === "ADMIN_ASSISTANT")) ? (
            <form
              onSubmit={formPreview ? (e) => e.preventDefault() : onSubmitReport}
              className="space-y-5"
            >
              {SESSION_REPORT_FIELDS.map((field) => (
                <label key={field.key} className="block space-y-1 text-base font-medium text-zinc-900">
                  {field.label}
                  {field.required ? <span className="text-red-600"> *</span> : null}
                  <textarea
                    value={reportAnswers[field.key]}
                    onChange={(e) =>
                      setReportAnswers((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    rows={field.rows ?? 4}
                    maxLength={4000}
                    required={!formPreview && field.required}
                    disabled={formPreview || role !== "PARTNER"}
                    placeholder={formPreview ? "（セッション後に入力）" : undefined}
                    className={`mt-1 w-full rounded-lg border bg-white px-3 py-2 text-base disabled:cursor-not-allowed disabled:bg-zinc-50 ${
                      field.key === "partnerReflection" && partnerReflectionTooLong
                        ? "border-red-400"
                        : "border-zinc-300"
                    }`}
                  />
                  {!formPreview && field.key === "partnerReflection" ? (
                    <span className="mt-1 block text-xs text-zinc-500">
                      {field.hint}（現在 {partnerReflectionLength} 字）
                    </span>
                  ) : null}
                </label>
              ))}

              {detail.partnerExtraQuestions.length > 0 ? (
                <fieldset
                  disabled={formPreview || role !== "PARTNER"}
                  className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/40 px-4 py-3"
                >
                  <legend className="px-1 text-base font-semibold text-amber-900">
                    {detail.sessionNumber} 回目の追加質問
                  </legend>
                  {detail.partnerExtraQuestions.map((q, i) => (
                    <label key={i} className="block space-y-1 text-sm font-medium text-zinc-900">
                      {q} <span className="text-red-600">*</span>
                      <textarea
                        value={extraAnswers[i] ?? ""}
                        onChange={(e) =>
                          setExtraAnswers((prev) => ({ ...prev, [i]: e.target.value }))
                        }
                        rows={4}
                        maxLength={4000}
                        required={!formPreview}
                        disabled={formPreview || role !== "PARTNER"}
                        placeholder={formPreview ? "（セッション後に入力）" : undefined}
                        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base disabled:cursor-not-allowed disabled:bg-zinc-50"
                      />
                    </label>
                  ))}
                </fieldset>
              ) : null}

              {role === "PARTNER" && !formPreview ? (
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
              ) : null}
            </form>
          ) : (
            detail.report && (
              <dl className="grid gap-3 text-sm">
                {SESSION_REPORT_FIELDS.map((field) => (
                  <ReadOnlyItem
                    key={field.key}
                    label={field.label}
                    value={parseSessionReportAnswers(detail.report!)[field.key]}
                  />
                ))}
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
