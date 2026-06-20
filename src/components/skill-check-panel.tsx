"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  criteriaLabel,
  scoreGap,
  type SkillAssessmentEntry,
  type SkillCheckPhase,
  type SkillCheckProfile,
  type SkillDefinition,
  type SkillScore,
} from "@/lib/skill-check";
import { SkillRadarChart, scoreSelectValue } from "@/components/skill-radar-chart";

type Permissions = {
  canEditSelf: boolean;
  canEditManager: boolean;
  canEditFocusSkills: boolean;
};

type ApiPayload = {
  skills: SkillDefinition[];
  profile: SkillCheckProfile;
  targetName: string;
  permissions: Permissions;
};

function parseScore(raw: string): SkillScore | null {
  if (!raw) return null;
  const n = Number(raw);
  if (n < 1 || n > 5) return null;
  return Math.round(n) as SkillScore;
}

export function SkillCheckPanel({ matchId, userId }: { matchId?: string; userId?: string }) {
  const apiPath =
    userId != null
      ? `/api/skill-check/users/${encodeURIComponent(userId)}`
      : matchId != null
        ? `/api/matches/${encodeURIComponent(matchId)}/skill-check`
        : null;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [phase, setPhase] = useState<SkillCheckPhase>("baseline");
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [profile, setProfile] = useState<SkillCheckProfile | null>(null);
  const [targetName, setTargetName] = useState("");
  const [permissions, setPermissions] = useState<Permissions>({
    canEditSelf: false,
    canEditManager: false,
    canEditFocusSkills: false,
  });
  const [draft, setDraft] = useState<Record<string, SkillAssessmentEntry>>({});
  const [focusSkillIds, setFocusSkillIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!apiPath) {
      setError("表示対象が指定されていません。");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiPath, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as (ApiPayload & { error?: string }) | null;
      if (!res.ok) {
        setError(json?.error ?? "読み込みに失敗しました。");
        return;
      }
      setSkills(json?.skills ?? []);
      setProfile(json?.profile ?? null);
      setTargetName(json?.targetName ?? "");
      setPermissions(
        json?.permissions ?? {
          canEditSelf: false,
          canEditManager: false,
          canEditFocusSkills: false,
        },
      );
      const p = json?.profile;
      if (p) {
        setFocusSkillIds(p.focusSkillIds ?? []);
        setDraft(p.baseline ?? {});
      }
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }, [apiPath]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!profile) return;
    setDraft(phase === "baseline" ? { ...profile.baseline } : { ...profile.current });
  }, [phase, profile]);

  const chartLabels = useMemo(() => skills.map((s) => s.name), [skills]);

  const chartSeries = useMemo(() => {
    const selfValues = skills.map((s) => draft[s.id]?.selfScore ?? null);
    const managerValues = skills.map((s) => draft[s.id]?.managerScore ?? null);
    return [
      { label: "本人評価", color: "#4f46e5", values: selfValues },
      { label: "上司評価", color: "#059669", values: managerValues },
    ];
  }, [skills, draft]);

  function setScore(skillId: string, field: "selfScore" | "managerScore", raw: string) {
    const score = parseScore(raw);
    setDraft((prev) => ({
      ...prev,
      [skillId]: {
        selfScore: field === "selfScore" ? score : (prev[skillId]?.selfScore ?? null),
        managerScore: field === "managerScore" ? score : (prev[skillId]?.managerScore ?? null),
      },
    }));
  }

  function toggleFocusSkill(skillId: string) {
    if (!permissions.canEditFocusSkills) return;
    setFocusSkillIds((prev) => {
      if (prev.includes(skillId)) return prev.filter((id) => id !== skillId);
      if (prev.length >= 5) return prev;
      return [...prev, skillId];
    });
  }

  async function save() {
    if (!apiPath) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payloadAssessments: Record<
        string,
        { selfScore?: SkillScore | null; managerScore?: SkillScore | null }
      > = {};
      for (const skill of skills) {
        const row = draft[skill.id] ?? { selfScore: null, managerScore: null };
        const entry: { selfScore?: SkillScore | null; managerScore?: SkillScore | null } = {};
        if (permissions.canEditSelf) entry.selfScore = row.selfScore;
        if (permissions.canEditManager) entry.managerScore = row.managerScore;
        if (Object.keys(entry).length > 0) payloadAssessments[skill.id] = entry;
      }
      const body: Record<string, unknown> = {
        phase,
        assessments: payloadAssessments,
      };
      if (permissions.canEditFocusSkills) body.focusSkillIds = focusSkillIds;

      const res = await fetch(apiPath, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError((json as { error?: string } | null)?.error ?? "保存に失敗しました。");
        return;
      }
      setProfile((json as { profile?: SkillCheckProfile }).profile ?? profile);
      setNotice("保存しました。");
    } catch {
      setError("保存中にネットワークエラーが発生しました。");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">読込中…</p>;
  if (error && !profile) return <p className="text-sm text-red-700">{error}</p>;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">スキルチェックシート</h2>
        <p className="mt-2 text-sm text-slate-600">
          {targetName ? `${targetName} さんの` : ""}
          スキル評価を記録し、重点育成テーマを決めます。後続の自分FTA・PDCA・振り返り・総括レポートと連動します。
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["baseline", "current"] as SkillCheckPhase[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPhase(p)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              phase === p
                ? "bg-indigo-700 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {p === "baseline" ? "開始時評価" : "終了時評価"}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <h3 className="text-base font-semibold text-slate-900">レーダーチャート</h3>
          <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-indigo-600" />
              本人評価
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              上司評価
            </span>
          </div>
          <SkillRadarChart labels={chartLabels} series={chartSeries} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <h3 className="text-base font-semibold text-slate-900">重点育成スキル</h3>
          <p className="mt-1 text-sm text-slate-600">本人と上司が話し合い、重点的に取り組むスキルを最大5つ選びます。</p>
          <ul className="mt-4 space-y-2">
            {skills.map((skill) => {
              const selected = focusSkillIds.includes(skill.id);
              return (
                <li key={skill.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={!permissions.canEditFocusSkills}
                      onChange={() => toggleFocusSkill(skill.id)}
                    />
                    <span className="text-sm font-medium text-slate-800">{skill.name}</span>
                    {skill.kind === "company" ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                        企業独自
                      </span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="space-y-4">
        {skills.map((skill) => {
          const row = draft[skill.id] ?? { selfScore: null, managerScore: null };
          const gap = scoreGap(row.selfScore, row.managerScore);
          return (
            <article key={skill.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-slate-900">{skill.name}</h3>
                {gap !== null ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    評価ギャップ: {gap > 0 ? `+${gap}` : gap}
                  </span>
                ) : null}
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-semibold text-indigo-900">本人評価</span>
                  <select
                    value={scoreSelectValue(row.selfScore)}
                    disabled={!permissions.canEditSelf}
                    onChange={(e) => setScore(skill.id, "selfScore", e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="">未入力</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}点 — {criteriaLabel(skill.criteria, n as SkillScore)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-semibold text-emerald-900">上司評価</span>
                  <select
                    value={scoreSelectValue(row.managerScore)}
                    disabled={!permissions.canEditManager}
                    onChange={(e) => setScore(skill.id, "managerScore", e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="">未入力</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}点 — {criteriaLabel(skill.criteria, n as SkillScore)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </article>
          );
        })}
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-800">{notice}</p> : null}

      {permissions.canEditSelf || permissions.canEditManager || permissions.canEditFocusSkills ? (
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-xl bg-indigo-700 px-5 py-2.5 text-base font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存する"}
        </button>
      ) : (
        <p className="text-sm text-slate-500">閲覧のみ可能です。</p>
      )}
    </section>
  );
}
