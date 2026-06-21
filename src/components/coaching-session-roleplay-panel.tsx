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

type RoundStatus = {
  round: number;
  clientSubmitted: boolean;
  partnerSubmitted: boolean;
  mutualReveal: boolean;
};

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

function ItemScoreComparison({
  cat,
  selfScores,
  partnerScores,
}: {
  cat: RoleplayCategoryDef;
  selfScores: Record<string, RoleplayItemScore>;
  partnerScores: Record<string, RoleplayItemScore>;
}) {
  return (
    <details className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
      <summary className="cursor-pointer text-lg font-semibold text-slate-900">{cat.label}</summary>
      <ul className="mt-4 space-y-2">
        {cat.items.map((item) => {
          const self = selfScores[item.id]?.score;
          const partner = partnerScores[item.id]?.score;
          if (self == null && partner == null) return null;
          return (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm"
            >
              <span className="font-medium text-slate-900">{item.label}</span>
              <span className="text-slate-600">
                自己 {self ?? "—"}点 / パートナー {partner ?? "—"}点
              </span>
            </li>
          );
        })}
      </ul>
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
  const [roundStatuses, setRoundStatuses] = useState<RoundStatus[]>([]);
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
      setRoundStatuses(Array.isArray(json.roundStatuses) ? json.roundStatuses : []);
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
      if (Array.isArray(json.roundStatuses)) setRoundStatuses(json.roundStatuses);
      setNotice("保存しました。");
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setSaving(false);
    }
  }

  const isClientViewer =
    viewerRole === "CLIENT" || viewerRole === "CLIENT_ADMIN" || viewerRole === "CLIENT_HR";
  const isPartnerViewer = viewerRole === "PARTNER";
  const isAdminViewer = viewerRole === "ADMIN" || viewerRole === "ADMIN_ASSISTANT";
  const roundStatus =
    roundStatuses.find((r) => r.round === round) ?? {
      round,
      clientSubmitted: false,
      partnerSubmitted: false,
      mutualReveal: false,
    };
  const mutualReveal = roundStatus.mutualReveal;
  const canEditClient = !readOnly && permissions.canEditClient && !mutualReveal;
  const canEditPartner = !readOnly && permissions.canEditPartner && !mutualReveal;
  const canSave = canEditClient || canEditPartner;
  const showClientInput = !mutualReveal && (canEditClient || isAdminViewer);
  const showPartnerInput = !mutualReveal && (canEditPartner || isAdminViewer);

  const fieldClass =
    "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50 disabled:text-slate-500";

  if (loading) return <p className="text-base text-slate-500">読込中…</p>;
  if (error && !store) return <p className="text-base text-rose-700">{error}</p>;
  if (!draft) return null;

  if (mutualReveal) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            ロールプレイング・評価（第{round}回）
          </h2>
        </div>

        <section className="rounded-2xl border border-indigo-200 bg-indigo-50/50 px-5 py-5">
          <h3 className="text-xl font-semibold text-indigo-950">フィードバックが届きました</h3>
          <p className="mt-2 text-base leading-relaxed text-indigo-900/90">
            双方の入力が完了しました。レーダーチャートと自由記述をご確認ください。
          </p>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-5">
            <h3 className="text-lg font-semibold text-indigo-950">良かったところ（クライアント）</h3>
            <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-slate-800">
              {draft.clientReflection.good.trim() || "（未入力）"}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/30 p-5">
            <h3 className="text-lg font-semibold text-emerald-950">良かったところ（パートナー）</h3>
            <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-slate-800">
              {draft.partnerFeedback.good.trim() || "（未入力）"}
            </p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-indigo-100 bg-white p-5">
            <h3 className="text-lg font-semibold text-indigo-950">もっと良くなると思うこと（クライアント）</h3>
            <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-slate-800">
              {draft.clientReflection.improve.trim() || "（未入力）"}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-white p-5">
            <h3 className="text-lg font-semibold text-emerald-950">もっと良くなると思うこと（パートナー）</h3>
            <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-slate-800">
              {draft.partnerFeedback.improve.trim() || "（未入力）"}
            </p>
          </div>
        </div>

        <ComparisonBlock
          title="レーダーチャート（自己評価 vs パートナー評価）"
          labels={categoryLabels}
          series={[
            { label: "自己評価", color: "#4f46e5", values: selfRadar },
            { label: "パートナー評価", color: "#059669", values: partnerRadar },
          ]}
        />

        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-900">各項目の点数</h3>
          {ROLEPLAY_CATEGORIES.map((cat) => (
            <ItemScoreComparison
              key={`cmp-${cat.id}`}
              cat={cat}
              selfScores={draft.selfScores}
              partnerScores={draft.partnerScores}
            />
          ))}
        </div>

        {draft.sessionFeedback.satisfactionScore != null ? (
          <div className="rounded-2xl border border-violet-100 bg-violet-50/30 p-5">
            <h3 className="text-lg font-semibold text-slate-900">セッション満足度（クライアント）</h3>
            <p className="mt-2 text-base text-slate-800">
              {draft.sessionFeedback.satisfactionScore} / 10
            </p>
            {draft.sessionFeedback.satisfactionReason.trim() ? (
              <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed text-slate-700">
                {draft.sessionFeedback.satisfactionReason}
              </p>
            ) : null}
          </div>
        ) : null}

        {readOnly ? <p className="text-base text-slate-500">閲覧のみ（編集不可）</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">ロールプレイング・評価（第{round}回）</h2>
        <p className="mt-2 text-base leading-relaxed text-slate-600">
          各項目を1〜7点で評価します。双方の入力が完了すると、お互いのフィードバックとレーダーチャートが表示されます。
        </p>
      </div>

      {!isAdminViewer ? (
        <VisibilityNote>
          {isClientViewer
            ? roundStatus.clientSubmitted
              ? "入力を保存済みです。パートナーの入力が完了すると、双方の評価が開示されます。"
              : "まずはご自身の評価を入力して保存してください。パートナーの入力完了後に相互開示されます。"
            : roundStatus.partnerSubmitted
              ? "入力を保存済みです。クライアントの入力が完了すると、双方の評価が開示されます。"
              : "まずはご自身の評価を入力して保存してください。クライアントの入力完了後に相互開示されます。"}
        </VisibilityNote>
      ) : null}

      {(showClientInput || showPartnerInput) && (canEditClient || canEditPartner) ? (
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
      ) : null}

      {showClientInput || (isAdminViewer && !mutualReveal) ? (
        <>
          <div className="space-y-4">
            <h3 className="text-xl font-semibold tracking-tight text-slate-900">自己評価（クライアント）</h3>
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

          <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/25 p-5">
            <h3 className="text-lg font-semibold text-indigo-950">自由記述（クライアント）</h3>
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

          <div className="space-y-4 rounded-2xl border border-violet-100 bg-violet-50/30 p-5">
            <h3 className="text-xl font-semibold tracking-tight text-slate-900">セッション満足度（クライアント）</h3>
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
        </>
      ) : null}

      {showPartnerInput || (isAdminViewer && !mutualReveal) ? (
        <>
          <div className="space-y-4">
            <h3 className="text-xl font-semibold tracking-tight text-slate-900">パートナー評価</h3>
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

          <div className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/25 p-5">
            <h3 className="text-lg font-semibold text-emerald-950">自由記述（パートナー）</h3>
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
        </>
      ) : null}

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
        </div>
      ) : readOnly ? (
        <p className="text-base text-slate-500">閲覧のみ（編集不可）</p>
      ) : null}
    </div>
  );
}
