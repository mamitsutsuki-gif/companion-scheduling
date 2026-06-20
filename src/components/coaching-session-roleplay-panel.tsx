"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CoachingRadarChart } from "@/components/coaching-radar-chart";
import {
  ROLEPLAY_CATEGORIES,
  SCORE_LABELS,
  categoryRadarValues,
  type RoleplayCategoryDef,
  type RoleplayItemScore,
  type RoleplaySession,
  type RoleplayStore,
} from "@/lib/coaching-roleplay";

type Permissions = { canEditClient: boolean; canEditPartner: boolean };

type ViewerRole =
  | "ADMIN"
  | "ADMIN_ASSISTANT"
  | "PARTNER"
  | "CLIENT"
  | "CLIENT_ADMIN"
  | "CLIENT_HR";

function VisibilityNote({ children, tone = "neutral" }: { children: ReactNode; tone?: "visible" | "hidden" | "neutral" }) {
  const cls =
    tone === "visible"
      ? "text-amber-900 bg-amber-50 border-amber-200"
      : tone === "hidden"
        ? "text-slate-700 bg-slate-50 border-slate-200"
        : "text-slate-600 bg-slate-50 border-slate-200";
  return (
    <p className={`rounded-lg border px-3 py-2 text-sm leading-relaxed ${cls}`}>{children}</p>
  );
}

function ScoreSelect({
  label,
  sevenPointHint,
  value,
  disabled,
  onScore,
}: {
  label: string;
  sevenPointHint: string;
  value: number | null;
  disabled: boolean;
  onScore: (v: number | null) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start gap-2">
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
      <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
        <span className="font-medium text-indigo-700">7点の目安：</span>
        {sevenPointHint}
      </p>
    </div>
  );
}

function CategoryScores({
  cat,
  scores,
  disabled,
  onPatch,
  heading,
}: {
  cat: RoleplayCategoryDef;
  scores: Record<string, RoleplayItemScore>;
  disabled: boolean;
  onPatch: (itemId: string, score: number | null) => void;
  heading: string;
}) {
  return (
    <details className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3" open>
      <summary className="cursor-pointer text-base font-semibold text-indigo-950">{cat.label}</summary>
      <div className="mt-3 space-y-2">
        <h4 className="text-sm font-semibold text-indigo-900">{heading}</h4>
        {cat.items.map((item) => (
          <ScoreSelect
            key={item.id}
            label={item.label}
            sevenPointHint={item.sevenPointHint}
            value={scores[item.id]?.score ?? null}
            disabled={disabled}
            onScore={(v) => onPatch(item.id, v)}
          />
        ))}
      </div>
    </details>
  );
}

function ComparisonBlock({
  title,
  labels,
  series,
  deltas,
}: {
  title: string;
  labels: string[];
  series: Array<{ label: string; color: string; values: Array<number | null> }>;
  deltas?: Array<{ label: string; delta: number | null }>;
}) {
  const hasData = series.some((s) => s.values.some((v) => v != null && v > 0));
  if (!hasData) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <CoachingRadarChart labels={labels} series={series} />
      <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      {deltas && deltas.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-slate-600">
          {deltas.map((d) =>
            d.delta == null ? null : (
              <li key={d.label}>
                {d.label}: {d.delta >= 0 ? "+" : ""}
                {d.delta.toFixed(1)}点
              </li>
            ),
          )}
        </ul>
      ) : null}
    </div>
  );
}

export function CoachingSessionRoleplayPanel({
  matchId,
  sessionNumber,
  readOnly = false,
  viewerRole,
}: {
  matchId: string;
  sessionNumber: number;
  readOnly?: boolean;
  viewerRole: ViewerRole;
}) {
  const round = sessionNumber as 1 | 2 | 3;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [store, setStore] = useState<RoleplayStore | null>(null);
  const [permissions, setPermissions] = useState<Permissions>({ canEditClient: false, canEditPartner: false });
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
    setDraft(store.sessions[round - 1] ?? null);
  }, [store, round]);

  const categoryLabels = useMemo(() => ROLEPLAY_CATEGORIES.map((c) => c.label), []);

  const selfRadar = useMemo(() => (draft ? categoryRadarValues(draft.selfScores) : []), [draft]);
  const partnerRadar = useMemo(() => (draft ? categoryRadarValues(draft.partnerScores) : []), [draft]);

  const prevSession = round >= 2 ? store?.sessions[round - 2] ?? null : null;
  const prevPrevSession = round >= 3 ? store?.sessions[round - 3] ?? null : null;

  const prevSelfRadar = useMemo(
    () => (prevSession ? categoryRadarValues(prevSession.selfScores) : []),
    [prevSession],
  );
  const prevPartnerRadar = useMemo(
    () => (prevSession ? categoryRadarValues(prevSession.partnerScores) : []),
    [prevSession],
  );
  const prevPrevSelfRadar = useMemo(
    () => (prevPrevSession ? categoryRadarValues(prevPrevSession.selfScores) : []),
    [prevPrevSession],
  );
  const prevPrevPartnerRadar = useMemo(
    () => (prevPrevSession ? categoryRadarValues(prevPrevSession.partnerScores) : []),
    [prevPrevSession],
  );

  function roundDeltas(
    current: Array<number | null>,
    previous: Array<number | null>,
  ): Array<{ label: string; delta: number | null }> {
    return ROLEPLAY_CATEGORIES.map((c, i) => {
      const cur = current[i];
      const prev = previous[i];
      if (cur == null || prev == null) return { label: c.label, delta: null };
      return { label: c.label, delta: Math.round((cur - prev) * 10) / 10 };
    });
  }

  function patchSelf(itemId: string, score: number | null) {
    if (!draft) return;
    setDraft({
      ...draft,
      selfScores: {
        ...draft.selfScores,
        [itemId]: { ...(draft.selfScores[itemId] ?? { score: null, comment: "" }), score },
      },
    });
  }

  function patchPartner(itemId: string, score: number | null) {
    if (!draft) return;
    setDraft({
      ...draft,
      partnerScores: {
        ...draft.partnerScores,
        [itemId]: { ...(draft.partnerScores[itemId] ?? { score: null, comment: "" }), score },
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

  const canEditClient = !readOnly && permissions.canEditClient;
  const canEditPartner = !readOnly && permissions.canEditPartner;
  const canSave = canEditClient || canEditPartner;

  const isClientViewer =
    viewerRole === "CLIENT" || viewerRole === "CLIENT_ADMIN" || viewerRole === "CLIENT_HR";
  const isPartnerViewer = viewerRole === "PARTNER";
  const isAdminViewer = viewerRole === "ADMIN" || viewerRole === "ADMIN_ASSISTANT";
  const showClientFreeText = isClientViewer || isAdminViewer;
  const showPartnerFreeText = isPartnerViewer || isAdminViewer;

  if (loading) return <p className="text-sm text-slate-500">読込中…</p>;
  if (error && !store) return <p className="text-sm text-rose-700">{error}</p>;
  if (!draft) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-indigo-950">ロールプレイング・評価（第{round}回）</h2>
        <p className="mt-1 text-sm text-slate-600">
          各項目を1〜7点で評価します。7点の目安を参考に、自己評価とパートナー評価を入力してください。
        </p>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">実施日</span>
          <input
            type="date"
            value={draft.conductedAt}
            disabled={!canEditClient && !canEditPartner}
            onChange={(e) => setDraft({ ...draft, conductedAt: e.target.value })}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">テーマ</span>
          <input
            value={draft.theme}
            disabled={!canEditClient && !canEditPartner}
            onChange={(e) => setDraft({ ...draft, theme: e.target.value })}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">クライアント役</span>
          <input
            value={draft.clientRole}
            disabled={!canEditClient}
            onChange={(e) => setDraft({ ...draft, clientRole: e.target.value })}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">パートナー役</span>
          <input
            value={draft.partnerRole}
            disabled={!canEditPartner}
            onChange={(e) => setDraft({ ...draft, partnerRole: e.target.value })}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
          />
        </label>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-indigo-950">自己評価（クライアント）</h3>
        {canEditClient ? (
          <VisibilityNote tone="visible">
            入力した点数はパートナーにも表示されます（ギャップ確認のため）。
          </VisibilityNote>
        ) : isPartnerViewer ? (
          <VisibilityNote>クライアント本人の自己評価です。</VisibilityNote>
        ) : null}
        {ROLEPLAY_CATEGORIES.map((cat) => (
          <CategoryScores
            key={`self-${cat.id}`}
            cat={cat}
            scores={draft.selfScores}
            disabled={!canEditClient}
            onPatch={patchSelf}
            heading="自己評価"
          />
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-emerald-950">パートナー評価</h3>
        {canEditPartner ? (
          <VisibilityNote tone="visible">
            入力した点数はクライアントに表示されます。
          </VisibilityNote>
        ) : isClientViewer ? (
          <VisibilityNote>パートナーからの評価です。</VisibilityNote>
        ) : null}
        {ROLEPLAY_CATEGORIES.map((cat) => (
          <CategoryScores
            key={`partner-${cat.id}`}
            cat={cat}
            scores={draft.partnerScores}
            disabled={!canEditPartner}
            onPatch={patchPartner}
            heading="パートナー評価"
          />
        ))}
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-900">評価の可視化</h3>
        {isClientViewer ? (
          <VisibilityNote>
            グラフには、あなたの自己評価とパートナー評価（点数）が表示されます。パートナーの自由記述は含まれません。
          </VisibilityNote>
        ) : isPartnerViewer ? (
          <VisibilityNote>
            グラフには、クライアントの自己評価とあなたのパートナー評価（点数）が表示されます。あなたの自由記述はクライアントには表示されません。
          </VisibilityNote>
        ) : null}

        <ComparisonBlock
          title="ギャップ（自己 vs パートナー）"
          labels={categoryLabels}
          series={[
            { label: "自己評価", color: "#4f46e5", values: selfRadar },
            { label: "パートナー評価", color: "#059669", values: partnerRadar },
          ]}
          deltas={ROLEPLAY_CATEGORIES.map((c, i) => {
            const s = selfRadar[i];
            const p = partnerRadar[i];
            if (s == null || p == null) return { label: c.label, delta: null };
            return { label: c.label, delta: Math.round((p - s) * 10) / 10 };
          })}
        />

        {round >= 2 && prevSession ? (
          <>
            <ComparisonBlock
              title={`前回との比較 — 自己評価（第${round - 1}回 → 第${round}回）`}
              labels={categoryLabels}
              series={[
                { label: `第${round - 1}回`, color: "#94a3b8", values: prevSelfRadar },
                { label: `第${round}回`, color: "#4f46e5", values: selfRadar },
              ]}
              deltas={roundDeltas(selfRadar, prevSelfRadar)}
            />
            <ComparisonBlock
              title={`前回との比較 — パートナー評価（第${round - 1}回 → 第${round}回）`}
              labels={categoryLabels}
              series={[
                { label: `第${round - 1}回`, color: "#94a3b8", values: prevPartnerRadar },
                { label: `第${round}回`, color: "#059669", values: partnerRadar },
              ]}
              deltas={roundDeltas(partnerRadar, prevPartnerRadar)}
            />
          </>
        ) : null}

        {round >= 3 && prevPrevSession && prevSession ? (
          <>
            <ComparisonBlock
              title={`前々回と前回の比較 — 自己評価（第${round - 2}回 → 第${round - 1}回）`}
              labels={categoryLabels}
              series={[
                { label: `第${round - 2}回`, color: "#cbd5e1", values: prevPrevSelfRadar },
                { label: `第${round - 1}回`, color: "#64748b", values: prevSelfRadar },
              ]}
              deltas={roundDeltas(prevSelfRadar, prevPrevSelfRadar)}
            />
            <ComparisonBlock
              title={`前々回と前回の比較 — パートナー評価（第${round - 2}回 → 第${round - 1}回）`}
              labels={categoryLabels}
              series={[
                { label: `第${round - 2}回`, color: "#cbd5e1", values: prevPrevPartnerRadar },
                { label: `第${round - 1}回`, color: "#64748b", values: prevPartnerRadar },
              ]}
              deltas={roundDeltas(prevPartnerRadar, prevPrevPartnerRadar)}
            />
          </>
        ) : null}
      </div>

      <details className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <summary className="cursor-pointer font-semibold text-slate-800">点数基準（共通）</summary>
        <ul className="mt-2 list-inside list-disc space-y-1">
          {Object.entries(SCORE_LABELS).map(([k, v]) => (
            <li key={k}>
              {k}点: {v}
            </li>
          ))}
        </ul>
      </details>

      <div className={`grid gap-4 ${showClientFreeText && showPartnerFreeText ? "lg:grid-cols-2" : ""}`}>
        {showClientFreeText ? (
        <div className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/30 p-4">
          <h3 className="font-semibold text-indigo-950">自由記述（クライアント）</h3>
          {canEditClient ? (
            <VisibilityNote tone="hidden">
              ここに書いた内容はパートナーには表示されません。
            </VisibilityNote>
          ) : isAdminViewer ? (
            <VisibilityNote tone="hidden">
              クライアント向けの自由記述です（パートナーには非表示）。
            </VisibilityNote>
          ) : null}
          <label className="block text-sm">
            <span className="font-medium">良かった点</span>
            <textarea
              rows={3}
              disabled={!canEditClient}
              value={draft.clientReflection.good}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  clientReflection: { ...draft.clientReflection, good: e.target.value },
                })
              }
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">もっと良くなると思うこと</span>
            <textarea
              rows={3}
              disabled={!canEditClient}
              value={draft.clientReflection.improve}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  clientReflection: { ...draft.clientReflection, improve: e.target.value },
                })
              }
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5"
            />
          </label>
        </div>
        ) : null}
        {showPartnerFreeText ? (
        <div className="space-y-2 rounded-xl border border-emerald-100 bg-emerald-50/30 p-4">
          <h3 className="font-semibold text-emerald-950">自由記述（パートナー）</h3>
          {canEditPartner ? (
            <VisibilityNote tone="hidden">
              ここに書いた内容はクライアントには表示されません。
            </VisibilityNote>
          ) : isAdminViewer ? (
            <VisibilityNote tone="hidden">
              パートナー向けの自由記述です（クライアントには非表示）。
            </VisibilityNote>
          ) : null}
          <label className="block text-sm">
            <span className="font-medium">良かった点</span>
            <textarea
              rows={3}
              disabled={!canEditPartner}
              value={draft.partnerFeedback.good}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  partnerFeedback: { ...draft.partnerFeedback, good: e.target.value },
                })
              }
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">もっと良くなると思うこと</span>
            <textarea
              rows={3}
              disabled={!canEditPartner}
              value={draft.partnerFeedback.improve}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  partnerFeedback: { ...draft.partnerFeedback, improve: e.target.value },
                })
              }
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5"
            />
          </label>
        </div>
        ) : null}
      </div>

      {canSave ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "保存中…" : "評価を保存"}
          </button>
          {notice ? <span className="text-sm text-emerald-700">{notice}</span> : null}
          {error ? <span className="text-sm text-rose-700">{error}</span> : null}
          {canEditPartner ? (
            <span className="text-xs text-slate-500">
              点数はクライアントに表示されます。自由記述はクライアントには表示されません。
            </span>
          ) : canEditClient ? (
            <span className="text-xs text-slate-500">
              点数はパートナーに表示されます。自由記述はパートナーには表示されません。
            </span>
          ) : null}
        </div>
      ) : readOnly ? (
        <p className="text-sm text-slate-500">閲覧のみ（編集不可）</p>
      ) : null}
    </div>
  );
}
