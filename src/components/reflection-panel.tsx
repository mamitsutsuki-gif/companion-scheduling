"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { REFLECTION_FIELDS, type ReflectionSheet } from "@/lib/companion-reflection";
import {
  criteriaLabel,
  emptySkillAssessment,
  needsScoreReason,
  scoreGap,
  SKILL_CHECK_REASON_REQUIRED_MIN_SCORE,
  SKILL_CHECK_REASON_TEXT_MAX,
  type SkillAssessmentEntry,
  type SkillCheckProfile,
  type SkillDefinition,
  type SkillScore,
} from "@/lib/skill-check";
import type { PdcaEntry } from "@/lib/companion-pdca";
import { scoreSelectValue } from "@/components/skill-radar-chart";

type Skill = { id: string; name: string };

function parseScore(raw: string): SkillScore | null {
  if (!raw) return null;
  const n = Number(raw);
  if (n < 1 || n > 5) return null;
  return Math.round(n) as SkillScore;
}

export function ReflectionPanel({ matchId }: { matchId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAfter, setSavingAfter] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sheet, setSheet] = useState<ReflectionSheet | null>(null);
  const [skillProfile, setSkillProfile] = useState<SkillCheckProfile | null>(null);
  const [skills, setSkills] = useState<SkillDefinition[] | Skill[]>([]);
  const [pdcaEntries, setPdcaEntries] = useState<PdcaEntry[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [canEditSelfAfter, setCanEditSelfAfter] = useState(false);
  const [canEditManagerAfter, setCanEditManagerAfter] = useState(false);
  const [afterDraft, setAfterDraft] = useState<Record<string, SkillAssessmentEntry>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/matches/${matchId}/reflection`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError((json as { error?: string })?.error ?? "読み込みに失敗しました。");
      return;
    }
    const profile = (json as { skillProfile?: SkillCheckProfile }).skillProfile ?? null;
    setSheet((json as { sheet?: ReflectionSheet }).sheet ?? null);
    setSkillProfile(profile);
    setSkills((json as { skills?: SkillDefinition[] }).skills ?? []);
    setPdcaEntries((json as { pdcaEntries?: PdcaEntry[] }).pdcaEntries ?? []);
    const perms = (json as {
      permissions?: {
        canEditClient?: boolean;
        canEditSelfAfter?: boolean;
        canEditManagerAfter?: boolean;
      };
    }).permissions;
    setCanEdit(Boolean(perms?.canEditClient));
    setCanEditSelfAfter(Boolean(perms?.canEditSelfAfter));
    setCanEditManagerAfter(Boolean(perms?.canEditManagerAfter));

    const focusIds = profile?.focusSkillIds ?? [];
    const draft: Record<string, SkillAssessmentEntry> = {};
    for (const id of focusIds) {
      const cur = profile?.current[id];
      draft[id] = {
        selfScore: cur?.selfScore ?? null,
        managerScore: cur?.managerScore ?? null,
        selfReason: cur?.selfReason ?? "",
        managerReason: cur?.managerReason ?? "",
      };
    }
    setAfterDraft(draft);
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const skillNameMap = useMemo(() => new Map(skills.map((s) => [s.id, s.name])), [skills]);

  const focusSkills = useMemo(() => {
    const ids = skillProfile?.focusSkillIds ?? [];
    return ids.map((id) => {
      const def = (skills as SkillDefinition[]).find((s) => s.id === id);
      return {
        id,
        name: def?.name ?? skillNameMap.get(id) ?? id,
        criteria: def?.criteria,
      };
    });
  }, [skillProfile, skills, skillNameMap]);

  function setAfterScore(skillId: string, field: "selfScore" | "managerScore", raw: string) {
    const score = parseScore(raw);
    setAfterDraft((prev) => {
      const prevRow = prev[skillId] ?? emptySkillAssessment();
      return {
        ...prev,
        [skillId]: {
          ...prevRow,
          selfScore: field === "selfScore" ? score : prevRow.selfScore,
          managerScore: field === "managerScore" ? score : prevRow.managerScore,
        },
      };
    });
  }

  function setAfterReason(skillId: string, field: "selfReason" | "managerReason", value: string) {
    setAfterDraft((prev) => {
      const prevRow = prev[skillId] ?? emptySkillAssessment();
      return {
        ...prev,
        [skillId]: {
          ...prevRow,
          [field]: value.slice(0, SKILL_CHECK_REASON_TEXT_MAX),
        },
      };
    });
  }

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
    setNotice("振り返りを保存しました。");
  }

  async function saveAfterScores() {
    if (focusSkills.length === 0) return;
    setSavingAfter(true);
    setError(null);
    setNotice(null);
    const assessments: Record<
      string,
      {
        selfScore?: SkillScore | null;
        managerScore?: SkillScore | null;
        selfReason?: string;
        managerReason?: string;
      }
    > = {};
    for (const skill of focusSkills) {
      const row = afterDraft[skill.id] ?? emptySkillAssessment();
      if (canEditSelfAfter && needsScoreReason(row.selfScore) && !row.selfReason.trim()) {
        setError(
          `「${skill.name}」の本人評価が${SKILL_CHECK_REASON_REQUIRED_MIN_SCORE}点以上のため、評価理由（具体的な事例）を記入してください。`,
        );
        setSavingAfter(false);
        return;
      }
      if (canEditManagerAfter && needsScoreReason(row.managerScore) && !row.managerReason.trim()) {
        setError(
          `「${skill.name}」の上司評価が${SKILL_CHECK_REASON_REQUIRED_MIN_SCORE}点以上のため、評価理由（具体的な事例）を記入してください。`,
        );
        setSavingAfter(false);
        return;
      }
      const entry: {
        selfScore?: SkillScore | null;
        managerScore?: SkillScore | null;
        selfReason?: string;
        managerReason?: string;
      } = {};
      if (canEditSelfAfter) {
        entry.selfScore = row.selfScore;
        entry.selfReason = row.selfReason;
      }
      if (canEditManagerAfter) {
        entry.managerScore = row.managerScore;
        entry.managerReason = row.managerReason;
      }
      if (Object.keys(entry).length > 0) assessments[skill.id] = entry;
    }
    const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/skill-check`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase: "current", assessments }),
    });
    const json = await res.json().catch(() => null);
    setSavingAfter(false);
    if (!res.ok) {
      setError((json as { error?: string })?.error ?? "アフター評価の保存に失敗しました。");
      return;
    }
    const profile = (json as { profile?: SkillCheckProfile }).profile;
    if (profile) {
      setSkillProfile(profile);
      const draft: Record<string, SkillAssessmentEntry> = {};
      for (const id of profile.focusSkillIds) {
        const cur = profile.current[id];
        draft[id] = {
          selfScore: cur?.selfScore ?? null,
          managerScore: cur?.managerScore ?? null,
          selfReason: cur?.selfReason ?? "",
          managerReason: cur?.managerReason ?? "",
        };
      }
      setAfterDraft(draft);
    }
    setNotice("アフタースキルチェックを保存しました。");
  }

  if (loading) return <p className="text-sm text-slate-500">読込中…</p>;
  if (!sheet) return <p className="text-sm text-red-700">{error ?? "読み込みに失敗しました。"}</p>;

  const canSaveAfter = canEditSelfAfter || canEditManagerAfter;

  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">振り返りシート</h2>
        <p className="mt-2 text-sm text-slate-600">
          最終月に、活動を通じた変化を言語化します。はじめに重点育成項目のアフター評価を更新し、そのうえで振り返りを書きます。
        </p>
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 sm:p-5 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-indigo-950">アフタースキルチェック（重点育成項目）</h3>
          <p className="mt-1 text-sm text-indigo-900/90">
            スキルチェック開始時に選んだ重点育成項目だけを、本人・上司で再評価します。
            {SKILL_CHECK_REASON_REQUIRED_MIN_SCORE}
            点以上を付ける場合は、標準より高い水準の具体的な事例を理由欄に書いてください。
          </p>
        </div>

        {focusSkills.length === 0 ? (
          <p className="rounded-lg border border-dashed border-indigo-200 bg-white px-3 py-4 text-sm text-indigo-900">
            重点育成項目がまだありません。スキルチェックシートで 1〜3
            項目を選んでから、ここに戻ってください。
          </p>
        ) : (
          <ul className="space-y-4">
            {focusSkills.map((skill) => {
              const baseline = skillProfile?.baseline[skill.id];
              const after = afterDraft[skill.id] ?? emptySkillAssessment();
              const gap = scoreGap(after.selfScore, after.managerScore);
              const criteria = skill.criteria;
              return (
                <li key={skill.id} className="rounded-xl border border-white bg-white/95 p-4 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="font-semibold text-slate-900">{skill.name}</h4>
                    {gap !== null ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        アフター評価ギャップ: {gap > 0 ? `+${gap}` : gap}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    開始時（参考）: 本人 {baseline?.selfScore ?? "—"} / 上司{" "}
                    {baseline?.managerScore ?? "—"}
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="block text-sm">
                        <span className="font-semibold text-indigo-900">アフター本人評価</span>
                        <select
                          value={scoreSelectValue(after.selfScore)}
                          disabled={!canEditSelfAfter}
                          onChange={(e) => setAfterScore(skill.id, "selfScore", e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                        >
                          <option value="">未入力</option>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>
                              {n}点
                              {criteria
                                ? ` — ${criteriaLabel(criteria, n as SkillScore)}`
                                : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm">
                        <span className="font-medium text-slate-800">
                          本人評価の理由
                          {needsScoreReason(after.selfScore) ? (
                            <span className="ml-1 text-xs font-semibold text-rose-700">
                              （{SKILL_CHECK_REASON_REQUIRED_MIN_SCORE}点以上は必須）
                            </span>
                          ) : null}
                        </span>
                        <textarea
                          rows={3}
                          value={after.selfReason}
                          disabled={!canEditSelfAfter}
                          maxLength={SKILL_CHECK_REASON_TEXT_MAX}
                          placeholder="例：他部署との定例を自ら設定し、3件の調整を完了させた"
                          onChange={(e) => setAfterReason(skill.id, "selfReason", e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 disabled:bg-slate-100"
                        />
                      </label>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm">
                        <span className="font-semibold text-emerald-900">アフター上司評価</span>
                        <select
                          value={scoreSelectValue(after.managerScore)}
                          disabled={!canEditManagerAfter}
                          onChange={(e) => setAfterScore(skill.id, "managerScore", e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                        >
                          <option value="">未入力</option>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>
                              {n}点
                              {criteria
                                ? ` — ${criteriaLabel(criteria, n as SkillScore)}`
                                : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm">
                        <span className="font-medium text-slate-800">
                          上司評価の理由
                          {needsScoreReason(after.managerScore) ? (
                            <span className="ml-1 text-xs font-semibold text-rose-700">
                              （{SKILL_CHECK_REASON_REQUIRED_MIN_SCORE}点以上は必須）
                            </span>
                          ) : null}
                        </span>
                        <textarea
                          rows={3}
                          value={after.managerReason}
                          disabled={!canEditManagerAfter}
                          maxLength={SKILL_CHECK_REASON_TEXT_MAX}
                          placeholder="例：関係部署から『調整が早い』と具体的な評価を受けている"
                          onChange={(e) => setAfterReason(skill.id, "managerReason", e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 disabled:bg-slate-100"
                        />
                      </label>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {canSaveAfter && focusSkills.length > 0 ? (
          <button
            type="button"
            disabled={savingAfter}
            onClick={() => void saveAfterScores()}
            className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {savingAfter ? "保存中…" : "アフター評価を保存する"}
          </button>
        ) : focusSkills.length > 0 ? (
          <p className="text-sm text-slate-500">アフター評価は閲覧のみです。</p>
        ) : null}
      </div>

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
        <h3 className="text-lg font-semibold text-slate-900">活動の振り返り</h3>
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
          {saving ? "保存中…" : "振り返りを保存する"}
        </button>
      ) : (
        <p className="text-sm text-slate-500">振り返り本文は閲覧のみ可能です。</p>
      )}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-800">{notice}</p> : null}
    </section>
  );
}
