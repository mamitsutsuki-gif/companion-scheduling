"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { CoachingRadarChart } from "@/components/coaching-radar-chart";
import {
  ROLEPLAY_CATEGORIES,
  scoreOptionLabel,
  scoreHintsForItem,
  categoryRadarValues,
  type RoleplayCategoryDef,
  type RoleplayItemDef,
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
      ? "text-amber-950 bg-amber-50/90 border-amber-200/80"
      : tone === "hidden"
        ? "text-slate-700 bg-slate-50 border-slate-200"
        : "text-slate-600 bg-slate-50 border-slate-200";
  return (
    <p className={`rounded-xl border px-4 py-3 text-base leading-relaxed ${cls}`}>{children}</p>
  );
}

function ScoreSelect({
  item,
  value,
  disabled,
  onScore,
}: {
  item: RoleplayItemDef;
  value: number | null;
  disabled: boolean;
  onScore: (v: number | null) => void;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const hints = useMemo(() => scoreHintsForItem(item), [item]);
  const selectedHint = value != null ? hints[value as 1 | 2 | 3 | 4 | 5 | 6 | 7] : null;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="rounded-2xl border border-slate-200/90 bg-white px-4 py-4 shadow-sm">
      <p className="text-[17px] font-medium leading-snug text-slate-900">{item.label}</p>
      <div className="relative mt-3">
        <button
          type="button"
          id={listId}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => !disabled && setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-base text-slate-900 transition hover:border-slate-300 hover:bg-white focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-55"
        >
          <span className="min-w-0 flex-1">
            {value != null ? (
              <>
                <span className="font-semibold text-indigo-900">{value}点</span>
                {selectedHint ? (
                  <span className="mt-0.5 block truncate text-[15px] font-normal text-slate-600">{selectedHint}</span>
                ) : null}
              </>
            ) : (
              <span className="text-slate-500">点数を選択…</span>
            )}
          </span>
          <span aria-hidden className="shrink-0 text-slate-400">
            ▾
          </span>
        </button>
        {open ? (
          <ul
            role="listbox"
            aria-labelledby={listId}
            className="absolute z-20 mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg shadow-slate-900/10"
          >
            {([7, 6, 5, 4, 3, 2, 1] as const).map((n) => {
              const hint = hints[n];
              const selected = value === n;
              return (
                <li key={n} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onScore(n);
                      setOpen(false);
                    }}
                    className={[
                      "w-full px-4 py-3 text-left text-[15px] leading-snug transition",
                      selected ? "bg-indigo-50 text-indigo-950" : "text-slate-800 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <span className="font-semibold">{n}点</span>
                    <span className="mt-0.5 block text-slate-600">{hint}</span>
                  </button>
                </li>
              );
            })}
            {value != null ? (
              <li role="presentation" className="border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    onScore(null);
                    setOpen(false);
                  }}
                  className="w-full px-4 py-2.5 text-left text-[15px] text-slate-500 hover:bg-slate-50"
                >
                  選択をクリア
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function CategoryScores({
  cat,
  scores,
  disabled,
  onPatch,
}: {
  cat: RoleplayCategoryDef;
  scores: Record<string, RoleplayItemScore>;
  disabled: boolean;
  onPatch: (itemId: string, score: number | null) => void;
}) {
  return (
    <details className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm" open>
      <summary className="cursor-pointer text-xl font-semibold tracking-tight text-slate-900">{cat.label}</summary>
      <div className="mt-4 space-y-3">
        {cat.items.map((item) => (
          <ScoreSelect
            key={item.id}
            item={item}
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <CoachingRadarChart labels={labels} series={series} />
      <div className="mt-3 flex flex-wrap justify-center gap-4 text-sm">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      {deltas && deltas.length > 0 ? (
        <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
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
    if (canEditClient) {
      if (draft.sessionFeedback.satisfactionScore == null) {
        setError("セッション満足度（1〜10）を選択してください。");
        return;
      }
      if (!draft.sessionFeedback.satisfactionReason.trim()) {
        setError("満足度の理由を入力してください。");
        return;
      }
    }
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
  const showClientFreeText = isClientViewer || isPartnerViewer || isAdminViewer;
  const showPartnerFreeText = isClientViewer || isPartnerViewer || isAdminViewer;

  const fieldClass =
    "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50 disabled:text-slate-500";

  if (loading) return <p className="text-base text-slate-500">読込中…</p>;
  if (error && !store) return <p className="text-base text-rose-700">{error}</p>;
  if (!draft) return null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">ロールプレイング・評価（第{round}回）</h2>
        <p className="mt-2 text-base leading-relaxed text-slate-600">
          各項目を1〜7点で評価します。プルダウンを開くと、点数ごとの目安が表示されます。
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
        <label className="block text-base">
          <span className="font-medium text-slate-800">テーマ</span>
          <input
            value={draft.theme}
            disabled={!canEditClient && !canEditPartner}
            onChange={(e) => setDraft({ ...draft, theme: e.target.value })}
            className={fieldClass}
          />
        </label>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold tracking-tight text-slate-900">自己評価（クライアント）</h3>
        {canEditClient ? (
          <VisibilityNote tone="visible">
            入力した点数・自由記述はパートナーにも表示されます。
          </VisibilityNote>
        ) : isPartnerViewer ? (
          <VisibilityNote>クライアント本人の自己評価です（点数・自由記述を共有しています）。</VisibilityNote>
        ) : isClientViewer && viewerRole !== "CLIENT" ? (
          <VisibilityNote>クライアントの自己評価です（点数・自由記述）。</VisibilityNote>
        ) : null}
        {ROLEPLAY_CATEGORIES.map((cat) => (
          <CategoryScores
            key={`self-${cat.id}`}
            cat={cat}
            scores={draft.selfScores}
            disabled={!canEditClient}
            onPatch={patchSelf}
          />
        ))}
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold tracking-tight text-slate-900">パートナー評価</h3>
        {canEditPartner ? (
          <VisibilityNote tone="visible">
            入力した点数・自由記述はクライアントにも表示されます。
          </VisibilityNote>
        ) : isClientViewer ? (
          <VisibilityNote>パートナーからの評価です（点数・自由記述を共有しています）。</VisibilityNote>
        ) : isPartnerViewer ? (
          <VisibilityNote>あなたのパートナー評価です。</VisibilityNote>
        ) : null}
        {ROLEPLAY_CATEGORIES.map((cat) => (
          <CategoryScores
            key={`partner-${cat.id}`}
            cat={cat}
            scores={draft.partnerScores}
            disabled={!canEditPartner}
            onPatch={patchPartner}
          />
        ))}
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold tracking-tight text-slate-900">評価の可視化</h3>
        {isClientViewer || isPartnerViewer ? (
          <VisibilityNote>
            グラフには、クライアントの自己評価とパートナー評価（点数）が表示されます。自由記述もお互いに共有されています。
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

      <div className={`grid gap-5 ${showClientFreeText && showPartnerFreeText ? "lg:grid-cols-2" : ""}`}>
        {showClientFreeText ? (
          <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/25 p-5">
            <h3 className="text-lg font-semibold text-indigo-950">自由記述（クライアント）</h3>
            {canEditClient ? (
              <VisibilityNote tone="visible">
                ここに書いた内容はパートナーにも表示されます。
              </VisibilityNote>
            ) : isAdminViewer ? (
              <VisibilityNote>クライアント向けの自由記述です。</VisibilityNote>
            ) : null}
            <label className="block text-base">
              <span className="font-medium text-slate-800">良かった点</span>
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
                className={fieldClass}
              />
            </label>
            <label className="block text-base">
              <span className="font-medium text-slate-800">もっと良くなると思うこと</span>
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
                className={fieldClass}
              />
            </label>
          </div>
        ) : null}
        {showPartnerFreeText ? (
          <div className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/25 p-5">
            <h3 className="text-lg font-semibold text-emerald-950">自由記述（パートナー）</h3>
            {canEditPartner ? (
              <VisibilityNote tone="visible">
                ここに書いた内容はクライアントにも表示されます。
              </VisibilityNote>
            ) : isAdminViewer ? (
              <VisibilityNote>パートナー向けの自由記述です。</VisibilityNote>
            ) : null}
            <label className="block text-base">
              <span className="font-medium text-slate-800">良かった点</span>
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
                className={fieldClass}
              />
            </label>
            <label className="block text-base">
              <span className="font-medium text-slate-800">もっと良くなると思うこと</span>
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
                className={fieldClass}
              />
            </label>
          </div>
        ) : null}
      </div>

      <div className="space-y-4 rounded-2xl border border-violet-100 bg-violet-50/30 p-5">
        <h3 className="text-xl font-semibold tracking-tight text-slate-900">セッション満足度（クライアント）</h3>
        {canEditClient ? (
          <VisibilityNote tone="visible">
            満足度と理由はパートナーにも表示されます。
          </VisibilityNote>
        ) : isPartnerViewer || (isClientViewer && viewerRole !== "CLIENT") ? (
          <VisibilityNote>クライアントが入力したセッション満足度です。</VisibilityNote>
        ) : null}
        <fieldset className="space-y-3" disabled={!canEditClient}>
          <legend className="text-base font-medium text-slate-800">
            今回のロールプレイセッションの満足度（1〜10） <span className="text-red-600">*</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <label
                key={n}
                className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                  draft.sessionFeedback.satisfactionScore === n
                    ? "border-indigo-500 bg-indigo-600 text-white"
                    : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                } ${!canEditClient ? "cursor-not-allowed opacity-60" : ""}`}
              >
                <input
                  type="radio"
                  name="roleplaySatisfaction"
                  value={n}
                  checked={draft.sessionFeedback.satisfactionScore === n}
                  disabled={!canEditClient}
                  onChange={() =>
                    setDraft({
                      ...draft,
                      sessionFeedback: { ...draft.sessionFeedback, satisfactionScore: n },
                    })
                  }
                  className="sr-only"
                />
                {n}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-base">
          <span className="font-medium text-slate-800">
            満足度の理由 <span className="text-red-600">*</span>
          </span>
          <textarea
            rows={3}
            disabled={!canEditClient}
            value={draft.sessionFeedback.satisfactionReason}
            onChange={(e) =>
              setDraft({
                ...draft,
                sessionFeedback: { ...draft.sessionFeedback, satisfactionReason: e.target.value },
              })
            }
            className={fieldClass}
            placeholder="良かった点、もっとこうだったらよかった点など"
          />
        </label>
      </div>

      {canSave ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-xl bg-indigo-700 px-5 py-2.5 text-base font-semibold text-white disabled:opacity-50"
          >
            {saving ? "保存中…" : "評価を保存"}
          </button>
          {notice ? <span className="text-base text-emerald-700">{notice}</span> : null}
          {error ? <span className="text-base text-rose-700">{error}</span> : null}
          {canEditPartner ? (
            <span className="text-sm text-slate-500">
              点数・自由記述はクライアントに表示されます。
            </span>
          ) : canEditClient ? (
            <span className="text-sm text-slate-500">
              点数・自由記述・満足度はパートナーに表示されます。
            </span>
          ) : null}
        </div>
      ) : readOnly ? (
        <p className="text-base text-slate-500">閲覧のみ（編集不可）</p>
      ) : null}
    </div>
  );
}
