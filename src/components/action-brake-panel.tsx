"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActionBrakeEntry } from "@/lib/companion-action-brake";
import { ACTION_BRAKE_TEXT_MAX } from "@/lib/companion-action-brake";

type PdcaLink = {
  id: string;
  periodLabel: string;
  sessionNumber: number | null;
  stuckText: string;
};

const SAMPLE = {
  event:
    "例：他部署連携のために他の課のメンバーを集めて会議をしていたら、直属の上司から「上の合意が取れていないから今すぐやめろ」と強い口調で止められた。",
  emotion:
    "例：他部署連携を推進しろと言っているのは上司なのに意味が分からない。他部署の人の前で恥をかかされたと感じた。",
  action:
    "例：その場で上司に言い返して、軽い口論のような状態になってしまった。",
  result: "例：連携に向けた動きが停滞してしまった。",
  thought:
    "例：人前で怒鳴るなんて恥をかかそうとしている／上司の期待に沿っていたのに認められなかった／恥ずかしい",
  rewrite:
    "例：上司は恥をかかすつもりではなかったのかもしれない。上からの指摘を恐れて言い方がキツくなっただけかもしれない。進め方の行き違いをすり合わせれば、引き続き進められるかもしれない。",
  habit: "例：人前で否定されると、即座に防衛・反論してしまう",
  nextChange: "例：まずは事実確認の質問をしてから反応する",
} as const;

const emptyEntry = (): ActionBrakeEntry => ({
  id: "",
  title: "",
  pdcaEntryId: null,
  eventText: "",
  emotionText: "",
  actionTakenText: "",
  resultText: "",
  automaticThoughtText: "",
  thoughtRewriteText: "",
  habitNotesText: "",
  nextChangeText: "",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

function formatPdcaSource(link: PdcaLink | undefined): string | null {
  if (!link) return null;
  const when =
    (link.sessionNumber ? `第${link.sessionNumber}回` : "") ||
    link.periodLabel.trim() ||
    "（回未設定）";
  const stuck = link.stuckText.trim();
  if (stuck) return `${when}　行き詰まり事象「${stuck}」`;
  return when;
}

export function ActionBrakePanel({
  matchId,
  initialPdcaEntryId,
}: {
  matchId: string;
  initialPdcaEntryId?: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [entries, setEntries] = useState<ActionBrakeEntry[]>([]);
  const [pdcaLinks, setPdcaLinks] = useState<PdcaLink[]>([]);
  const [perms, setPerms] = useState({ canEditClient: false, canEditCoach: false });
  const [draft, setDraft] = useState<ActionBrakeEntry>(emptyEntry());
  const [editingId, setEditingId] = useState<string | null>(null);

  const pdcaById = useMemo(() => new Map(pdcaLinks.map((p) => [p.id, p])), [pdcaLinks]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/matches/${matchId}/action-brake`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError((json as { error?: string })?.error ?? "読み込みに失敗しました。");
      return;
    }
    setEntries((json as { store?: { entries?: ActionBrakeEntry[] } }).store?.entries ?? []);
    setPdcaLinks(Array.isArray((json as { pdcaLinks?: PdcaLink[] }).pdcaLinks) ? (json as { pdcaLinks: PdcaLink[] }).pdcaLinks : []);
    setPerms((json as { permissions?: typeof perms }).permissions ?? perms);
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!initialPdcaEntryId) return;
    setEditingId(null);
    setDraft({
      ...emptyEntry(),
      pdcaEntryId: initialPdcaEntryId,
      title: "PDCAからの行き詰まり分析",
    });
    setNotice(null);
  }, [initialPdcaEntryId]);

  // PDCA リンク到着後、未入力の出来事欄に行き詰まり文を入れる（上書きしない）
  useEffect(() => {
    if (!initialPdcaEntryId || editingId) return;
    const link = pdcaById.get(initialPdcaEntryId);
    const stuck = link?.stuckText?.trim() || "";
    if (!stuck) return;
    setDraft((d) => {
      if (d.pdcaEntryId !== initialPdcaEntryId || d.eventText.trim()) return d;
      return { ...d, eventText: stuck };
    });
  }, [initialPdcaEntryId, pdcaById, editingId]);

  const canEdit = perms.canEditClient || perms.canEditCoach;

  function startNew() {
    setEditingId(null);
    setDraft(emptyEntry());
    setNotice(null);
  }

  function startEdit(entry: ActionBrakeEntry) {
    setEditingId(entry.id);
    setDraft({ ...entry, nextChangeText: entry.nextChangeText ?? "" });
    setNotice(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/matches/${matchId}/action-brake`, {
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
    setEntries((json as { store?: { entries?: ActionBrakeEntry[] } }).store?.entries ?? []);
    setNotice("保存しました。新しい分析を書くときは「新規作成」を押してください。");
    setEditingId(null);
    setDraft(emptyEntry());
  }

  async function remove(entryId: string) {
    if (!confirm("この分析記録を削除しますか？")) return;
    const res = await fetch(
      `/api/matches/${matchId}/action-brake?entryId=${encodeURIComponent(entryId)}`,
      { method: "DELETE" },
    );
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError((json as { error?: string })?.error ?? "削除に失敗しました。");
      return;
    }
    setEntries((json as { store?: { entries?: ActionBrakeEntry[] } }).store?.entries ?? []);
  }

  if (loading) return <p className="text-sm text-slate-500">読込中…</p>;

  const draftSource = draft.pdcaEntryId ? formatPdcaSource(pdcaById.get(draft.pdcaEntryId)) : null;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">行き詰まり分析シート</h2>
        <p className="mt-2 text-sm text-slate-600">
          認知行動療法の考え方で、行動を止めている思考パターンを整理し、思考の癖に気づくためのシートです（旧称：行動ブレーキ分析）。
        </p>
      </div>

      <aside className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/50 p-4 text-sm text-indigo-950/90">
        <h3 className="font-semibold text-indigo-950">記入の順番</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>①出来事 → ③感情 → ④とった行動 → ⑤結果 を先に書く</li>
          <li>そのあと ①と③のあいだにある ②自動思考（瞬発的な解釈）を書き出す</li>
          <li>自動思考を書き換え、思考の癖に気づき、次回から変えたいことを決める</li>
        </ol>
      </aside>

      {canEdit ? (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-slate-900">
              {editingId ? "分析を編集" : "新しい分析"}
            </h3>
            <button type="button" onClick={startNew} className="text-sm text-indigo-700 hover:underline">
              新規作成
            </button>
          </div>

          {draftSource ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">
              <p className="font-semibold">元のPDCA</p>
              <p className="mt-1 whitespace-pre-wrap">{draftSource}</p>
            </div>
          ) : null}

          <label className="block text-sm">
            タイトル（任意）
            <input
              value={draft.title}
              disabled={!perms.canEditClient}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="例：他部署連携の会議での行き詰まり"
            />
          </label>

          <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Step A — まず事実を書く（①③④⑤）
            </p>
            <TextArea
              label="① 出来事"
              value={draft.eventText}
              disabled={!perms.canEditClient}
              placeholder={SAMPLE.event}
              onChange={(v) => setDraft({ ...draft, eventText: v })}
            />
            <TextArea
              label="③ 感情"
              value={draft.emotionText}
              disabled={!perms.canEditClient}
              placeholder={SAMPLE.emotion}
              onChange={(v) => setDraft({ ...draft, emotionText: v })}
            />
            <TextArea
              label="④ とった行動"
              value={draft.actionTakenText}
              disabled={!perms.canEditClient}
              placeholder={SAMPLE.action}
              onChange={(v) => setDraft({ ...draft, actionTakenText: v })}
            />
            <TextArea
              label="⑤ 結果"
              value={draft.resultText}
              disabled={!perms.canEditClient}
              placeholder={SAMPLE.result}
              onChange={(v) => setDraft({ ...draft, resultText: v })}
            />
          </div>

          <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
            <p className="text-xs font-semibold tracking-wide text-indigo-800 uppercase">
              Step B — ①と③のあいだの ②自動思考を書き出す
            </p>
            <TextArea
              label="② 自動思考（瞬発的な解釈）"
              value={draft.automaticThoughtText}
              disabled={!perms.canEditClient}
              placeholder={SAMPLE.thought}
              onChange={(v) => setDraft({ ...draft, automaticThoughtText: v })}
            />
            <TextArea
              label="書き換え（別の見方）"
              value={draft.thoughtRewriteText}
              disabled={!perms.canEditClient}
              placeholder={SAMPLE.rewrite}
              onChange={(v) => setDraft({ ...draft, thoughtRewriteText: v })}
            />
            <TextArea
              label="思考の癖"
              value={draft.habitNotesText}
              disabled={!perms.canEditClient}
              placeholder={SAMPLE.habit}
              onChange={(v) => setDraft({ ...draft, habitNotesText: v })}
            />
            <TextArea
              label="次回から変えたいこと"
              value={draft.nextChangeText}
              disabled={!perms.canEditClient}
              placeholder={SAMPLE.nextChange}
              onChange={(v) => setDraft({ ...draft, nextChangeText: v })}
            />
          </div>

          <button
            type="button"
            disabled={saving || !perms.canEditClient}
            onClick={() => void save()}
            className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存する"}
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-500">閲覧のみです。</p>
      )}

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-slate-900">過去の分析（振り返り）</h3>
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500">まだ記録がありません。</p>
        ) : (
          entries.map((e) => {
            const source = e.pdcaEntryId ? formatPdcaSource(pdcaById.get(e.pdcaEntryId)) : null;
            return (
              <article key={e.id} className="rounded-xl border border-slate-200 bg-white p-4">
                {source ? (
                  <p className="mb-2 rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-2 text-xs text-amber-950">
                    元のPDCA: {source}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{e.title || "（無題）"}</p>
                    <p className="text-xs text-slate-500">
                      更新: {e.updatedAt ? new Date(e.updatedAt).toLocaleString("ja-JP") : "—"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {canEdit ? (
                      <button type="button" onClick={() => startEdit(e)} className="text-sm text-indigo-700">
                        編集
                      </button>
                    ) : null}
                    {perms.canEditClient ? (
                      <button type="button" onClick={() => void remove(e.id)} className="text-sm text-red-700">
                        削除
                      </button>
                    ) : null}
                  </div>
                </div>
                <dl className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                  <div>
                    <dt className="font-semibold">①出来事</dt>
                    <dd className="whitespace-pre-wrap">{e.eventText || "—"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">②自動思考</dt>
                    <dd className="whitespace-pre-wrap">{e.automaticThoughtText || "—"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">③感情</dt>
                    <dd className="whitespace-pre-wrap">{e.emotionText || "—"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">書き換え</dt>
                    <dd className="whitespace-pre-wrap">{e.thoughtRewriteText || "—"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">思考の癖</dt>
                    <dd className="whitespace-pre-wrap">{e.habitNotesText || "—"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">次回から変えたいこと</dt>
                    <dd className="whitespace-pre-wrap">{e.nextChangeText || "—"}</dd>
                  </div>
                </dl>
              </article>
            );
          })
        )}
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-800">{notice}</p> : null}
    </section>
  );
}

function TextArea({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder: string;
}) {
  return (
    <label className="block text-sm">
      <span className="font-semibold text-slate-800">{label}</span>
      <textarea
        rows={3}
        value={value}
        disabled={disabled}
        maxLength={ACTION_BRAKE_TEXT_MAX}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.slice(0, ACTION_BRAKE_TEXT_MAX))}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 placeholder:text-slate-400 disabled:bg-slate-100"
      />
    </label>
  );
}
