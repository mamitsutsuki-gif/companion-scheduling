"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CoachingRadarChart } from "@/components/coaching-radar-chart";
import {
  ROLEPLAY_CATEGORIES,
  SCORE_LABELS,
  categoryAverages,
  type RoleplayCategoryDef,
  type RoleplayItemScore,
  type RoleplaySession,
  type RoleplayStore,
} from "@/lib/coaching-roleplay";

type Permissions = { canEditClient: boolean; canEditPartner: boolean };

function ScoreRow({
  label,
  value,
  comment,
  disabled,
  onScore,
  onComment,
}: {
  label: string;
  value: number | null;
  comment: string;
  disabled: boolean;
  onScore: (v: number | null) => void;
  onComment: (v: string) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-[8rem] flex-1 text-sm font-medium text-slate-800">{label}</span>
        <select
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => onScore(e.target.value ? Number(e.target.value) : null)}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="">—</option>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>
              {n}点
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={comment}
        disabled={disabled}
        onChange={(e) => onComment(e.target.value)}
        rows={2}
        placeholder="点数の理由・具体例"
        className="mt-2 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
      />
    </div>
  );
}

function CategoryBlock({
  cat,
  selfScores,
  partnerScores,
  canEditClient,
  canEditPartner,
  onSelf,
  onPartner,
}: {
  cat: RoleplayCategoryDef;
  selfScores: Record<string, RoleplayItemScore>;
  partnerScores: Record<string, RoleplayItemScore>;
  canEditClient: boolean;
  canEditPartner: boolean;
  onSelf: (itemId: string, patch: Partial<RoleplayItemScore>) => void;
  onPartner: (itemId: string, patch: Partial<RoleplayItemScore>) => void;
}) {
  return (
    <details className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3" open>
      <summary className="cursor-pointer text-base font-semibold text-indigo-950">{cat.label}</summary>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-indigo-900">自己評価</h4>
          {cat.items.map((item) => (
            <ScoreRow
              key={`self-${item.id}`}
              label={item.label}
              value={selfScores[item.id]?.score ?? null}
              comment={selfScores[item.id]?.comment ?? ""}
              disabled={!canEditClient}
              onScore={(v) => onSelf(item.id, { score: v })}
              onComment={(v) => onSelf(item.id, { comment: v })}
            />
          ))}
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-emerald-900">パートナー評価</h4>
          {cat.items.map((item) => (
            <ScoreRow
              key={`partner-${item.id}`}
              label={item.label}
              value={partnerScores[item.id]?.score ?? null}
              comment={partnerScores[item.id]?.comment ?? ""}
              disabled={!canEditPartner}
              onScore={(v) => onPartner(item.id, { score: v })}
              onComment={(v) => onPartner(item.id, { comment: v })}
            />
          ))}
        </div>
      </div>
    </details>
  );
}

export function CoachingRoleplayPanel({ matchId }: { matchId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [store, setStore] = useState<RoleplayStore | null>(null);
  const [permissions, setPermissions] = useState<Permissions>({ canEditClient: false, canEditPartner: false });
  const [activeRound, setActiveRound] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<RoleplaySession | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/coaching/roleplay`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? "読み込みに失敗しました。");
        return;
      }
      setStore(json.store as RoleplayStore);
      setPermissions(json.permissions ?? { canEditClient: false, canEditPartner: false });
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!store) return;
    setDraft(store.sessions[activeRound - 1] ?? null);
  }, [store, activeRound]);

  const categoryLabels = useMemo(() => ROLEPLAY_CATEGORIES.map((c) => c.label), []);

  const selfRadar = useMemo(() => {
    if (!draft) return [];
    const avg = categoryAverages(draft.selfScores);
    return ROLEPLAY_CATEGORIES.map((c) => avg[c.id]);
  }, [draft]);

  const partnerRadar = useMemo(() => {
    if (!draft) return [];
    const avg = categoryAverages(draft.partnerScores);
    return ROLEPLAY_CATEGORIES.map((c) => avg[c.id]);
  }, [draft]);

  const growthSeries = useMemo(() => {
    if (!store) return null;
    const selfByRound = store.sessions.map((s) => {
      const avg = categoryAverages(s.selfScores);
      return ROLEPLAY_CATEGORIES.reduce((sum, c) => sum + (avg[c.id] ?? 0), 0) / ROLEPLAY_CATEGORIES.length;
    });
    const partnerByRound = store.sessions.map((s) => {
      const avg = categoryAverages(s.partnerScores);
      return ROLEPLAY_CATEGORIES.reduce((sum, c) => sum + (avg[c.id] ?? 0), 0) / ROLEPLAY_CATEGORIES.length;
    });
    return { selfByRound, partnerByRound };
  }, [store]);

  function patchSelf(itemId: string, patch: Partial<RoleplayItemScore>) {
    if (!draft) return;
    setDraft({
      ...draft,
      selfScores: {
        ...draft.selfScores,
        [itemId]: { ...(draft.selfScores[itemId] ?? { score: null, comment: "" }), ...patch },
      },
    });
  }

  function patchPartner(itemId: string, patch: Partial<RoleplayItemScore>) {
    if (!draft) return;
    setDraft({
      ...draft,
      partnerScores: {
        ...draft.partnerScores,
        [itemId]: { ...(draft.partnerScores[itemId] ?? { score: null, comment: "" }), ...patch },
      },
    });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/coaching/roleplay`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: draft }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? "保存に失敗しました。");
        return;
      }
      setStore(json.store as RoleplayStore);
      setNotice("保存しました。");
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">読込中…</p>;
  if (error && !store) return <p className="text-sm text-rose-700">{error}</p>;
  if (!draft) return null;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">ロールプレイング・フィードバック</h2>
        <p className="mt-1 text-sm text-slate-600">
          1〜3回のロールプレイングを記録し、自己評価とパートナー評価を比較します（各項目7段階）。
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {([1, 2, 3] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setActiveRound(r)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              activeRound === r
                ? "bg-indigo-700 text-white"
                : "border border-slate-300 bg-white text-slate-700"
            }`}
          >
            第{r}回
          </button>
        ))}
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">実施日</span>
          <input
            type="date"
            value={draft.conductedAt}
            disabled={!permissions.canEditClient && !permissions.canEditPartner}
            onChange={(e) => setDraft({ ...draft, conductedAt: e.target.value })}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">テーマ</span>
          <input
            value={draft.theme}
            disabled={!permissions.canEditClient && !permissions.canEditPartner}
            onChange={(e) => setDraft({ ...draft, theme: e.target.value })}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">クライアント役</span>
          <input
            value={draft.clientRole}
            disabled={!permissions.canEditClient}
            onChange={(e) => setDraft({ ...draft, clientRole: e.target.value })}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">パートナー役</span>
          <input
            value={draft.partnerRole}
            disabled={!permissions.canEditPartner}
            onChange={(e) => setDraft({ ...draft, partnerRole: e.target.value })}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
          />
        </label>
      </div>

      <div className="space-y-3">
        {ROLEPLAY_CATEGORIES.map((cat) => (
          <CategoryBlock
            key={cat.id}
            cat={cat}
            selfScores={draft.selfScores}
            partnerScores={draft.partnerScores}
            canEditClient={permissions.canEditClient}
            canEditPartner={permissions.canEditPartner}
            onSelf={patchSelf}
            onPartner={patchPartner}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-indigo-200 bg-white p-4">
          <h3 className="text-center text-sm font-semibold text-indigo-900">自己評価（カテゴリ平均）</h3>
          <CoachingRadarChart
            labels={categoryLabels}
            series={[{ label: "自己", color: "#4f46e5", values: selfRadar }]}
          />
        </div>
        <div className="rounded-xl border border-emerald-200 bg-white p-4">
          <h3 className="text-center text-sm font-semibold text-emerald-900">パートナー評価（カテゴリ平均）</h3>
          <CoachingRadarChart
            labels={categoryLabels}
            series={[{ label: "パートナー", color: "#059669", values: partnerRadar }]}
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">比較・ギャップ（カテゴリ平均）</h3>
        <CoachingRadarChart
          labels={categoryLabels}
          series={[
            { label: "自己", color: "#4f46e5", values: selfRadar },
            { label: "パートナー", color: "#059669", values: partnerRadar },
          ]}
        />
        <ul className="mt-2 space-y-1 text-xs text-slate-600">
          {ROLEPLAY_CATEGORIES.map((c, i) => {
            const s = selfRadar[i];
            const p = partnerRadar[i];
            if (s == null || p == null) return null;
            const gap = Math.round((p - s) * 10) / 10;
            return (
              <li key={c.id}>
                {c.label}: 自己 {s.toFixed(1)} / パートナー {p.toFixed(1)}（差 {gap >= 0 ? "+" : ""}
                {gap}）
              </li>
            );
          })}
        </ul>
      </div>

      {growthSeries ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-sm text-amber-950">
          <h3 className="font-semibold">回数ごとの成長推移（カテゴリ平均の全体平均）</h3>
          <ul className="mt-2 space-y-1">
            {growthSeries.selfByRound.map((v, i) => (
              <li key={i}>
                第{i + 1}回 — 自己: {v > 0 ? v.toFixed(1) : "—"} / パートナー:{" "}
                {growthSeries.partnerByRound[i]! > 0 ? growthSeries.partnerByRound[i]!.toFixed(1) : "—"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <summary className="cursor-pointer font-semibold text-slate-800">点数基準</summary>
        <ul className="mt-2 list-inside list-disc space-y-1">
          {Object.entries(SCORE_LABELS).map(([k, v]) => (
            <li key={k}>
              {k}点: {v}
            </li>
          ))}
        </ul>
      </details>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/30 p-4">
          <h3 className="font-semibold text-indigo-950">クライアント振り返り</h3>
          {(
            [
              ["good", "良かったところ"],
              ["improve", "改善したいところ"],
              ["nextFocus", "次回意識したいこと"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-sm">
              <span className="font-medium">{label}</span>
              <textarea
                rows={2}
                disabled={!permissions.canEditClient}
                value={draft.clientReflection[key]}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    clientReflection: { ...draft.clientReflection, [key]: e.target.value },
                  })
                }
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5"
              />
            </label>
          ))}
        </div>
        <div className="space-y-2 rounded-xl border border-emerald-100 bg-emerald-50/30 p-4">
          <h3 className="font-semibold text-emerald-950">パートナーフィードバック</h3>
          {(
            [
              ["good", "良かったところ"],
              ["improve", "改善するともっと良くなるところ"],
              ["advice", "次回に向けたアドバイス"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-sm">
              <span className="font-medium">{label}</span>
              <textarea
                rows={2}
                disabled={!permissions.canEditPartner}
                value={draft.partnerFeedback[key]}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    partnerFeedback: { ...draft.partnerFeedback, [key]: e.target.value },
                  })
                }
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving || (!permissions.canEditClient && !permissions.canEditPartner)}
          onClick={() => void save()}
          className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "保存中…" : `第${activeRound}回を保存`}
        </button>
        {notice ? <span className="text-sm text-emerald-700">{notice}</span> : null}
        {error ? <span className="text-sm text-rose-700">{error}</span> : null}
      </div>
    </section>
  );
}
