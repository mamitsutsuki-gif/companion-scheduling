"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  criteriaLabel,
  emptySkillAssessment,
  scoreGap,
  SKILL_CHECK_AGREEMENT_TEXT_MAX,
  SKILL_CHECK_FOCUS_MAX,
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

const PLACEHOLDER = {
  clientValues:
    "例：チームの信頼関係を大切にしながら、自分の強みを活かして貢献したい。スピードより丁寧さを優先したい。",
  clientSixMonth:
    "例：部下に任せつつ、部門横断の課題を自分から提案・推進できる状態になっている。",
  managerCurrent: "例：チームリーダーとして日常の進捗管理と後輩育成を担う役割。",
  managerNext: "例：小規模プロジェクトのリード、関係部署との調整・合意形成を担う役割。",
  skillName: "例：巻き込み力、課題設定力、対話力 など",
} as const;

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
        setFocusSkillIds((p.focusSkillIds ?? []).slice(0, SKILL_CHECK_FOCUS_MAX));
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

  // 項目編集中は下書きの項目でグラフを描く（保存前でも増減・改名が反映される）
  const displaySkills = useMemo(
    () => (editingSkills ? skillDraft : skills),
    [editingSkills, skillDraft, skills],
  );

  /** 保存していない入力があるか（開始時／終了時の切替やリロードで失われる） */
  const isDirty = useMemo(() => {
    if (!profile) return false;
    const stored = phase === "baseline" ? profile.baseline : profile.current;
    for (const skill of displaySkills) {
      const now = draft[skill.id];
      const before = stored[skill.id];
      if (!now) continue;
      if (
        now.selfScore !== (before?.selfScore ?? null) ||
        now.managerScore !== (before?.managerScore ?? null) ||
        now.selfReason !== (before?.selfReason ?? "") ||
        now.managerReason !== (before?.managerReason ?? "")
      ) {
        return true;
      }
    }
    if (focusSkillIds.join("|") !== (profile.focusSkillIds ?? []).join("|")) return true;
    if (clientValuesText !== (profile.clientValuesText ?? "")) return true;
    if (clientSixMonthGoalText !== (profile.clientSixMonthGoalText ?? "")) return true;
    if (managerCurrentRoleText !== (profile.managerCurrentRoleText ?? "")) return true;
    if (managerNextRoleText !== (profile.managerNextRoleText ?? "")) return true;
    if (editingSkills) {
      const before = skills.map((s) => `${s.id}:${s.name}`).join("|");
      const now = skillDraft.map((s) => `${s.id}:${s.name}`).join("|");
      if (before !== now) return true;
    }
    return false;
  }, [
    profile,
    phase,
    draft,
    displaySkills,
    focusSkillIds,
    clientValuesText,
    clientSixMonthGoalText,
    managerCurrentRoleText,
    managerNextRoleText,
    editingSkills,
    skills,
    skillDraft,
  ]);

  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  function changePhase(next: SkillCheckPhase) {
    if (next === phase) return;
    if (
      isDirty &&
      !confirm("保存していない入力があります。切り替えると失われます。よろしいですか？")
    ) {
      return;
    }
    setPhase(next);
  }

  const chartLabels = useMemo(
    () => displaySkills.map((s, i) => s.name.trim() || `（項目${i + 1}）`),
    [displaySkills],
  );

  const chartSeries = useMemo(() => {
    const selfValues = displaySkills.map((s) => draft[s.id]?.selfScore ?? null);
    const managerValues = displaySkills.map((s) => draft[s.id]?.managerScore ?? null);
    return [
      { label: "本人評価", color: "#4f46e5", values: selfValues },
      { label: "上司評価", color: "#059669", values: managerValues },
    ];
  }, [displaySkills, draft]);

  function setScore(skillId: string, field: "selfScore" | "managerScore", raw: string) {
    const score = parseScore(raw);
    setDraft((prev) => {
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

  function toggleFocusSkill(skillId: string) {
    if (!permissions.canEditFocusSkills) return;
    setFocusSkillIds((prev) => {
      if (prev.includes(skillId)) return prev.filter((id) => id !== skillId);
      if (prev.length >= SKILL_CHECK_FOCUS_MAX) return prev;
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
        const row = draft[skill.id] ?? emptySkillAssessment();
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
        body.focusSkillIds = focusSkillIds
          .filter((id) => activeSkills.some((s) => s.id === id))
          .slice(0, SKILL_CHECK_FOCUS_MAX);
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

  const canSave =
    permissions.canEditSelf ||
    permissions.canEditManager ||
    permissions.canEditFocusSkills ||
    (permissions.canEditSkillDefinitions && editingSkills);

  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">スキルチェックシート</h2>
        <p className="mt-2 text-sm text-slate-600">
          {targetName ? `${targetName} さんの` : ""}
          会社から期待される成長テーマを明確にします。スキルを定義し、本人・上司で評価し、ギャップを見て重点育成項目（最大
          {SKILL_CHECK_FOCUS_MAX}つ）を決めます。
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>スキルを定義する</li>
          <li>スキルごとに点数をつける</li>
          <li>グラフでギャップを可視化する</li>
          <li>重点育成項目（1〜{SKILL_CHECK_FOCUS_MAX}項目）を設定する</li>
          <li>成長・挑戦合意を記入する</li>
        </ol>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["baseline", "current"] as SkillCheckPhase[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => changePhase(p)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              phase === p
                ? "bg-indigo-700 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {p === "baseline" ? "開始時評価" : "終了時評価"}
          </button>
        ))}
        {isDirty ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
            未保存の入力があります
          </span>
        ) : null}
      </div>

      {/* ① スキル定義 */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold tracking-wide text-indigo-800 uppercase">Step 1</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">スキル定義</h3>
            <p className="mt-1 text-sm text-slate-600">
              会社・役割に合わせて項目を編集できます。上司・部下の双方が編集可能です。
            </p>
          </div>
          {permissions.canEditSkillDefinitions ? (
            !editingSkills ? (
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
            )
          ) : null}
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
                  placeholder={PLACEHOLDER.skillName}
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
        ) : (
          <ul className="mt-4 flex flex-wrap gap-2">
            {displaySkills.map((skill) => (
              <li
                key={skill.id}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800"
              >
                {skill.name || "（未入力）"}
                {skill.kind === "company" ? (
                  <span className="ml-1.5 text-[10px] font-semibold text-amber-800">企業独自</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ② スキルごとの点数 */}
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-indigo-800 uppercase">Step 2</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">スキルごとの評価</h3>
          <p className="mt-1 text-sm text-slate-600">
            本人評価と上司評価をそれぞれ 1〜5 点で入力します。基準の文言を参考にしてください。
          </p>
        </div>
        {displaySkills.map((skill) => {
          const row = draft[skill.id] ?? emptySkillAssessment();
          const gap = scoreGap(row.selfScore, row.managerScore);
          return (
            <article key={skill.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-base font-semibold text-slate-900">{skill.name || "（未入力）"}</h4>
                {gap !== null ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    評価ギャップ: {gap > 0 ? `+${gap}` : gap}
                  </span>
                ) : null}
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-semibold text-indigo-900">本人評価（クライアント）</span>
                  <select
                    value={scoreSelectValue(row.selfScore)}
                    disabled={!permissions.canEditSelf}
                    onChange={(e) => setScore(skill.id, "selfScore", e.target.value)}
                    className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="">未入力 — まずは現状の自己認識で選ぶ</option>
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
                    className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="">未入力 — 日常の発揮度で選ぶ</option>
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

      {/* ③ ギャップ可視化 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
        <p className="text-xs font-semibold tracking-wide text-indigo-800 uppercase">Step 3</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-900">ギャップの可視化</h3>
        <p className="mt-1 text-sm text-slate-600">
          本人評価と上司評価の差が大きい項目ほど、対話の手がかりになります。
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" />
            本人評価
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
            上司評価
          </span>
        </div>
        <div className="mt-4 min-w-0 overflow-x-auto sm:mt-6">
          <SkillRadarChart labels={chartLabels} series={chartSeries} size={480} />
        </div>
      </div>

      {/* ④ 重点育成項目 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
        <p className="text-xs font-semibold tracking-wide text-indigo-800 uppercase">Step 4</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-900">重点育成項目</h3>
        <p className="mt-1 text-sm text-slate-600">
          本人が、これから伸ばすスキルを{" "}
          <strong className="font-semibold text-slate-800">1〜{SKILL_CHECK_FOCUS_MAX}項目</strong>
          選びます。
        </p>
        <p className="mt-2 text-xs text-slate-500">
          選択中: {focusSkillIds.length} / {SKILL_CHECK_FOCUS_MAX}
        </p>
        <ul className="mt-4 space-y-2">
          {displaySkills.map((skill) => {
            const selected = focusSkillIds.includes(skill.id);
            const atMax = focusSkillIds.length >= SKILL_CHECK_FOCUS_MAX && !selected;
            return (
              <li key={skill.id}>
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${
                    selected
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-slate-200 hover:bg-slate-50"
                  } ${atMax ? "opacity-60" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={!permissions.canEditFocusSkills || atMax}
                    onChange={() => toggleFocusSkill(skill.id)}
                  />
                  <span className="text-sm font-medium text-slate-800">
                    {skill.name || "（未入力）"}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ⑤ 成長・挑戦合意（最下部） */}
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold tracking-wide text-indigo-800 uppercase">Step 5</p>
          <h3 className="text-lg font-semibold text-indigo-950">成長・挑戦合意</h3>
        </div>
        <p className="mt-2 text-sm text-indigo-900/90">
          重点育成項目を踏まえ、本人・上司の期待を言葉にします。入力欄の見本を参考に、自分の言葉で書いてください。
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-white bg-white/90 p-4 shadow-xs">
            <h4 className="text-sm font-semibold text-slate-900">本人入力</h4>
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-slate-800">大切にしたいこと</span>
              <textarea
                value={clientValuesText}
                onChange={(e) =>
                  setClientValuesText(e.target.value.slice(0, SKILL_CHECK_AGREEMENT_TEXT_MAX))
                }
                disabled={!permissions.canEditSelf}
                rows={3}
                maxLength={SKILL_CHECK_AGREEMENT_TEXT_MAX}
                placeholder={PLACEHOLDER.clientValues}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500"
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
                placeholder={PLACEHOLDER.clientSixMonth}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500"
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
                placeholder={PLACEHOLDER.managerCurrent}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500"
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
                placeholder={PLACEHOLDER.managerNext}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500"
              />
            </label>
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-800">{notice}</p> : null}

      {canSave ? (
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
