"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  criteriaLabel,
  scoreGap,
  SKILL_CHECK_AGREEMENT_TEXT_MAX,
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
  canEditSkillDefinitions: boolean;
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

function newSkillId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
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
    canEditSkillDefinitions: false,
  });
  const [draft, setDraft] = useState<Record<string, SkillAssessmentEntry>>({});
  const [focusSkillIds, setFocusSkillIds] = useState<string[]>([]);
  const [clientValuesText, setClientValuesText] = useState("");
  const [clientSixMonthGoalText, setClientSixMonthGoalText] = useState("");
  const [managerCurrentRoleText, setManagerCurrentRoleText] = useState("");
  const [managerNextRoleText, setManagerNextRoleText] = useState("");
  const [editingSkills, setEditingSkills] = useState(false);
  const [skillDraft, setSkillDraft] = useState<SkillDefinition[]>([]);

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
      setSkillDraft(json?.skills ?? []);
      setProfile(json?.profile ?? null);
      setTargetName(json?.targetName ?? "");
      setPermissions(
        json?.permissions ?? {
          canEditSelf: false,
          canEditManager: false,
          canEditFocusSkills: false,
          canEditSkillDefinitions: false,
        },
      );
      const p = json?.profile;
      if (p) {
        setFocusSkillIds(p.focusSkillIds ?? []);
        setDraft(p.baseline ?? {});
        setClientValuesText(p.clientValuesText ?? "");
        setClientSixMonthGoalText(p.clientSixMonthGoalText ?? "");
        setManagerCurrentRoleText(p.managerCurrentRoleText ?? "");
        setManagerNextRoleText(p.managerNextRoleText ?? "");
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
      const activeSkills = editingSkills ? skillDraft : skills;
      if (editingSkills) {
        const names = skillDraft.map((s) => s.name.trim()).filter(Boolean);
        if (names.length === 0) {
          setError("スキル項目を1つ以上入力してください。");
          setSaving(false);
          return;
        }
        if (skillDraft.some((s) => !s.name.trim())) {
          setError("空のスキル項目名があります。削除するか名前を入力してください。");
          setSaving(false);
          return;
        }
      }

      const payloadAssessments: Record<
        string,
        { selfScore?: SkillScore | null; managerScore?: SkillScore | null }
      > = {};
      for (const skill of activeSkills) {
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
      if (permissions.canEditFocusSkills) {
        body.focusSkillIds = focusSkillIds.filter((id) => activeSkills.some((s) => s.id === id));
      }
      if (editingSkills && permissions.canEditSkillDefinitions) {
        body.skillDefinitions = skillDraft.map((s) => ({
          id: s.id,
          name: s.name.trim(),
          criteria: s.criteria,
        }));
      }
      if (permissions.canEditSelf) {
        body.clientValuesText = clientValuesText;
        body.clientSixMonthGoalText = clientSixMonthGoalText;
      }
      if (permissions.canEditManager) {
        body.managerCurrentRoleText = managerCurrentRoleText;
        body.managerNextRoleText = managerNextRoleText;
      }

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
      if (editingSkills) {
        setSkills(skillDraft.map((s) => ({ ...s, name: s.name.trim() })));
        setEditingSkills(false);
      }
      setNotice("保存しました。");
      await load();
    } catch {
      setError("保存中にネットワークエラーが発生しました。");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">読込中…</p>;
  if (error && !profile) return <p className="text-sm text-red-700">{error}</p>;

  const displaySkills = editingSkills ? skillDraft : skills;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">スキルチェックシート</h2>
        <p className="mt-2 text-sm text-slate-600">
          {targetName ? `${targetName} さんの` : ""}
          スキル評価・重点育成テーマに加え、成長・挑戦合意（大切にしたいこと／目指す状態／期待役割）を記録します。後続の自分FTA・PDCA・振り返り・総括レポートと連動します。
        </p>
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold text-indigo-950">成長・挑戦合意</h3>
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
            必須コア
          </span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
            追加
          </span>
        </div>
        <p className="mt-2 text-sm text-indigo-900/90">
          本人・上司・コーチの共有計画です。自分FTAのアクションを置き換えるものではなく、重点行動を三者が確認するための記載欄です。
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-white bg-white/90 p-4 shadow-xs">
            <h4 className="text-sm font-semibold text-slate-900">本人入力</h4>
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-slate-800">大切にしたいこと</span>
              <textarea
                value={clientValuesText}
                onChange={(e) => setClientValuesText(e.target.value.slice(0, SKILL_CHECK_AGREEMENT_TEXT_MAX))}
                disabled={!permissions.canEditSelf}
                rows={3}
                maxLength={SKILL_CHECK_AGREEMENT_TEXT_MAX}
                placeholder="例：チームの信頼を築きながら、自分の強みを活かしたい"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-slate-800">6か月後の目指す状態</span>
              <textarea
                value={clientSixMonthGoalText}
                onChange={(e) =>
                  setClientSixMonthGoalText(e.target.value.slice(0, SKILL_CHECK_AGREEMENT_TEXT_MAX))
                }
                disabled={!permissions.canEditSelf}
                rows={3}
                maxLength={SKILL_CHECK_AGREEMENT_TEXT_MAX}
                placeholder="例：部下に任せながら、部門横断の課題を自分から提案できる状態"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500"
              />
            </label>
          </div>
          <div className="space-y-3 rounded-xl border border-white bg-white/90 p-4 shadow-xs">
            <h4 className="text-sm font-semibold text-slate-900">上司入力</h4>
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-slate-800">現在期待される役割</span>
              <textarea
                value={managerCurrentRoleText}
                onChange={(e) =>
                  setManagerCurrentRoleText(e.target.value.slice(0, SKILL_CHECK_AGREEMENT_TEXT_MAX))
                }
                disabled={!permissions.canEditManager}
                rows={3}
                maxLength={SKILL_CHECK_AGREEMENT_TEXT_MAX}
                placeholder="例：チームリーダーとしての日常管理と後輩育成"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-slate-800">次に期待される役割</span>
              <textarea
                value={managerNextRoleText}
                onChange={(e) =>
                  setManagerNextRoleText(e.target.value.slice(0, SKILL_CHECK_AGREEMENT_TEXT_MAX))
                }
                disabled={!permissions.canEditManager}
                rows={3}
                maxLength={SKILL_CHECK_AGREEMENT_TEXT_MAX}
                placeholder="例：小規模プロジェクトのリード、関係部署との調整"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500"
              />
            </label>
          </div>
        </div>
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

      {permissions.canEditSkillDefinitions ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900">スキル項目の編集</h3>
              <p className="mt-1 text-sm text-slate-600">
                項目名を手入力で変更・追加・削除できます（このメンバー専用）。
              </p>
            </div>
            {!editingSkills ? (
              <button
                type="button"
                onClick={() => {
                  setSkillDraft(skills.map((s) => ({ ...s })));
                  setEditingSkills(true);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-white"
              >
                項目を編集
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSkillDraft(skills.map((s) => ({ ...s })));
                  setEditingSkills(false);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                編集をやめる
              </button>
            )}
          </div>
          {editingSkills ? (
            <ul className="mt-4 space-y-2">
              {skillDraft.map((skill, index) => (
                <li key={skill.id} className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={skill.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setSkillDraft((prev) =>
                        prev.map((s, i) => (i === index ? { ...s, name } : s)),
                      );
                    }}
                    className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    placeholder="スキル項目名"
                    maxLength={120}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSkillDraft((prev) => prev.filter((_, i) => i !== index));
                      setFocusSkillIds((prev) => prev.filter((id) => id !== skill.id));
                    }}
                    className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                  >
                    削除
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => {
                    if (skillDraft.length >= 32) return;
                    setSkillDraft((prev) => [
                      ...prev,
                      {
                        id: newSkillId(),
                        name: "",
                        kind: "company",
                        criteria: skills[0]?.criteria ?? {
                          score1: "これから伸ばしたい段階",
                          score2: "一部で発揮できている",
                          score3: "日常業務で発揮できている",
                          score4: "周囲から認識されている",
                          score5: "組織の模範として発揮できている",
                        },
                      },
                    ]);
                  }}
                  className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  ＋ 項目を追加
                </button>
              </li>
            </ul>
          ) : null}
        </div>
      ) : null}

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
            {displaySkills.map((skill) => {
              const selected = focusSkillIds.includes(skill.id);
              return (
                <li key={skill.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={!permissions.canEditFocusSkills || editingSkills}
                      onChange={() => toggleFocusSkill(skill.id)}
                    />
                    <span className="text-sm font-medium text-slate-800">{skill.name || "（未入力）"}</span>
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
        {displaySkills.map((skill) => {
          const row = draft[skill.id] ?? { selfScore: null, managerScore: null };
          const gap = scoreGap(row.selfScore, row.managerScore);
          return (
            <article key={skill.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-slate-900">{skill.name || "（未入力）"}</h3>
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
                    disabled={!permissions.canEditSelf || editingSkills}
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
                    disabled={!permissions.canEditManager || editingSkills}
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

      {permissions.canEditSelf ||
      permissions.canEditManager ||
      permissions.canEditFocusSkills ||
      (permissions.canEditSkillDefinitions && editingSkills) ? (
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-xl bg-indigo-700 px-5 py-2.5 text-base font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
        >
          {saving ? "保存中…" : editingSkills ? "項目と評価を保存する" : "保存する"}
        </button>
      ) : (
        <p className="text-sm text-slate-500">閲覧のみ可能です。</p>
      )}
    </section>
  );
}
