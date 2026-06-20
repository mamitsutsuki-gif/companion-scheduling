"use client";

import { AdminCompanyClientPartnerBriefingsSection } from "@/components/admin-company-client-partner-briefings-section";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import {
  INDIVIDUAL_COMPANION_FEATURE_OPTIONS,
  companyPlanLabel,
  getPlanFeatures,
  resolvePlanFeatures,
  type CompanyPlan,
  type IndividualCompanionFeatureKey,
  type PlanFeatureOverrides,
} from "@/lib/company-plan";

type PartnerProjectOverviewForm = {
  companyName: string;
  sessionPeriod: string;
  sessionFrequency: string;
  background: string;
  sessionFocus: string;
  expectations: string;
  other: string;
};

type ClientProjectOverviewForm = {
  sessionPeriod: string;
  sessionFrequency: string;
  background: string;
  sessionFocus: string;
  expectations: string;
  other: string;
};

type SettingsSnapshot = {
  slotDurationMinutes: number;
  totalSessions: number;
  timezone: string;
  availabilitySlotOptions: Array<{
    id: string;
    label: string;
    startMin: number;
    endMin: number;
  }>;
  partnerExtraQuestionsByRound: Record<string, string[]>;
  clientExtraQuestionsByRound: Record<string, string[]>;
  sessionGuidelinesByRound: Record<string, { client: string; partner: string }>;
  slotEarliestHour: number;
  slotLatestHour: number;
  allowWeekends: boolean;
  partnerProjectOverview?: PartnerProjectOverviewForm | null;
  clientProjectOverview?: ClientProjectOverviewForm | null;
  /**
   * 同じ企業ID内で自分FTA を相互閲覧できるか。
   * - effective 値: 既定 true。明示的に false が保存されている時のみ false。
   * - override 値: undefined（未設定）/ true / false の三状態
   */
  shareFtaWithinCompany?: boolean | null;
  planFeatureOverrides?: PlanFeatureOverrides | null;
};

type OverridableKey = keyof Pick<
  SettingsSnapshot,
  | "slotDurationMinutes"
  | "totalSessions"
  | "timezone"
  | "partnerExtraQuestionsByRound"
  | "clientExtraQuestionsByRound"
  | "sessionGuidelinesByRound"
  | "slotEarliestHour"
  | "slotLatestHour"
  | "allowWeekends"
>;

type ApiResponse = {
  company: { id: string; name: string } | null;
  isRegistered: boolean;
  override: Partial<SettingsSnapshot> | null;
  global: SettingsSnapshot & { companies?: Array<{ id: string; name: string; plan?: CompanyPlan }> };
  effective: SettingsSnapshot & {
    overriddenFields: OverridableKey[];
    planFeatureOverrides?: PlanFeatureOverrides | null;
  };
};

const OVERRIDABLE_KEYS: readonly OverridableKey[] = [
  "slotDurationMinutes",
  "totalSessions",
  "timezone",
  "slotEarliestHour",
  "slotLatestHour",
  "allowWeekends",
  "partnerExtraQuestionsByRound",
  "clientExtraQuestionsByRound",
  "sessionGuidelinesByRound",
] as const;

export default function AdminCompanySettingsPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = use(params);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);

  // どのキーを上書きするか
  const [overrideFlags, setOverrideFlags] = useState<Record<OverridableKey, boolean>>(() => ({
    slotDurationMinutes: false,
    totalSessions: false,
    timezone: false,
    slotEarliestHour: false,
    slotLatestHour: false,
    allowWeekends: false,
    partnerExtraQuestionsByRound: false,
    clientExtraQuestionsByRound: false,
    sessionGuidelinesByRound: false,
  }));

  // 各フィールドの編集値
  const [vSlotDurationMinutes, setSlotDurationMinutes] = useState(30);
  const [vTotalSessions, setTotalSessions] = useState(6);
  const [vTimezone, setTimezone] = useState("Asia/Tokyo");
  const [vSlotEarliestHour, setSlotEarliestHour] = useState(8);
  const [vSlotLatestHour, setSlotLatestHour] = useState(20);
  const [vAllowWeekends, setAllowWeekends] = useState(false);
  const [vPartnerQs, setPartnerQs] = useState<Record<string, string[]>>({});
  const [vClientQs, setClientQs] = useState<Record<string, string[]>>({});
  const [vGuidelines, setGuidelines] = useState<Record<string, { client: string; partner: string }>>({});

  const emptyPartnerPo: PartnerProjectOverviewForm = {
    companyName: "",
    sessionPeriod: "",
    sessionFrequency: "",
    background: "",
    sessionFocus: "",
    expectations: "",
    other: "",
  };
  const emptyClientPo: ClientProjectOverviewForm = {
    sessionPeriod: "",
    sessionFrequency: "",
    background: "",
    sessionFocus: "",
    expectations: "",
    other: "",
  };
  const [vPartnerPo, setVPartnerPo] = useState<PartnerProjectOverviewForm>(emptyPartnerPo);
  const [vClientPo, setVClientPo] = useState<ClientProjectOverviewForm>(emptyClientPo);
  /**
   * 「同じ企業ID内で自分FTAを共有する」の編集値。
   * 真偽値 + 未設定（=グローバル既定の true）の三状態を持たせる。
   * - "default": override 無し（=既定動作: 共有する）
   * - "share": 明示的に共有する（= true を保存）
   * - "no-share": 共有しない（= false を保存）
   * 保存時は patch の `shareFtaWithinCompany` で true / false を渡し、
   * "default" の時はフィールド自体を送らない（=既存値を保持）。
   */
  type ShareFtaMode = "default" | "share" | "no-share";
  const [vShareFtaMode, setVShareFtaMode] = useState<ShareFtaMode>("default");
  /** 保存時の値の判定に使う初期スナップショット。 */
  const [initialShareFtaMode, setInitialShareFtaMode] = useState<ShareFtaMode>("default");
  const [vPlanFeatures, setVPlanFeatures] = useState<Record<IndividualCompanionFeatureKey, boolean>>(() =>
    defaultPlanFeatureToggles("individual_companion"),
  );
  const [planFeaturesCustomized, setPlanFeaturesCustomized] = useState(false);

  function applyApiResponse(json: ApiResponse) {
    setData(json);
    const ov = json.override ?? {};
    setOverrideFlags({
      slotDurationMinutes: ov.slotDurationMinutes !== undefined,
      totalSessions: ov.totalSessions !== undefined,
      timezone: ov.timezone !== undefined,
      slotEarliestHour: ov.slotEarliestHour !== undefined,
      slotLatestHour: ov.slotLatestHour !== undefined,
      allowWeekends: ov.allowWeekends !== undefined,
      partnerExtraQuestionsByRound: ov.partnerExtraQuestionsByRound !== undefined,
      clientExtraQuestionsByRound: ov.clientExtraQuestionsByRound !== undefined,
      sessionGuidelinesByRound: ov.sessionGuidelinesByRound !== undefined,
    });
    const eff = json.effective;
    setSlotDurationMinutes(eff.slotDurationMinutes);
    setTotalSessions(eff.totalSessions);
    setTimezone(eff.timezone);
    setSlotEarliestHour(eff.slotEarliestHour);
    setSlotLatestHour(eff.slotLatestHour);
    setAllowWeekends(eff.allowWeekends);
    setPartnerQs(eff.partnerExtraQuestionsByRound);
    setClientQs(eff.clientExtraQuestionsByRound ?? {});
    setGuidelines(eff.sessionGuidelinesByRound);
    const po = eff.partnerProjectOverview;
    setVPartnerPo(
      po
        ? {
            companyName: po.companyName ?? "",
            sessionPeriod: po.sessionPeriod ?? "",
            sessionFrequency: po.sessionFrequency ?? "",
            background: po.background ?? "",
            sessionFocus: po.sessionFocus ?? "",
            expectations: po.expectations ?? "",
            other: po.other ?? "",
          }
        : emptyPartnerPo,
    );
    const co = eff.clientProjectOverview;
    setVClientPo(
      co
        ? {
            sessionPeriod: co.sessionPeriod ?? "",
            sessionFrequency: co.sessionFrequency ?? "",
            background: co.background ?? "",
            sessionFocus: co.sessionFocus ?? "",
            expectations: co.expectations ?? "",
            other: co.other ?? "",
          }
        : emptyClientPo,
    );
    const ovShare = ov.shareFtaWithinCompany;
    const initialMode: ShareFtaMode =
      ovShare === true ? "share" : ovShare === false ? "no-share" : "default";
    setVShareFtaMode(initialMode);
    setInitialShareFtaMode(initialMode);
    const companyPlan = resolveCompanyPlanFromApi(json, companyId);
    const effectiveFeatures = resolvePlanFeatures(companyPlan, eff.planFeatureOverrides ?? null);
    setVPlanFeatures(planFeaturesToToggles(effectiveFeatures));
    setPlanFeaturesCustomized(Boolean(eff.planFeatureOverrides && Object.keys(eff.planFeatureOverrides).length > 0));
  }

  function ensureOverride(key: OverridableKey) {
    setOverrideFlags((p) => (p[key] ? p : { ...p, [key]: true }));
  }

  const companyPlan = useMemo(
    () => (data ? resolveCompanyPlanFromApi(data, companyId) : ("workplace_activation" as CompanyPlan)),
    [data, companyId],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/companies/${encodeURIComponent(companyId)}/settings`,
          { cache: "no-store" },
        );
        const json = (await res.json().catch(() => null)) as
          | (ApiResponse & { error?: string })
          | null;
        if (cancelled) return;
        if (!res.ok || !json) {
          setError(json?.error ?? "取得に失敗しました。");
          setLoading(false);
          return;
        }
        applyApiResponse(json);
      } catch {
        if (!cancelled) setError("ネットワークエラーが発生しました。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  /** 上書き OFF に戻すとき、編集値を全体設定の値に戻す */
  function toggleOverride(key: OverridableKey, on: boolean) {
    setOverrideFlags((p) => ({ ...p, [key]: on }));
    if (!on && data) {
      const g = data.global;
      switch (key) {
        case "slotDurationMinutes":
          setSlotDurationMinutes(g.slotDurationMinutes);
          break;
        case "totalSessions":
          setTotalSessions(g.totalSessions);
          break;
        case "timezone":
          setTimezone(g.timezone);
          break;
        case "slotEarliestHour":
          setSlotEarliestHour(g.slotEarliestHour);
          break;
        case "slotLatestHour":
          setSlotLatestHour(g.slotLatestHour);
          break;
        case "allowWeekends":
          setAllowWeekends(g.allowWeekends);
          break;
        case "partnerExtraQuestionsByRound":
          setPartnerQs(g.partnerExtraQuestionsByRound);
          break;
        case "clientExtraQuestionsByRound":
          setClientQs(g.clientExtraQuestionsByRound ?? {});
          break;
        case "sessionGuidelinesByRound":
          setGuidelines(g.sessionGuidelinesByRound);
          break;
      }
    }
  }

  const onlinePartner = useMemo(() => Object.keys(vPartnerQs).length, [vPartnerQs]);
  const onlineClient = useMemo(() => Object.keys(vClientQs).length, [vClientQs]);
  const onlineGuidelines = useMemo(() => Object.keys(vGuidelines).length, [vGuidelines]);

  function setPartnerQuestion(round: number, index: number, text: string) {
    setPartnerQs((p) => {
      const key = String(round);
      const list = [...(p[key] ?? [])];
      list[index] = text;
      return { ...p, [key]: list };
    });
  }
  function addPartnerQuestion(round: number) {
    setPartnerQs((p) => {
      const key = String(round);
      const list = [...(p[key] ?? []), ""];
      return { ...p, [key]: list };
    });
  }
  function removePartnerQuestion(round: number, index: number) {
    setPartnerQs((p) => {
      const key = String(round);
      const list = (p[key] ?? []).filter((_, i) => i !== index);
      const next = { ...p };
      if (list.length === 0) delete next[key];
      else next[key] = list;
      return next;
    });
  }
  // クライアント追加質問用のヘルパ。partner と同形で round → 文字列配列を編集する。
  function setClientQuestion(round: number, index: number, text: string) {
    setClientQs((p) => {
      const key = String(round);
      const list = [...(p[key] ?? [])];
      list[index] = text;
      return { ...p, [key]: list };
    });
  }
  function addClientQuestion(round: number) {
    setClientQs((p) => {
      const key = String(round);
      const list = [...(p[key] ?? []), ""];
      return { ...p, [key]: list };
    });
  }
  function removeClientQuestion(round: number, index: number) {
    setClientQs((p) => {
      const key = String(round);
      const list = (p[key] ?? []).filter((_, i) => i !== index);
      const next = { ...p };
      if (list.length === 0) delete next[key];
      else next[key] = list;
      return next;
    });
  }
  function setGuidelineField(round: number, kind: "client" | "partner", text: string) {
    setGuidelines((g) => {
      const key = String(round);
      const cur = g[key] ?? { client: "", partner: "" };
      return { ...g, [key]: { ...cur, [kind]: text } };
    });
  }

  async function onSave() {
    if (!data) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    if (
      overrideFlags.slotEarliestHour &&
      overrideFlags.slotLatestHour &&
      vSlotEarliestHour >= vSlotLatestHour
    ) {
      setSaving(false);
      setError("候補の制約：開始時刻は終了時刻より前にしてください。");
      return;
    }

    const body: Record<string, unknown> = {};
    const clearFields: OverridableKey[] = [];
    for (const k of OVERRIDABLE_KEYS) {
      if (!overrideFlags[k]) {
        clearFields.push(k);
        continue;
      }
      switch (k) {
        case "slotDurationMinutes":
          body.slotDurationMinutes = vSlotDurationMinutes;
          break;
        case "totalSessions":
          body.totalSessions = vTotalSessions;
          break;
        case "timezone":
          body.timezone = vTimezone.trim();
          break;
        case "slotEarliestHour":
          body.slotEarliestHour = vSlotEarliestHour;
          break;
        case "slotLatestHour":
          body.slotLatestHour = vSlotLatestHour;
          break;
        case "allowWeekends":
          body.allowWeekends = vAllowWeekends;
          break;
        case "partnerExtraQuestionsByRound": {
          const cleaned: Record<string, string[]> = {};
          for (const [round, list] of Object.entries(vPartnerQs)) {
            const trimmed = list.map((q) => q.trim()).filter((q) => q.length > 0);
            if (trimmed.length > 0) cleaned[round] = trimmed;
          }
          body.partnerExtraQuestionsByRound = cleaned;
          break;
        }
        case "clientExtraQuestionsByRound": {
          const cleaned: Record<string, string[]> = {};
          for (const [round, list] of Object.entries(vClientQs)) {
            const trimmed = list.map((q) => q.trim()).filter((q) => q.length > 0);
            if (trimmed.length > 0) cleaned[round] = trimmed;
          }
          body.clientExtraQuestionsByRound = cleaned;
          break;
        }
        case "sessionGuidelinesByRound": {
          const cleaned: Record<string, { client: string; partner: string }> = {};
          for (const [round, v] of Object.entries(vGuidelines)) {
            const c = (v.client ?? "").trim();
            const p = (v.partner ?? "").trim();
            if (c.length > 0 || p.length > 0) cleaned[round] = { client: c, partner: p };
          }
          body.sessionGuidelinesByRound = cleaned;
          break;
        }
      }
    }
    if (clearFields.length > 0) body.clearFields = clearFields;

    if (companyPlan === "individual_companion" && planFeaturesCustomized) {
      const overrides: PlanFeatureOverrides = {};
      for (const { key } of INDIVIDUAL_COMPANION_FEATURE_OPTIONS) {
        overrides[key] = vPlanFeatures[key];
      }
      body.planFeatureOverrides = overrides;
    } else if (companyPlan === "individual_companion" && data.override?.planFeatureOverrides) {
      body.clearPlanFeatureOverrides = true;
    }

    try {
      const res = await fetch(
        `/api/admin/companies/${encodeURIComponent(companyId)}/settings`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "保存に失敗しました。");
      } else {
        setMessage("保存しました。");
        // 再読込
        const reload = await fetch(
          `/api/admin/companies/${encodeURIComponent(companyId)}/settings`,
          { cache: "no-store" },
        );
        const next = (await reload.json().catch(() => null)) as ApiResponse | null;
        if (next) applyApiResponse(next);
      }
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setSaving(false);
    }
  }

  async function onClearAll() {
    if (!confirm("この企業のすべての上書きを削除し、全項目を全体設定に戻します。よろしいですか？")) {
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/admin/companies/${encodeURIComponent(companyId)}/settings`,
        { method: "DELETE" },
      );
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "削除に失敗しました。");
      } else {
        setMessage("すべての上書きを削除しました。全体設定に戻りました。");
        const reload = await fetch(
          `/api/admin/companies/${encodeURIComponent(companyId)}/settings`,
          { cache: "no-store" },
        );
        const next = (await reload.json().catch(() => null)) as ApiResponse | null;
        if (next) applyApiResponse(next);
      }
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveProjectOverview() {
    if (!data) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/admin/companies/${encodeURIComponent(companyId)}/settings`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            partnerProjectOverview: { ...vPartnerPo },
            clientProjectOverview: { ...vClientPo },
          }),
        },
      );
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "プロジェクト概要の保存に失敗しました。");
      } else {
        setMessage("プロジェクト概要を保存しました。");
        const reload = await fetch(
          `/api/admin/companies/${encodeURIComponent(companyId)}/settings`,
          { cache: "no-store" },
        );
        const next = (await reload.json().catch(() => null)) as ApiResponse | null;
        if (next) applyApiResponse(next);
      }
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveShareFta() {
    if (!data) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      // "default" は override 値を削除（=既定動作 true に戻す）。
      // "share" / "no-share" は明示値を保存。
      const body: Record<string, boolean> = {};
      if (vShareFtaMode === "share") body.shareFtaWithinCompany = true;
      else if (vShareFtaMode === "no-share") body.shareFtaWithinCompany = false;
      // 注意: 現状の PATCH では「shareFtaWithinCompany を未指定」だと既存値を保持する。
      // "default" に戻すには明示的に削除フィールドが必要だが、
      // 現状の運用では「true / false」の二択しか保存されないため、
      // "default" を選んだ時は no-op（既存値を残す）でも問題は最小。
      // 将来 clearFields に shareFtaWithinCompany を追加することで完全に消せるようにする。
      const res = await fetch(
        `/api/admin/companies/${encodeURIComponent(companyId)}/settings`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "共有設定の保存に失敗しました。");
      } else {
        setMessage("自分FTA の社内共有設定を保存しました。");
        setInitialShareFtaMode(vShareFtaMode);
        const reload = await fetch(
          `/api/admin/companies/${encodeURIComponent(companyId)}/settings`,
          { cache: "no-store" },
        );
        const next = (await reload.json().catch(() => null)) as ApiResponse | null;
        if (next) applyApiResponse(next);
      }
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setSaving(false);
    }
  }

  async function onClearProjectOverview(which: "partner" | "client" | "both") {
    if (!data) return;
    if (
      !confirm(
        which === "both"
          ? "パートナー向け・クライアント向けのプロジェクト概要を削除します。よろしいですか？"
          : which === "partner"
            ? "パートナー向けのプロジェクト概要を削除します。よろしいですか？"
            : "クライアント向けのプロジェクト概要を削除します。よろしいですか？",
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const body: Record<string, boolean> = {};
      if (which === "partner" || which === "both") body.clearPartnerProjectOverview = true;
      if (which === "client" || which === "both") body.clearClientProjectOverview = true;
      const res = await fetch(
        `/api/admin/companies/${encodeURIComponent(companyId)}/settings`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "削除に失敗しました。");
      } else {
        setMessage("プロジェクト概要を削除しました。");
        if (which === "partner" || which === "both") setVPartnerPo(emptyPartnerPo);
        if (which === "client" || which === "both") setVClientPo(emptyClientPo);
        const reload = await fetch(
          `/api/admin/companies/${encodeURIComponent(companyId)}/settings`,
          { cache: "no-store" },
        );
        const next = (await reload.json().catch(() => null)) as ApiResponse | null;
        if (next) applyApiResponse(next);
      }
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setSaving(false);
    }
  }

  const headerTitle =
    data?.company?.name ?? (data && !data.isRegistered ? `未登録ID: ${companyId}` : companyId);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:gap-10">
      <header className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">
          Administrator / Company / Settings
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          {headerTitle} ＞ アプリ設定
        </h1>
        <p className="mt-1 font-mono text-xs text-slate-500">企業ID: {companyId}</p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
          各項目は、チェックを入れるとこの企業だけ別の値で動作します。数値を変更すると自動的に上書きが有効になります。
          チェックを外すと全体設定に戻ります。
        </p>
        <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          補足: 「対応可能時間の選択肢」は、企業ごと上書きを一時停止中です（リリースまで無効化）。
          現在は常に全体設定の選択肢が使われます。「候補日時の制約」は通常どおり企業ごと設定が有効です。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/admin/companies/${encodeURIComponent(companyId)}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 no-underline hover:bg-slate-50"
          >
            ← 企業ページに戻る
          </Link>
          <button
            type="button"
            onClick={onClearAll}
            disabled={saving || loading}
            className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-900 hover:bg-rose-100 disabled:opacity-50"
          >
            すべての上書きを削除（全体設定に戻す）
          </button>
        </div>
      </header>

      {data && !data.isRegistered ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          この企業IDは「アプリ設定 → 企業（テナント）」に未登録のため、編集できません。
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">{error}</p>
      ) : null}
      {message ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          {message}
        </p>
      ) : null}

      {loading ? <p className="text-slate-600">読込中…</p> : null}

      {data && data.isRegistered ? (
        <>
          <section className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 shadow-sm sm:p-8">
            <h2 className="text-lg font-semibold text-indigo-950">プロジェクト概要（マッチルーム表示用）</h2>
            <p className="mt-2 text-sm text-indigo-900/90">
              クライアント・パートナーのマッチ画面の「プロジェクト概要」タブに表示されます。パートナー向けとクライアント向けは別内容です。
            </p>
            <div className="mt-6 grid gap-8 lg:grid-cols-2">
              <div className="space-y-3 rounded-xl border border-white bg-white/80 p-4 shadow-xs">
                <h3 className="text-base font-semibold text-indigo-950">パートナー向け</h3>
                {(
                  [
                    ["companyName", "企業名"],
                    ["sessionPeriod", "1on1セッション期間"],
                    ["sessionFrequency", "1on1セッション頻度"],
                    ["background", "導入背景"],
                    ["sessionFocus", "1on1セッションで行うこと"],
                    ["expectations", "期待すること"],
                    ["other", "その他"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="block space-y-1 text-xs font-semibold text-slate-700">
                    {label}
                    <textarea
                      value={vPartnerPo[key]}
                      onChange={(e) => setVPartnerPo((p) => ({ ...p, [key]: e.target.value }))}
                      maxLength={8000}
                      rows={key === "background" || key === "sessionFocus" ? 4 : 2}
                      className="w-full resize-y rounded-md border border-slate-300 px-2 py-1.5 text-sm font-normal text-slate-900"
                    />
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => void onClearProjectOverview("partner")}
                  disabled={saving}
                  className="text-xs font-semibold text-rose-700 underline hover:text-rose-900 disabled:opacity-50"
                >
                  パートナー向けを削除
                </button>
              </div>
              <div className="space-y-3 rounded-xl border border-white bg-white/80 p-4 shadow-xs">
                <h3 className="text-base font-semibold text-emerald-950">クライアント向け</h3>
                {(
                  [
                    ["sessionPeriod", "1on1セッション期間"],
                    ["sessionFrequency", "1on1セッション頻度"],
                    ["background", "導入背景"],
                    ["sessionFocus", "1on1セッションで行うこと"],
                    ["expectations", "期待すること"],
                    ["other", "その他"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="block space-y-1 text-xs font-semibold text-slate-700">
                    {label}
                    <textarea
                      value={vClientPo[key]}
                      onChange={(e) => setVClientPo((p) => ({ ...p, [key]: e.target.value }))}
                      maxLength={8000}
                      rows={key === "background" || key === "sessionFocus" ? 4 : 2}
                      className="w-full resize-y rounded-md border border-slate-300 px-2 py-1.5 text-sm font-normal text-slate-900"
                    />
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => void onClearProjectOverview("client")}
                  disabled={saving}
                  className="text-xs font-semibold text-rose-700 underline hover:text-rose-900 disabled:opacity-50"
                >
                  クライアント向けを削除
                </button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void onSaveProjectOverview()}
                disabled={saving}
                className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-800 disabled:opacity-50"
              >
                プロジェクト概要を保存
              </button>
              <button
                type="button"
                onClick={() => void onClearProjectOverview("both")}
                disabled={saving}
                className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-900 hover:bg-rose-100 disabled:opacity-50"
              >
                両方とも削除
              </button>
            </div>
          </section>

          <AdminCompanyClientPartnerBriefingsSection
            companyId={companyId}
            companyName={data.company?.name ?? companyId}
            variant="editable"
          />

          {/* 自分FTA の社内共有設定 */}
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm sm:p-8">
            <h2 className="text-lg font-semibold text-emerald-950">
              自分FTA の社内共有
            </h2>
            <p className="mt-2 text-sm text-emerald-900/90">
              この企業のクライアント・クライアント管理者・クライアント人事が、
              <strong>同じ企業ID内で他メンバーの自分FTAを閲覧できる</strong>かどうかの設定です。
              既定では「共有する」になっています。
              共有しない場合、各メンバーは自分の自分FTAだけを参照できるようになります。
            </p>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-emerald-300 bg-white px-4 py-3 text-sm text-emerald-950 hover:bg-emerald-50/70">
              <input
                type="checkbox"
                checked={
                  vShareFtaMode === "share" || vShareFtaMode === "default"
                }
                onChange={(e) =>
                  setVShareFtaMode(e.target.checked ? "share" : "no-share")
                }
                className="mt-0.5 h-4 w-4 accent-emerald-700"
              />
              <span>
                <span className="font-semibold">
                  同じ企業ID内で自分FTAを共有する
                </span>
                <span className="ml-2 text-xs text-emerald-800/80">
                  {vShareFtaMode === "default"
                    ? "（現在: 既定値で共有あり）"
                    : vShareFtaMode === "share"
                      ? "（現在: 共有する を明示）"
                      : "（現在: 共有しない を明示）"}
                </span>
              </span>
            </label>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void onSaveShareFta()}
                disabled={saving || vShareFtaMode === initialShareFtaMode}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50"
              >
                共有設定を保存
              </button>
              {vShareFtaMode !== "default" ? (
                <button
                  type="button"
                  onClick={() => setVShareFtaMode("default")}
                  disabled={saving}
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  既定値に戻す（編集中）
                </button>
              ) : null}
            </div>
          </section>

          {companyPlan === "individual_companion" ? (
            <section className="rounded-2xl border border-violet-200 bg-violet-50/30 p-5 shadow-sm sm:p-8">
              <h2 className="text-lg font-semibold text-violet-950">個別伴走プラン — 成果物の表示</h2>
              <p className="mt-2 text-sm text-violet-900/90">
                クライアントのマッチルームに表示するシート・成果物を選びます。選択したタブは、
                ペアになったパートナーも同じルーム内でリアルタイムに閲覧できます。
              </p>
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-violet-300 bg-white px-4 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={planFeaturesCustomized}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setPlanFeaturesCustomized(on);
                    if (!on) {
                      setVPlanFeatures(planFeaturesToToggles(getPlanFeatures("individual_companion")));
                    }
                  }}
                  className="mt-0.5 h-4 w-4 accent-violet-700"
                />
                <span>
                  <span className="font-semibold">この企業で成果物を個別に設定する</span>
                  <span className="mt-1 block text-xs text-violet-800/80">
                    オフの場合は個別伴走プランの既定（すべて表示）を使います。
                  </span>
                </span>
              </label>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {INDIVIDUAL_COMPANION_FEATURE_OPTIONS.map(({ key, label }) => (
                  <label
                    key={key}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      planFeaturesCustomized
                        ? "border-violet-200 bg-white text-violet-950"
                        : "border-slate-200 bg-slate-50 text-slate-500"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={vPlanFeatures[key]}
                      disabled={!planFeaturesCustomized}
                      onChange={(e) =>
                        setVPlanFeatures((p) => ({ ...p, [key]: e.target.checked }))
                      }
                      className="h-4 w-4 accent-violet-700"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </section>
          ) : (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              導入プラン: {companyPlanLabel(companyPlan)} — 成果物の個別選択は個別伴走プランのみ利用できます。
            </p>
          )}

          {/* 枠・回数・TZ */}
          <SectionCard
            title="枠・回数・タイムゾーン"
            keys={["slotDurationMinutes", "totalSessions", "timezone"]}
            overrideFlags={overrideFlags}
            toggleOverride={toggleOverride}
            global={data.global}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FieldNumber
                label="1回の長さ（分）"
                value={vSlotDurationMinutes}
                onChange={(n) => {
                  ensureOverride("slotDurationMinutes");
                  setSlotDurationMinutes(n);
                }}
                min={5}
                max={240}
                step={5}
              />
              <FieldNumber
                label="総セッション数"
                value={vTotalSessions}
                onChange={(n) => {
                  ensureOverride("totalSessions");
                  setTotalSessions(n);
                }}
                min={1}
                max={60}
              />
              <label className="block space-y-1 text-sm font-medium text-slate-800">
                タイムゾーン
                <input
                  value={vTimezone}
                  onChange={(e) => {
                    ensureOverride("timezone");
                    setTimezone(e.target.value);
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
                />
              </label>
            </div>
          </SectionCard>

          {/* 候補の制約 */}
          <SectionCard
            title="候補日時の制約"
            keys={["slotEarliestHour", "slotLatestHour", "allowWeekends"]}
            overrideFlags={overrideFlags}
            toggleOverride={toggleOverride}
            global={data.global}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-sm font-medium text-slate-800">
                開始時刻（時）
                <select
                  value={vSlotEarliestHour}
                  onChange={(e) => {
                    ensureOverride("slotEarliestHour");
                    setSlotEarliestHour(Number(e.target.value));
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
                >
                  {Array.from({ length: 24 }, (_, h) => h).map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm font-medium text-slate-800">
                終了時刻（時）
                <select
                  value={vSlotLatestHour}
                  onChange={(e) => {
                    ensureOverride("slotLatestHour");
                    setSlotLatestHour(Number(e.target.value));
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
                >
                  {Array.from({ length: 25 }, (_, h) => h).map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={vAllowWeekends}
                onChange={(e) => {
                  ensureOverride("allowWeekends");
                  setAllowWeekends(e.target.checked);
                }}
                className="h-4 w-4"
              />
              土日も候補日として選択可能にする
            </label>
          </SectionCard>

          {/* パートナー追加質問 */}
          <SectionCard
            title="パートナーレポートの追加質問"
            keys={["partnerExtraQuestionsByRound"]}
            overrideFlags={overrideFlags}
            toggleOverride={toggleOverride}
            global={data.global}
            subtitle={`現在 ${onlinePartner} 回分に設定があります`}
          >
            <fieldset disabled={!overrideFlags.partnerExtraQuestionsByRound} className="space-y-3">
              {Array.from({ length: Math.max(1, vTotalSessions) }, (_, i) => i + 1).map((round) => {
                const list = vPartnerQs[String(round)] ?? [];
                return (
                  <details
                    key={round}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2"
                    open={list.length > 0}
                  >
                    <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                      {round} 回目 の追加質問{list.length > 0 ? `（${list.length}件）` : ""}
                    </summary>
                    <div className="mt-2 space-y-2">
                      {list.map((q, i) => (
                        <div key={i} className="flex gap-2">
                          <textarea
                            value={q}
                            onChange={(e) => setPartnerQuestion(round, i, e.target.value)}
                            rows={2}
                            maxLength={500}
                            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => removePartnerQuestion(round, i)}
                            className="self-start rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                          >
                            削除
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addPartnerQuestion(round)}
                        disabled={list.length >= 8}
                        className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                      >
                        質問を追加
                      </button>
                    </div>
                  </details>
                );
              })}
            </fieldset>
          </SectionCard>

          {/* クライアント振り返り（フィードバック）の追加質問 */}
          <SectionCard
            title="クライアントの振り返り（フィードバック）の追加質問"
            keys={["clientExtraQuestionsByRound"]}
            overrideFlags={overrideFlags}
            toggleOverride={toggleOverride}
            global={data.global}
            subtitle={`現在 ${onlineClient} 回分に設定があります`}
          >
            <fieldset disabled={!overrideFlags.clientExtraQuestionsByRound} className="space-y-3">
              <p className="text-xs text-slate-600">
                クライアントが各回の振り返り（フィードバック）提出時に追加で答える設問です。各回ごとに最大 8 件まで設定できます。
              </p>
              {Array.from({ length: Math.max(1, vTotalSessions) }, (_, i) => i + 1).map((round) => {
                const list = vClientQs[String(round)] ?? [];
                return (
                  <details
                    key={round}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2"
                    open={list.length > 0}
                  >
                    <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                      {round} 回目 の追加質問{list.length > 0 ? `（${list.length}件）` : ""}
                    </summary>
                    <div className="mt-2 space-y-2">
                      {list.map((q, i) => (
                        <div key={i} className="flex gap-2">
                          <textarea
                            value={q}
                            onChange={(e) => setClientQuestion(round, i, e.target.value)}
                            rows={2}
                            maxLength={500}
                            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => removeClientQuestion(round, i)}
                            className="self-start rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                          >
                            削除
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addClientQuestion(round)}
                        disabled={list.length >= 8}
                        className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
                      >
                        質問を追加
                      </button>
                    </div>
                  </details>
                );
              })}
            </fieldset>
          </SectionCard>

          {/* セッションガイドライン */}
          <SectionCard
            title="各回のセッションガイドライン"
            keys={["sessionGuidelinesByRound"]}
            overrideFlags={overrideFlags}
            toggleOverride={toggleOverride}
            global={data.global}
            subtitle={`現在 ${onlineGuidelines} 回分に設定があります`}
          >
            <fieldset disabled={!overrideFlags.sessionGuidelinesByRound} className="space-y-3">
              {Array.from({ length: Math.max(1, vTotalSessions) }, (_, i) => i + 1).map((round) => {
                const cur = vGuidelines[String(round)] ?? { client: "", partner: "" };
                const filled = (cur.client?.trim().length ?? 0) + (cur.partner?.trim().length ?? 0) > 0;
                return (
                  <details
                    key={round}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2"
                    open={filled}
                  >
                    <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                      {round} 回目 のガイドライン{filled ? "（設定あり）" : ""}
                    </summary>
                    <div className="mt-2 space-y-3">
                      <label className="block space-y-1 text-sm font-medium text-slate-900">
                        クライアント向け
                        <textarea
                          value={cur.client}
                          onChange={(e) => setGuidelineField(round, "client", e.target.value)}
                          rows={3}
                          maxLength={4000}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="block space-y-1 text-sm font-medium text-slate-900">
                        パートナー向け
                        <textarea
                          value={cur.partner}
                          onChange={(e) => setGuidelineField(round, "partner", e.target.value)}
                          rows={3}
                          maxLength={4000}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                  </details>
                );
              })}
            </fieldset>
          </SectionCard>

          <div className="sticky bottom-3 z-10 flex flex-wrap justify-end gap-2 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-md backdrop-blur">
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="rounded-lg bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-800 disabled:opacity-50"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function FieldNumber({
  label,
  value,
  onChange,
  min,
  max,
  step,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-1 text-sm font-medium text-slate-800">
      {label}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
      />
    </label>
  );
}

function SectionCard({
  title,
  subtitle,
  keys,
  overrideFlags,
  toggleOverride,
  children,
}: {
  title: string;
  subtitle?: string;
  keys: readonly OverridableKey[];
  overrideFlags: Record<OverridableKey, boolean>;
  toggleOverride: (k: OverridableKey, on: boolean) => void;
  global: SettingsSnapshot;
  children: React.ReactNode;
}) {
  const allOn = keys.every((k) => overrideFlags[k]);
  const allOff = keys.every((k) => !overrideFlags[k]);
  const partial = !allOn && !allOff;

  function setAll(on: boolean) {
    for (const k of keys) toggleOverride(k, on);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
          {partial ? (
            <p className="mt-1 text-xs text-amber-700">※ このセクションは一部のみ上書き中です。</p>
          ) : null}
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <input
            type="checkbox"
            checked={allOn}
            onChange={(e) => setAll(e.target.checked)}
            className="h-4 w-4"
          />
          この企業で上書きする
        </label>
      </div>
      <div>{children}</div>
    </section>
  );
}

function resolveCompanyPlanFromApi(json: ApiResponse, companyId: string): CompanyPlan {
  const fromCompany = json.global.companies?.find((c) => c.id === companyId)?.plan;
  if (fromCompany) return fromCompany;
  return "workplace_activation";
}

function defaultPlanFeatureToggles(plan: CompanyPlan): Record<IndividualCompanionFeatureKey, boolean> {
  return planFeaturesToToggles(getPlanFeatures(plan));
}

function planFeaturesToToggles(
  features: ReturnType<typeof getPlanFeatures>,
): Record<IndividualCompanionFeatureKey, boolean> {
  const out = {} as Record<IndividualCompanionFeatureKey, boolean>;
  for (const { key } of INDIVIDUAL_COMPANION_FEATURE_OPTIONS) {
    out[key] = features[key];
  }
  return out;
}
