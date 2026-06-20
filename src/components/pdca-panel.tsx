"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PdcaEntry } from "@/lib/companion-pdca";

type Skill = { id: string; name: string };

const emptyEntry = (): PdcaEntry => ({
  id: "",
  sessionNumber: null,
  periodLabel: "",
  focusTheme: "",
  focusSkillIds: [],
  plan: "",
  doText: "",
  check: "",
  act: "",
  clientNotes: "",
  coachComment: "",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export function PdcaPanel({ matchId }: { matchId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [entries, setEntries] = useState<PdcaEntry[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [focusSkillIds, setFocusSkillIds] = useState<string[]>([]);
  const [skillCounts, setSkillCounts] = useState<Array<{ skillId: string; count: number }>>([]);
  const [perms, setPerms] = useState({ canEditClient: false, canEditCoach: false });
  const [draft, setDraft] = useState<PdcaEntry>(emptyEntry());
  const [editingId, setEditingId] = useState<string | null>(null);

  const skillName = useMemo(() => new Map(skills.map((s) => [s.id, s.name])), [skills]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/matches/${matchId}/pdca`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError((json as { error?: string })?.error ?? "読み込みに失敗しました。");
      return;
    }
    setEntries((json as { store?: { entries?: PdcaEntry[] } }).store?.entries ?? []);
    setSkills((json as { skills?: Skill[] }).skills ?? []);
    setFocusSkillIds((json as { focusSkillIds?: string[] }).focusSkillIds ?? []);
    setSkillCounts((json as { skillCounts?: Array<{ skillId: string; count: number }> }).skillCounts ?? []);
    setPerms((json as { permissions?: typeof perms }).permissions ?? perms);
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  function startNew() {
    setEditingId(null);
    setDraft({
      ...emptyEntry(),
      focusSkillIds: focusSkillIds.slice(0, 3),
      periodLabel: "",
    });
  }

  function startEdit(entry: PdcaEntry) {
    setEditingId(entry.id);
    setDraft({ ...entry });
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/matches/${matchId}/pdca`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry: { ...draft, id: editingId ?? undefined } }),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError((json as { error?: string })?.error ?? "保存に失敗しました。");
      return;
    }
    setEntries((json as { store?: { entries?: PdcaEntry[] } }).store?.entries ?? []);
    setSkillCounts((json as { skillCounts?: Array<{ skillId: string; count: number }> }).skillCounts ?? []);
    setNotice("保存しました。");
    setEditingId(null);
    setDraft(emptyEntry());
  }

  async function remove(entryId: string) {
    if (!confirm("このPDCA記録を削除しますか？")) return;
    const res = await fetch(`/api/matches/${matchId}/pdca?entryId=${encodeURIComponent(entryId)}`, {
      method: "DELETE",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError((json as { error?: string })?.error ?? "削除に失敗しました。");
      return;
    }
    setEntries((json as { store?: { entries?: PdcaEntry[] } }).store?.entries ?? []);
    setSkillCounts((json as { skillCounts?: Array<{ skillId: string; count: number }> }).skillCounts ?? []);
  }

  if (loading) return <p className="text-sm text-slate-500">読込中…</p>;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">PDCAシート</h2>
        <p className="mt-2 text-sm text-slate-600">
          セッションごとに Plan / Do / Check / Act を記録し、重点スキルに紐づけて行動を蓄積します。
        </p>
      </div>

      {skillCounts.length > 0 ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
          <h3 className="text-sm font-semibold text-indigo-950">重点スキル別の行動件数</h3>
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {skillCounts.map((r) => (
              <li key={r.skillId} className="rounded-full bg-white px-3 py-1 text-slate-800">
                {skillName.get(r.skillId) ?? r.skillId}: {r.count}件
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {(perms.canEditClient || perms.canEditCoach) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-slate-900">
              {editingId ? "記録を編集" : "新しい記録"}
            </h3>
            <button type="button" onClick={startNew} className="text-sm text-indigo-700 hover:underline">
              新規作成
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              対象（回・月）
              <input
                value={draft.periodLabel}
                disabled={!perms.canEditClient}
                onChange={(e) => setDraft({ ...draft, periodLabel: e.target.value })}
                placeholder="例: 第3回 / 4月"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              セッション回（任意）
              <input
                type="number"
                min={1}
                value={draft.sessionNumber ?? ""}
                disabled={!perms.canEditClient}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    sessionNumber: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
          <label className="block text-sm">
            重点テーマ
            <input
              value={draft.focusTheme}
              disabled={!perms.canEditClient}
              onChange={(e) => setDraft({ ...draft, focusTheme: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          {perms.canEditClient ? (
            <fieldset>
              <legend className="text-sm font-semibold text-slate-800">紐づく重点スキル</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {skills.map((s) => (
                  <label key={s.id} className="flex items-center gap-1 rounded-lg border px-2 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.focusSkillIds.includes(s.id)}
                      onChange={() => {
                        setDraft((d) => ({
                          ...d,
                          focusSkillIds: d.focusSkillIds.includes(s.id)
                            ? d.focusSkillIds.filter((x) => x !== s.id)
                            : [...d.focusSkillIds, s.id].slice(0, 5),
                        }));
                      }}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          {(["plan", "doText", "check", "act"] as const).map((key) => (
            <label key={key} className="block text-sm">
              {key === "plan" ? "Plan（何をやるか）" : key === "doText" ? "Do（実際にやったこと）" : key === "check" ? "Check（何が起きたか）" : "Act（次にどう改善するか）"}
              <textarea
                rows={3}
                value={draft[key]}
                disabled={!perms.canEditClient}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          ))}
          <label className="block text-sm">
            本人記載欄
            <textarea
              rows={2}
              value={draft.clientNotes}
              disabled={!perms.canEditClient}
              onChange={(e) => setDraft({ ...draft, clientNotes: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            コーチコメント欄
            <textarea
              rows={2}
              value={draft.coachComment}
              disabled={!perms.canEditCoach}
              onChange={(e) => setDraft({ ...draft, coachComment: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存する"}
          </button>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-slate-900">記録一覧</h3>
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500">まだ記録がありません。</p>
        ) : (
          entries.map((e) => (
            <article key={e.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">
                    {e.periodLabel || "（時期未設定）"}
                    {e.sessionNumber ? ` / 第${e.sessionNumber}回` : ""}
                  </p>
                  {e.focusTheme ? <p className="text-sm text-slate-600">テーマ: {e.focusTheme}</p> : null}
                  {e.focusSkillIds.length > 0 ? (
                    <p className="mt-1 text-xs text-indigo-800">
                      スキル: {e.focusSkillIds.map((id) => skillName.get(id) ?? id).join("、")}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  {(perms.canEditClient || perms.canEditCoach) && (
                    <button type="button" onClick={() => startEdit(e)} className="text-sm text-indigo-700">
                      編集
                    </button>
                  )}
                  {perms.canEditClient && (
                    <button type="button" onClick={() => void remove(e.id)} className="text-sm text-red-700">
                      削除
                    </button>
                  )}
                </div>
              </div>
              <dl className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                <div><dt className="font-semibold">Plan</dt><dd className="whitespace-pre-wrap">{e.plan || "—"}</dd></div>
                <div><dt className="font-semibold">Do</dt><dd className="whitespace-pre-wrap">{e.doText || "—"}</dd></div>
                <div><dt className="font-semibold">Check</dt><dd className="whitespace-pre-wrap">{e.check || "—"}</dd></div>
                <div><dt className="font-semibold">Act</dt><dd className="whitespace-pre-wrap">{e.act || "—"}</dd></div>
              </dl>
              {e.coachComment ? (
                <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  コーチ: {e.coachComment}
                </p>
              ) : null}
            </article>
          ))
        )}
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-800">{notice}</p> : null}
    </section>
  );
}
