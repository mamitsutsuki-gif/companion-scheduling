"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SummaryReportDoc } from "@/lib/companion-summary";
import type { SkillCheckProfile, SkillDefinition } from "@/lib/skill-check";
import { resolveEffectiveSkillDefinitions } from "@/lib/skill-check";
import { SkillRadarChart } from "@/components/skill-radar-chart";

type SummaryReportPermissions = {
  canEditAdminSummary: boolean;
  canEditPartnerComment: boolean;
  commentsPublished: boolean;
  canViewComments: boolean;
  canPublishComments: boolean;
};

const defaultPerms: SummaryReportPermissions = {
  canEditAdminSummary: false,
  canEditPartnerComment: false,
  commentsPublished: false,
  canViewComments: true,
  canPublishComments: false,
};

export function SummaryReportPanel({ matchId }: { matchId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [adminDoc, setAdminDoc] = useState<SummaryReportDoc | null>(null);
  const [perms, setPerms] = useState<SummaryReportPermissions>(defaultPerms);

  const applyPayload = useCallback((json: Record<string, unknown>) => {
    setData(json);
    setAdminDoc((json as { adminDoc?: SummaryReportDoc }).adminDoc ?? null);
    setPerms({ ...defaultPerms, ...((json as { permissions?: Partial<SummaryReportPermissions> }).permissions ?? {}) });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/matches/${matchId}/summary-report`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError((json as { error?: string })?.error ?? "読み込みに失敗しました。");
      return;
    }
    applyPayload(json as Record<string, unknown>);
  }, [matchId, applyPayload]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!adminDoc) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/matches/${matchId}/summary-report`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        coachComment: adminDoc.coachComment,
        motiveSummary: adminDoc.motiveSummary,
        recommendations: adminDoc.recommendations,
      }),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError((json as { error?: string })?.error ?? "保存に失敗しました。");
      return;
    }
    applyPayload(json as Record<string, unknown>);
    setNotice("保存しました。");
  }

  async function publishComments() {
    setPublishing(true);
    setError(null);
    const res = await fetch(`/api/matches/${matchId}/summary-report`, { method: "POST" });
    const json = await res.json().catch(() => null);
    setPublishing(false);
    if (!res.ok) {
      setError((json as { error?: string })?.error ?? "提出に失敗しました。");
      return;
    }
    applyPayload(json as Record<string, unknown>);
    setNotice("コメントを上司・人事に公開しました。");
  }

  const skillProfile = (data?.skillProfile as SkillCheckProfile | null | undefined) ?? null;
  const companySkills = (data?.skills as SkillDefinition[] | undefined) ?? [];
  const focusRadar = useMemo(() => {
    if (!skillProfile?.focusSkillIds?.length) return null;
    const defs = resolveEffectiveSkillDefinitions(skillProfile, companySkills);
    const nameById = new Map(defs.map((s) => [s.id, s.name]));
    const ids = skillProfile.focusSkillIds;
    const labels = ids.map((id) => nameById.get(id) ?? id);
    return {
      labels,
      before: [
        {
          label: "本人",
          color: "#4f46e5",
          values: ids.map((id) => skillProfile.baseline[id]?.selfScore ?? null),
        },
        {
          label: "上司",
          color: "#059669",
          values: ids.map((id) => skillProfile.baseline[id]?.managerScore ?? null),
        },
      ],
      after: [
        {
          label: "本人",
          color: "#4f46e5",
          values: ids.map((id) => skillProfile.current[id]?.selfScore ?? null),
        },
        {
          label: "上司",
          color: "#059669",
          values: ids.map((id) => skillProfile.current[id]?.managerScore ?? null),
        },
      ],
    };
  }, [skillProfile, companySkills]);

  if (loading) return <p className="text-sm text-slate-500">読込中…</p>;
  if (!data || !adminDoc) return <p className="text-sm text-red-700">{error ?? "読み込みに失敗しました。"}</p>;

  const targetName = String(data.targetName ?? "");
  const focusSkillNames = (data.focusSkillNames as string[]) ?? [];
  const pdca = data.pdca as { entries?: unknown[]; skillCounts?: Array<{ skillName: string; count: number }> } | undefined;
  const reflection = data.reflection as Record<string, string> | undefined;
  const fta = data.fta as { vision?: { text?: string } } | undefined;
  const canEditComments = perms.canEditPartnerComment || perms.canEditAdminSummary;

  return (
    <section className="summary-report-print space-y-6">
      <div className="no-print flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">総括レポート</h2>
          <p className="mt-2 text-sm text-slate-600">
            これまでのシートの内容をまとめた最終レポートです。印刷機能から PDF として保存できます。
          </p>
          {canEditComments && !perms.commentsPublished ? (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              コメント3項目は、運用管理者が「上司・人事に提出」するまで、クライアント管理者・クライアント人事には表示されません。
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800"
        >
          PDFとして出力（印刷）
        </button>
      </div>

      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs print:border-0 print:shadow-none">
        <h3 className="text-xl font-bold text-slate-900">総括レポート — {targetName}さん</h3>

        <section className="mt-6">
          <h4 className="font-semibold text-slate-900">1. 対象者概要</h4>
          <p className="mt-1 text-sm text-slate-700">対象者: {targetName}</p>
        </section>

        <section className="mt-6">
          <h4 className="font-semibold text-slate-900">2. 重点育成テーマ</h4>
          <p className="mt-1 text-sm text-slate-700">
            {focusSkillNames.length > 0 ? focusSkillNames.join("、") : "（未設定）"}
          </p>
          {focusRadar ? (
            <div className="mt-4">
              <p className="text-sm font-medium text-slate-800">重点育成項目の Before / After</p>
              <p className="mt-1 text-xs text-slate-500">
                左が開始時、右が終了時です。それぞれ本人評価と上司評価を表示します。
              </p>
              <div className="mt-4 grid gap-6 md:grid-cols-2">
                <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  <p className="text-center text-sm font-semibold text-slate-800">開始時</p>
                  <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs text-slate-600">
                    {focusRadar.before.map((s) => (
                      <span key={`b-${s.label}`} className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                        {s.label}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2">
                    <SkillRadarChart labels={focusRadar.labels} series={focusRadar.before} size={360} />
                  </div>
                </div>
                <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  <p className="text-center text-sm font-semibold text-slate-800">終了時</p>
                  <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs text-slate-600">
                    {focusRadar.after.map((s) => (
                      <span key={`a-${s.label}`} className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                        {s.label}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2">
                    <SkillRadarChart labels={focusRadar.labels} series={focusRadar.after} size={360} />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">重点育成項目のスコアがまだありません。</p>
          )}
        </section>

        <section className="mt-6">
          <h4 className="font-semibold text-slate-900">3. 行動変容の記録（PDCA）</h4>
          {pdca?.skillCounts && pdca.skillCounts.length > 0 ? (
            <ul className="mt-2 text-sm text-slate-700">
              {pdca.skillCounts.map((r) => (
                <li key={r.skillName}>
                  {r.skillName}: {r.count}件
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">記録なし</p>
          )}
        </section>

        <section className="mt-6">
          <h4 className="font-semibold text-slate-900">4. 自分FTA（ありたい姿）</h4>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{fta?.vision?.text || "（未入力）"}</p>
        </section>

        <section className="mt-6">
          <h4 className="font-semibold text-slate-900">5. 本人の振り返り</h4>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
            {reflection?.changedThrough || reflection?.becameAbleTo || "（未入力）"}
          </p>
        </section>

        {!perms.canViewComments ? (
          <section className="mt-6">
            <h4 className="font-semibold text-slate-900">6. コメント（パートナー・モチベイジ）</h4>
            <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950">
              コメントはまだ提出されていません。モチベイジによる確認・提出後に表示されます。
            </p>
          </section>
        ) : canEditComments ? (
          <section className="mt-6 space-y-3 no-print">
            <h4 className="font-semibold text-slate-900">6. コメント（パートナー・モチベイジ）</h4>
            <label className="block text-sm">
              <span className="font-semibold">パートナー所見</span>
              <textarea
                rows={4}
                disabled={!perms.canEditPartnerComment}
                value={adminDoc.coachComment}
                onChange={(e) => setAdminDoc({ ...adminDoc, coachComment: e.target.value })}
                className="mt-1 w-full rounded-lg border px-3 py-2 disabled:bg-slate-100 disabled:text-slate-600"
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">モチベイジ総括コメント</span>
              <textarea
                rows={4}
                disabled={!perms.canEditAdminSummary}
                value={adminDoc.motiveSummary}
                onChange={(e) => setAdminDoc({ ...adminDoc, motiveSummary: e.target.value })}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">今後の提言</span>
              <textarea
                rows={4}
                disabled={!perms.canEditAdminSummary}
                value={adminDoc.recommendations}
                onChange={(e) => setAdminDoc({ ...adminDoc, recommendations: e.target.value })}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "保存中…" : "コメントを保存"}
              </button>
              {perms.canPublishComments && !perms.commentsPublished ? (
                <button
                  type="button"
                  disabled={publishing}
                  onClick={() => void publishComments()}
                  className="rounded-xl border border-emerald-600 bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {publishing ? "提出中…" : "上司・人事に提出する"}
                </button>
              ) : null}
            </div>
          </section>
        ) : (
          <section className="mt-6 space-y-4">
            <h4 className="font-semibold text-slate-900">6. コメント（パートナー・モチベイジ）</h4>
            <div>
              <p className="text-sm font-semibold text-slate-800">パートナー所見</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                {adminDoc.coachComment || "（未入力）"}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">モチベイジ総括コメント</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                {adminDoc.motiveSummary || "（未入力）"}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">今後の提言</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                {adminDoc.recommendations || "（未入力）"}
              </p>
            </div>
          </section>
        )}

        {perms.canViewComments ? (
          <section className="mt-6 print-only hidden print:block">
            <h4 className="font-semibold">パートナー所見</h4>
            <p className="whitespace-pre-wrap text-sm">{adminDoc.coachComment}</p>
            <h4 className="mt-4 font-semibold">モチベイジ総括</h4>
            <p className="whitespace-pre-wrap text-sm">{adminDoc.motiveSummary}</p>
            <h4 className="mt-4 font-semibold">今後の提言</h4>
            <p className="whitespace-pre-wrap text-sm">{adminDoc.recommendations}</p>
          </section>
        ) : null}
      </article>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-800">{notice}</p> : null}
    </section>
  );
}
