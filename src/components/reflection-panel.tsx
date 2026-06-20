"use client";

import { useCallback, useEffect, useState } from "react";
import { REFLECTION_FIELDS, type ReflectionSheet } from "@/lib/companion-reflection";
import type { SkillCheckProfile } from "@/lib/skill-check";
import type { PdcaEntry } from "@/lib/companion-pdca";

type Skill = { id: string; name: string };

export function ReflectionPanel({ matchId }: { matchId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sheet, setSheet] = useState<ReflectionSheet | null>(null);
  const [skillProfile, setSkillProfile] = useState<SkillCheckProfile | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [pdcaEntries, setPdcaEntries] = useState<PdcaEntry[]>([]);
  const [canEdit, setCanEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/matches/${matchId}/reflection`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError((json as { error?: string })?.error ?? "読み込みに失敗しました。");
      return;
    }
    setSheet((json as { sheet?: ReflectionSheet }).sheet ?? null);
    setSkillProfile((json as { skillProfile?: SkillCheckProfile }).skillProfile ?? null);
    setSkills((json as { skills?: Skill[] }).skills ?? []);
    setPdcaEntries((json as { pdcaEntries?: PdcaEntry[] }).pdcaEntries ?? []);
    setCanEdit(Boolean((json as { permissions?: { canEditClient?: boolean } }).permissions?.canEditClient));
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!sheet) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/matches/${matchId}/reflection`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sheet),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError((json as { error?: string })?.error ?? "保存に失敗しました。");
      return;
    }
    setSheet((json as { sheet?: ReflectionSheet }).sheet ?? sheet);
    setNotice("保存しました。");
  }

  const skillName = new Map(skills.map((s) => [s.id, s.name]));

  function skillDelta(skillId: string) {
    const b = skillProfile?.baseline[skillId];
    const c = skillProfile?.current[skillId];
    if (!b?.selfScore && !c?.selfScore) return null;
    const bs = b?.selfScore ?? 0;
    const cs = c?.selfScore ?? 0;
    return cs - bs;
  }

  if (loading) return <p className="text-sm text-slate-500">読込中…</p>;
  if (!sheet) return <p className="text-sm text-red-700">{error ?? "読み込みに失敗しました。"}</p>;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">振り返りシート</h2>
        <p className="mt-2 text-sm text-slate-600">最終月に、活動を通じた変化を言語化します。</p>
      </div>

      {(skillProfile?.focusSkillIds.length ?? 0) > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">スキル評価の変化（本人）</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {skillProfile!.focusSkillIds.map((id) => {
              const d = skillDelta(id);
              return (
                <li key={id}>
                  {skillName.get(id) ?? id}: 開始 {skillProfile?.baseline[id]?.selfScore ?? "—"} → 終了{" "}
                  {skillProfile?.current[id]?.selfScore ?? "—"}
                  {d !== null ? `（${d > 0 ? "+" : ""}${d}）` : ""}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {pdcaEntries.length > 0 ? (
        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">PDCA記録を参照</summary>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {pdcaEntries.slice(0, 8).map((e) => (
              <li key={e.id}>
                <strong>{e.periodLabel || e.id}</strong> — {e.focusTheme || "（テーマなし）"}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="space-y-4">
        {REFLECTION_FIELDS.map(({ key, label }) => (
          <label key={key} className="block text-sm">
            <span className="font-semibold text-slate-900">{label}</span>
            <textarea
              rows={3}
              disabled={!canEdit}
              value={String(sheet[key] ?? "")}
              onChange={(e) => setSheet({ ...sheet, [key]: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
        ))}
      </div>

      {canEdit ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存する"}
        </button>
      ) : (
        <p className="text-sm text-slate-500">閲覧のみ可能です。</p>
      )}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-800">{notice}</p> : null}
    </section>
  );
}
