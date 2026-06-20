"use client";

import { useCallback, useEffect, useState } from "react";
import type { SummaryReportDoc } from "@/lib/companion-summary";

export function SummaryReportPanel({ matchId }: { matchId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [adminDoc, setAdminDoc] = useState<SummaryReportDoc | null>(null);
  const [perms, setPerms] = useState({ canEditAdminSummary: false, canEditCoach: false });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/matches/${matchId}/summary-report`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError((json as { error?: string })?.error ?? "読み込みに失敗しました。");
      return;
    }
    setData(json as Record<string, unknown>);
    setAdminDoc((json as { adminDoc?: SummaryReportDoc }).adminDoc ?? null);
    setPerms((json as { permissions?: typeof perms }).permissions ?? perms);
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!adminDoc) return;
    setSaving(true);
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
    setAdminDoc((json as { adminDoc?: SummaryReportDoc }).adminDoc ?? adminDoc);
    setNotice("保存しました。");
  }

  if (loading) return <p className="text-sm text-slate-500">読込中…</p>;
  if (!data || !adminDoc) return <p className="text-sm text-red-700">{error ?? "読み込みに失敗しました。"}</p>;

  const targetName = String(data.targetName ?? "");
  const focusSkillNames = (data.focusSkillNames as string[]) ?? [];
  const pdca = data.pdca as { entries?: unknown[]; skillCounts?: Array<{ skillName: string; count: number }> } | undefined;
  const reflection = data.reflection as Record<string, string> | undefined;
  const fta = data.fta as { vision?: { text?: string } } | undefined;

  return (
    <section className="summary-report-print space-y-6">
      <div className="no-print flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">総括レポート</h2>
          <p className="mt-2 text-sm text-slate-600">各成果物を統合した最終レポートです。PDFは印刷機能で出力できます。</p>
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

        <section className="mt-6 space-y-3 no-print">
          <label className="block text-sm">
            <span className="font-semibold">コーチ所見</span>
            <textarea
              rows={4}
              disabled={!perms.canEditCoach}
              value={adminDoc.coachComment}
              onChange={(e) => setAdminDoc({ ...adminDoc, coachComment: e.target.value })}
              className="mt-1 w-full rounded-lg border px-3 py-2"
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
          {(perms.canEditCoach || perms.canEditAdminSummary) && (
            <button type="button" disabled={saving} onClick={() => void save()} className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "保存中…" : "コメントを保存"}
            </button>
          )}
        </section>

        <section className="mt-6 print-only hidden print:block">
          <h4 className="font-semibold">コーチ所見</h4>
          <p className="whitespace-pre-wrap text-sm">{adminDoc.coachComment}</p>
          <h4 className="mt-4 font-semibold">モチベイジ総括</h4>
          <p className="whitespace-pre-wrap text-sm">{adminDoc.motiveSummary}</p>
          <h4 className="mt-4 font-semibold">今後の提言</h4>
          <p className="whitespace-pre-wrap text-sm">{adminDoc.recommendations}</p>
        </section>
      </article>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-800">{notice}</p> : null}
    </section>
  );
}
