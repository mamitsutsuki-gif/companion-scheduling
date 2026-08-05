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
  stuckText: "",
  learningText: "",
  brakeEntryId: null,
  clientNotes: "",
  coachComment: "",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const PLACEHOLDER = {
  plan: "例：今週、他部署の担当者に15分ヒアリングを2件実施する",
  doText: "例：月曜と水曜に各1件実施。質問リストを事前に送った",
  stuck: "例：予定変更が多く、2件目の調整が止まってしまった／上司の反応が怖くて依頼メールを送れない",
  learning: "例：事前に候補日を3つ提示すると調整が早い／自分で抱え込まず早めに相談すると進む",
  act: "例：来週は候補日を3つ添えて依頼し、金曜に進捗を1行共有する",
} as const;

export function PdcaPanel({
  matchId,
  onOpenActionBrake,
}: {
  matchId: string;
  onOpenActionBrake?: (pdcaEntryId?: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [entries, setEntries] = useState<PdcaEntry[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [profileFocusSkillIds, setProfileFocusSkillIds] = useState<string[]>([]);
  const [skillCounts, setSkillCounts] = useState<Array<{ skillId: string; count: number }>>([]);
  const [perms, setPerms] = useState({ canEditClient: false, canEditCoach: false });
  const [draft, setDraft] = useState<PdcaEntry>(emptyEntry());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionBrakeEnabled, setActionBrakeEnabled] = useState(false);
  /** 新規作成時に参照する前回シートの次回アクション */
  const [previousActHint, setPreviousActHint] = useState<string | null>(null);

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
    setProfileFocusSkillIds((json as { focusSkillIds?: string[] }).focusSkillIds ?? []);
    setSkillCounts((json as { skillCounts?: Array<{ skillId: string; count: number }> }).skillCounts ?? []);
    setPerms((json as { permissions?: typeof perms }).permissions ?? perms);
    setActionBrakeEnabled(Boolean((json as { actionBrakeEnabled?: boolean }).actionBrakeEnabled));
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  function latestEntry(list: PdcaEntry[] = entries): PdcaEntry | null {
    return list[0] ?? null;
  }

  function startNew(fromEntries: PdcaEntry[] = entries) {
    const prev = latestEntry(fromEntries);
    const carriedSkills =
      prev && prev.focusSkillIds.length > 0
        ? prev.focusSkillIds.slice(0, 3)
        : profileFocusSkillIds.slice(0, 3);
    const prevAct = prev?.act?.trim() || "";
    setEditingId(null);
    setDraft({
      ...emptyEntry(),
      focusTheme: prev?.focusTheme ?? "",
      focusSkillIds: carriedSkills,
      plan: prevAct,
      periodLabel: "",
    });
    setPreviousActHint(prevAct || null);
    setNotice(null);
  }

  function startEdit(entry: PdcaEntry) {
    setEditingId(entry.id);
    setPreviousActHint(null);
    setDraft({
      ...entry,
      stuckText: entry.stuckText || entry.check,
      learningText: entry.learningText,
    });
    setNotice(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    const payload = {
      ...draft,
      id: editingId ?? undefined,
      check: draft.stuckText || draft.check,
      stuckText: draft.stuckText,
      learningText: draft.learningText,
    };
    const res = await fetch(`/api/matches/${matchId}/pdca`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry: payload }),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError((json as { error?: string })?.error ?? "保存に失敗しました。");
      return;
    }
    const saved = (json as { store?: { entries?: PdcaEntry[] } }).store?.entries ?? [];
    setEntries(saved);
    setSkillCounts((json as { skillCounts?: Array<{ skillId: string; count: number }> }).skillCounts ?? []);
    setNotice("保存しました。続けて書くときは「新規作成」で次のシートを開けます。過去の記録は下の一覧から振り返れます。");
    setEditingId(null);
    setDraft(emptyEntry());
    setPreviousActHint(null);
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
          行動を習慣化し、小さな成功体験を積み重ねます。シートは何枚でも作成・保存でき、過去の記録も振り返れます。
        </p>
        <p className="mt-2 text-sm text-slate-500">
          「新規作成」で次のサイクル用の空シートを開けます（重点テーマ・育成項目・前回の次回アクションを引き継ぎます）。保存だけでも記録は残ります。
        </p>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-800">{notice}</p> : null}

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
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-slate-900">
              {editingId ? "シートを編集" : "新しいPDCAシート"}
            </h3>
            <button type="button" onClick={() => startNew()} className="text-sm text-indigo-700 hover:underline">
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
                placeholder="例: 第3回 / 4月第2週"
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
              placeholder="例：他部署との連携を前に進める"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          {perms.canEditClient ? (
            <fieldset>
              <legend className="text-sm font-semibold text-slate-800">紐づく重点育成項目</legend>
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
                            : [...d.focusSkillIds, s.id].slice(0, 3),
                        }));
                      }}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {!editingId && previousActHint ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-3 text-sm text-amber-950">
              <p className="font-semibold">前回の次回アクション</p>
              <p className="mt-1 whitespace-pre-wrap text-amber-900/90">{previousActHint}</p>
              <p className="mt-2 text-xs text-amber-800/80">
                上の内容を「今回取り組む行動」の初期値に入れています。必要に応じて書き換えてください。
              </p>
            </div>
          ) : null}

          <label className="block text-sm">
            今回取り組む行動
            <textarea
              rows={3}
              value={draft.plan}
              disabled={!perms.canEditClient}
              placeholder={PLACEHOLDER.plan}
              onChange={(e) => setDraft({ ...draft, plan: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 placeholder:text-slate-400"
            />
          </label>
          <label className="block text-sm">
            取り組んだ結果
            <textarea
              rows={3}
              value={draft.doText}
              disabled={!perms.canEditClient}
              placeholder={PLACEHOLDER.doText}
              onChange={(e) => setDraft({ ...draft, doText: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 placeholder:text-slate-400"
            />
          </label>
          <label className="block text-sm">
            行き詰まったところ
            <textarea
              rows={3}
              value={draft.stuckText}
              disabled={!perms.canEditClient}
              placeholder={PLACEHOLDER.stuck}
              onChange={(e) => setDraft({ ...draft, stuckText: e.target.value, check: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 placeholder:text-slate-400"
            />
          </label>
          {actionBrakeEnabled && onOpenActionBrake && draft.stuckText.trim() ? (
            <p className="text-sm text-amber-900">
              行き詰まりがあるときは、
              <button
                type="button"
                className="mx-1 font-semibold text-indigo-800 underline"
                onClick={() => onOpenActionBrake(editingId || undefined)}
              >
                行き詰まり分析シート
              </button>
              で思考パターンを整理できます。
            </p>
          ) : null}
          <label className="block text-sm">
            学び・気づき・モヤモヤしたこと
            <textarea
              rows={3}
              value={draft.learningText}
              disabled={!perms.canEditClient}
              placeholder={PLACEHOLDER.learning}
              onChange={(e) => setDraft({ ...draft, learningText: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 placeholder:text-slate-400"
            />
          </label>
          <label className="block text-sm">
            次回アクション（次のシートへつなげる）
            <textarea
              rows={3}
              value={draft.act}
              disabled={!perms.canEditClient}
              placeholder={PLACEHOLDER.act}
              onChange={(e) => setDraft({ ...draft, act: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 placeholder:text-slate-400"
            />
          </label>
          <label className="block text-sm">
            メモ
            <textarea
              rows={2}
              value={draft.clientNotes}
              disabled={!perms.canEditClient}
              onChange={(e) => setDraft({ ...draft, clientNotes: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            上司コメント
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
            {saving ? "保存中…" : "このシートを保存する"}
          </button>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-slate-900">過去のPDCAシート</h3>
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500">まだ記録がありません。「新規作成」から始めましょう。</p>
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
                <div>
                  <dt className="font-semibold">今回の行動</dt>
                  <dd className="whitespace-pre-wrap">{e.plan || "—"}</dd>
                </div>
                <div>
                  <dt className="font-semibold">結果</dt>
                  <dd className="whitespace-pre-wrap">{e.doText || "—"}</dd>
                </div>
                <div>
                  <dt className="font-semibold">行き詰まり</dt>
                  <dd className="whitespace-pre-wrap">{e.stuckText || e.check || "—"}</dd>
                </div>
                <div>
                  <dt className="font-semibold">学び・気づき・モヤモヤしたこと</dt>
                  <dd className="whitespace-pre-wrap">{e.learningText || "—"}</dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="font-semibold">次回アクション</dt>
                  <dd className="whitespace-pre-wrap">{e.act || "—"}</dd>
                </div>
              </dl>
              {e.coachComment ? (
                <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  上司コメント: {e.coachComment}
                </p>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
