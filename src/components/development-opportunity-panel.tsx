"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEVELOPMENT_OPPORTUNITY_RECOMMENDED_CHECK_LABELS,
  DEVELOPMENT_OPPORTUNITY_REQUIRED_CHECK_LABELS,
  DEVELOPMENT_OPPORTUNITY_STATUS_OPTIONS,
  DEVELOPMENT_OPPORTUNITY_TEMPLATES,
  DEVELOPMENT_OPPORTUNITY_TEXT_MAX,
  applyDevelopmentOpportunityTemplate,
  type DevelopmentOpportunityRecommendedChecks,
  type DevelopmentOpportunityRequiredChecks,
  type DevelopmentOpportunitySheet,
  type DevelopmentOpportunityStatus,
  type DevelopmentOpportunityTemplate,
} from "@/lib/companion-development-opportunity";

type Permissions = { canEditManager: boolean };

const emptySheet = (): DevelopmentOpportunitySheet => ({
  userId: "",
  companyId: "",
  status: "unset",
  workText: "",
  practiceStartDate: "",
  reasonText: "",
  scopeText: "",
  authorityText: "",
  stakeholdersText: "",
  metricsText: "",
  toleranceText: "",
  supportText: "",
  actionItemsText: "",
  feedbackPointsText: "",
  requiredChecks: {
    canGrantAuthority: false,
    canVerifyWithin6Months: false,
    canAvoidMajorLoss: false,
  },
  recommendedChecks: {
    needsHigherAction: false,
    hasThinkingRoom: false,
    needsCoordination: false,
    clearResponsibility: false,
    objectiveResults: false,
  },
  updatedAt: "",
});

function statusPillClass(status: DevelopmentOpportunityStatus): string {
  switch (status) {
    case "active":
      return "bg-emerald-100 text-emerald-800";
    case "agreed":
      return "bg-sky-100 text-sky-800";
    case "draft":
      return "bg-amber-100 text-amber-900";
    default:
      return "bg-rose-100 text-rose-800";
  }
}

function statusLabel(status: DevelopmentOpportunityStatus): string {
  return DEVELOPMENT_OPPORTUNITY_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export function DevelopmentOpportunityPanel({ matchId }: { matchId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sheet, setSheet] = useState<DevelopmentOpportunitySheet>(emptySheet);
  const [conditionReady, setConditionReady] = useState(false);
  const [perms, setPerms] = useState<Permissions>({ canEditManager: false });
  const [focusSkillNames, setFocusSkillNames] = useState<string[]>([]);
  const [ftaActionHints, setFtaActionHints] = useState<string[]>([]);
  const [templates, setTemplates] = useState(DEVELOPMENT_OPPORTUNITY_TEMPLATES);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/matches/${matchId}/development-opportunity`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError((json as { error?: string })?.error ?? "読み込みに失敗しました。");
      return;
    }
    setSheet((json as { sheet?: DevelopmentOpportunitySheet }).sheet ?? emptySheet());
    setConditionReady(Boolean((json as { conditionReady?: boolean }).conditionReady));
    setPerms((json as { permissions?: Permissions }).permissions ?? { canEditManager: false });
    setFocusSkillNames(
      Array.isArray((json as { focusSkillNames?: string[] }).focusSkillNames)
        ? ((json as { focusSkillNames: string[] }).focusSkillNames)
        : [],
    );
    setFtaActionHints(
      Array.isArray((json as { ftaActionHints?: string[] }).ftaActionHints)
        ? ((json as { ftaActionHints: string[] }).ftaActionHints)
        : [],
    );
    setTemplates(
      (json as { templates?: DevelopmentOpportunityTemplate[] }).templates ??
        DEVELOPMENT_OPPORTUNITY_TEMPLATES,
    );
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  function patchSheet(patch: Partial<DevelopmentOpportunitySheet>) {
    setSheet((prev) => ({ ...prev, ...patch }));
    setNotice(null);
  }

  function applyTemplate(template: DevelopmentOpportunityTemplate) {
    if (!perms.canEditManager) return;
    setSheet((prev) => applyDevelopmentOpportunityTemplate(prev, template));
    setNotice("例の内容を反映しました。権限や失敗の許容範囲は必ず確認してください。");
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/matches/${matchId}/development-opportunity`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: sheet.status === "unset" ? "draft" : sheet.status,
        workText: sheet.workText,
        practiceStartDate: sheet.practiceStartDate,
        reasonText: sheet.reasonText,
        scopeText: sheet.scopeText,
        authorityText: sheet.authorityText,
        stakeholdersText: sheet.stakeholdersText,
        metricsText: sheet.metricsText,
        toleranceText: sheet.toleranceText,
        supportText: sheet.supportText,
        actionItemsText: sheet.actionItemsText,
        feedbackPointsText: sheet.feedbackPointsText,
        requiredChecks: sheet.requiredChecks,
        recommendedChecks: sheet.recommendedChecks,
      }),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError((json as { error?: string })?.error ?? "保存に失敗しました。");
      return;
    }
    setSheet((json as { sheet?: DevelopmentOpportunitySheet }).sheet ?? sheet);
    setConditionReady(Boolean((json as { conditionReady?: boolean }).conditionReady));
    setNotice("保存しました。");
  }

  const editable = perms.canEditManager;
  const showConditionWarning = !conditionReady;

  if (loading) {
    return <p className="text-sm text-slate-600">読込中…</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold text-slate-900">機会創出シート</h2>
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
            上司用
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusPillClass(sheet.status)}`}>
            {statusLabel(sheet.status)}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          成長できる実践機会を設計します。本人の重点育成項目とアクションを踏まえ、与える仕事・任せる役割・フィードバックポイントを決め、「どこで成長するか」を合意します。
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm">
        <h3 className="font-semibold text-slate-900">本人の重点育成項目（スキルチェック）</h3>
        <p className="mt-1 text-slate-700">
          {focusSkillNames.length > 0 ? focusSkillNames.join("、") : "（まだ重点育成項目が未設定です）"}
        </p>
        {ftaActionHints.length > 0 ? (
          <div className="mt-3">
            <h4 className="font-semibold text-slate-900">本人FTAのアクション（参考）</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">
              {ftaActionHints.slice(0, 8).map((t, i) => (
                <li key={`${i}-${t.slice(0, 12)}`}>{t}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {showConditionWarning ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <strong>まだ設定が足りない項目があります</strong>
          <br />
          権限・支援・実践開始期限と、挑戦機会の必須条件（3つ）を確認してください。
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      {!editable ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          閲覧のみです。内容の編集は上司・管理者が行います。
        </p>
      ) : null}

      {editable ? (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 sm:p-5">
          <strong className="text-sm text-indigo-950">挑戦機会の例</strong>
          <p className="mt-1 text-sm text-indigo-900/80">
            選ぶと下の入力欄に反映されます。権限や失敗の許容範囲は必ず確認してください。
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t)}
                className="rounded-xl border border-white bg-white/95 px-3 py-3 text-left shadow-xs transition hover:border-indigo-200 hover:bg-white"
              >
                <span className="block text-sm font-semibold text-slate-900">{t.label}</span>
                <span className="mt-0.5 block text-xs text-slate-600">{t.summary}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-slate-800">進捗</span>
          <select
            value={sheet.status}
            disabled={!editable}
            onChange={(e) => patchSheet({ status: e.target.value as DevelopmentOpportunityStatus })}
            className="block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
          >
            {DEVELOPMENT_OPPORTUNITY_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Field
          label="与える仕事"
          required
          value={sheet.workText}
          disabled={!editable}
          onChange={(v) => patchSheet({ workText: v })}
          placeholder="例：次期案件の要件整理リードを任せる"
        />
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-slate-800">
            実践開始期限 <Req />
          </span>
          <input
            type="date"
            value={sheet.practiceStartDate}
            disabled={!editable}
            onChange={(e) => patchSheet({ practiceStartDate: e.target.value })}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
          />
        </label>
        <Field
          label="アクションアイテム（本人が実践すること）"
          value={sheet.actionItemsText}
          disabled={!editable}
          onChange={(v) => patchSheet({ actionItemsText: v })}
          placeholder="例：週1で関係部署ヒアリングを実施し、要件案を更新する"
          className="lg:col-span-2"
        />
        <Field
          label="任せる役割"
          required
          value={sheet.scopeText}
          disabled={!editable}
          onChange={(v) => patchSheet({ scopeText: v })}
          placeholder="例：要件ヒアリングの主担当、優先度案の一次作成"
        />
        <Field
          label="フィードバックポイント"
          value={sheet.feedbackPointsText}
          disabled={!editable}
          onChange={(v) => patchSheet({ feedbackPointsText: v })}
          placeholder="例：関係者への説明の分かりやすさ、優先度判断の根拠の言語化"
        />
        <Field
          label="任せる理由"
          value={sheet.reasonText}
          disabled={!editable}
          onChange={(v) => patchSheet({ reasonText: v })}
        />
        <Field
          label="付与する権限"
          required
          value={sheet.authorityText}
          disabled={!editable}
          onChange={(v) => patchSheet({ authorityText: v })}
        />
        <Field
          label="関係者"
          value={sheet.stakeholdersText}
          disabled={!editable}
          onChange={(v) => patchSheet({ stakeholdersText: v })}
          rows={2}
        />
        <Field
          label="成果指標"
          value={sheet.metricsText}
          disabled={!editable}
          onChange={(v) => patchSheet({ metricsText: v })}
        />
        <Field
          label="失敗許容範囲"
          required
          value={sheet.toleranceText}
          disabled={!editable}
          onChange={(v) => patchSheet({ toleranceText: v })}
        />
        <Field
          label="上司の支援"
          required
          value={sheet.supportText}
          disabled={!editable}
          onChange={(v) => patchSheet({ supportText: v })}
          className="lg:col-span-2"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="text-base font-semibold text-slate-900">挑戦機会の確認（必須3条件）</h3>
        <ul className="mt-3 space-y-2">
          {DEVELOPMENT_OPPORTUNITY_REQUIRED_CHECK_LABELS.map(({ key, label }) => (
            <CheckRow
              key={key}
              label={label}
              checked={sheet.requiredChecks[key]}
              disabled={!editable}
              onChange={(checked) =>
                patchSheet({
                  requiredChecks: { ...sheet.requiredChecks, [key]: checked } as DevelopmentOpportunityRequiredChecks,
                })
              }
            />
          ))}
        </ul>
        <h3 className="mt-5 text-base font-semibold text-slate-900">
          さらに確認したいこと（任意）{" "}
          <span className="ml-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
            推奨
          </span>
        </h3>
        <ul className="mt-3 space-y-2">
          {DEVELOPMENT_OPPORTUNITY_RECOMMENDED_CHECK_LABELS.map(({ key, label }) => (
            <CheckRow
              key={key}
              label={label}
              checked={sheet.recommendedChecks[key]}
              disabled={!editable}
              onChange={(checked) =>
                patchSheet({
                  recommendedChecks: {
                    ...sheet.recommendedChecks,
                    [key]: checked,
                  } as DevelopmentOpportunityRecommendedChecks,
                })
              }
            />
          ))}
        </ul>
      </div>

      {editable ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-60"
          >
            {saving ? "保存中…" : "保存する"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Req() {
  return <span className="ml-1 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">必須</span>;
}

function Field({
  label,
  value,
  onChange,
  disabled,
  required,
  rows = 3,
  className = "",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  required?: boolean;
  rows?: number;
  className?: string;
  placeholder?: string;
}) {
  return (
    <label className={`block space-y-1 text-sm ${className}`}>
      <span className="font-medium text-slate-800">
        {label}
        {required ? <Req /> : null}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, DEVELOPMENT_OPPORTUNITY_TEXT_MAX))}
        disabled={disabled}
        rows={rows}
        maxLength={DEVELOPMENT_OPPORTUNITY_TEXT_MAX}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500"
      />
    </label>
  );
}

function CheckRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <li>
      <label className="flex items-start gap-2 text-sm text-slate-800">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5"
        />
        <span>{label}</span>
      </label>
    </li>
  );
}
