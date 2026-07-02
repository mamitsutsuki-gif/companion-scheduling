/**
 * 企業ごとの導入プランと、プランごとに使える機能の定義。
 * 企業登録時に `CompanyOption.plan` として保存する。
 */
export type CompanyPlan =
  | "workplace_activation"
  | "individual_companion"
  | "coaching_management_training";

export const DEFAULT_COMPANY_PLAN: CompanyPlan = "workplace_activation";

export const COMPANY_PLAN_OPTIONS: Array<{ value: CompanyPlan; label: string }> = [
  { value: "workplace_activation", label: "職場活性プラン" },
  { value: "individual_companion", label: "個別伴走プラン" },
  { value: "coaching_management_training", label: "コーチングマネジメント研修" },
];

export function companyPlanLabel(plan: CompanyPlan | null | undefined): string {
  const hit = COMPANY_PLAN_OPTIONS.find((o) => o.value === plan);
  return hit?.label ?? COMPANY_PLAN_OPTIONS[0]!.label;
}

export function normalizeCompanyPlan(input: unknown): CompanyPlan {
  if (typeof input !== "string") return DEFAULT_COMPANY_PLAN;
  if (
    input === "workplace_activation" ||
    input === "individual_companion" ||
    input === "coaching_management_training"
  ) {
    return input;
  }
  return DEFAULT_COMPANY_PLAN;
}

export type PlanFeatures = {
  overview: boolean;
  clientInfo: boolean;
  chat: boolean;
  schedule: boolean;
  fta: boolean;
  sessions: boolean;
  skillCheck: boolean;
  pdca: boolean;
  reflection: boolean;
  lifelineChart: boolean;
  summaryReport: boolean;
  /** コーチングマネジメント研修: ロールプレイング・フィードバック */
  coachingRoleplay: boolean;
  /** コーチングマネジメント研修: 質問リスト（4象限） */
  coachingQuestions: boolean;
  /** コーチングマネジメント研修: アイスブレイクネタ帳 */
  coachingIcebreaker: boolean;
  /** コーチングマネジメント研修: 1on1フォーマット（プレースホルダー） */
  coachingOneOnOneFormat: boolean;
  /** セッション後フィードバック・レポートの設問を管理者がすべて設定可能 */
  configurableSessionQuestions: boolean;
  /** プラン機能が未実装のプレースホルダ表示 */
  planComingSoon: boolean;
};

/** 個別伴走プランで企業ごとに ON/OFF できる成果物タブ */
export type IndividualCompanionFeatureKey =
  | "fta"
  | "skillCheck"
  | "pdca"
  | "reflection"
  | "lifelineChart"
  | "summaryReport";

export const INDIVIDUAL_COMPANION_FEATURE_OPTIONS: Array<{
  key: IndividualCompanionFeatureKey;
  label: string;
}> = [
  { key: "fta", label: "自分FTA" },
  { key: "skillCheck", label: "スキルチェック" },
  { key: "lifelineChart", label: "ライフラインチャート" },
  { key: "pdca", label: "PDCAシート" },
  { key: "reflection", label: "振り返りシート" },
  { key: "summaryReport", label: "サマリーレポート" },
];

export type PlanFeatureOverrides = Partial<Record<IndividualCompanionFeatureKey, boolean>>;

/** コーチング研修プラン: クライアント公開・パートナー共有の企業設定 */
export type CoachingPlanSettingsOverrides = {
  publishQuestions?: boolean;
  publishOneOnOneFormat?: boolean;
  shareIcebreakerWithPartner?: boolean;
  shareQuestionsWithPartner?: boolean;
  shareOneOnOneFormatWithPartner?: boolean;
};

export type CoachingPlanSettings = {
  publishQuestions: boolean;
  publishOneOnOneFormat: boolean;
  shareIcebreakerWithPartner: boolean;
  shareQuestionsWithPartner: boolean;
  shareOneOnOneFormatWithPartner: boolean;
};

export const COACHING_CLIENT_PUBLISH_OPTIONS: Array<{
  key: keyof Pick<CoachingPlanSettingsOverrides, "publishQuestions" | "publishOneOnOneFormat">;
  label: string;
  description: string;
}> = [
  {
    key: "publishQuestions",
    label: "質問リスト",
    description: "チェックを入れると、クライアントのマッチルームで質問リストタブが利用可能になります。",
  },
  {
    key: "publishOneOnOneFormat",
    label: "1on1フォーマット",
    description: "チェックを入れると、クライアントのマッチルームで1on1フォーマットタブが利用可能になります。",
  },
];

export const COACHING_PARTNER_SHARE_OPTIONS: Array<{
  key: keyof Pick<
    CoachingPlanSettingsOverrides,
    "shareIcebreakerWithPartner" | "shareQuestionsWithPartner" | "shareOneOnOneFormatWithPartner"
  >;
  label: string;
  description: string;
}> = [
  {
    key: "shareIcebreakerWithPartner",
    label: "アイスブレイク",
    description: "チェックを入れると、マッチしたパートナーが担当クライアントのアイスブレイクを閲覧できます。",
  },
  {
    key: "shareQuestionsWithPartner",
    label: "質問リスト",
    description:
      "チェックを入れると、マッチしたパートナーが担当クライアントの質問リストを閲覧できます（クライアント公開後のみ）。",
  },
  {
    key: "shareOneOnOneFormatWithPartner",
    label: "1on1フォーマット",
    description:
      "チェックを入れると、マッチしたパートナーが担当クライアントの1on1フォーマットを閲覧できます（クライアント公開後のみ）。",
  },
];

export function normalizeCoachingPlanSettingsOverrides(
  input: unknown,
): CoachingPlanSettingsOverrides | undefined {
  if (!input || typeof input !== "object") return undefined;
  const raw = input as Record<string, unknown>;
  const out: CoachingPlanSettingsOverrides = {};
  if (typeof raw.publishQuestions === "boolean") out.publishQuestions = raw.publishQuestions;
  if (typeof raw.publishOneOnOneFormat === "boolean") {
    out.publishOneOnOneFormat = raw.publishOneOnOneFormat;
  }
  if (typeof raw.shareIcebreakerWithPartner === "boolean") {
    out.shareIcebreakerWithPartner = raw.shareIcebreakerWithPartner;
  }
  if (typeof raw.shareQuestionsWithPartner === "boolean") {
    out.shareQuestionsWithPartner = raw.shareQuestionsWithPartner;
  }
  if (typeof raw.shareOneOnOneFormatWithPartner === "boolean") {
    out.shareOneOnOneFormatWithPartner = raw.shareOneOnOneFormatWithPartner;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function resolveCoachingPlanSettings(
  overrides?: CoachingPlanSettingsOverrides | null,
): CoachingPlanSettings {
  return {
    publishQuestions: overrides?.publishQuestions === true,
    publishOneOnOneFormat: overrides?.publishOneOnOneFormat === true,
    shareIcebreakerWithPartner: overrides?.shareIcebreakerWithPartner === true,
    shareQuestionsWithPartner: overrides?.shareQuestionsWithPartner === true,
    shareOneOnOneFormatWithPartner: overrides?.shareOneOnOneFormatWithPartner === true,
  };
}

export {
  MEETING_PROVIDER_OPTIONS,
  normalizeMeetingProvider,
  meetingProviderLabel,
  type MeetingProvider,
} from "@/lib/meeting-provider-shared";

export function normalizePlanFeatureOverrides(input: unknown): PlanFeatureOverrides | undefined {
  if (!input || typeof input !== "object") return undefined;
  const raw = input as Record<string, unknown>;
  const out: PlanFeatureOverrides = {};
  for (const { key } of INDIVIDUAL_COMPANION_FEATURE_OPTIONS) {
    if (typeof raw[key] === "boolean") out[key] = raw[key];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function getPlanFeatures(plan: CompanyPlan): PlanFeatures {
  switch (plan) {
    case "individual_companion":
      return {
        overview: true,
        clientInfo: true,
        chat: true,
        schedule: true,
        fta: true,
        sessions: true,
        skillCheck: true,
        pdca: true,
        reflection: true,
        lifelineChart: true,
        summaryReport: true,
        coachingRoleplay: false,
        coachingQuestions: false,
        coachingIcebreaker: false,
        coachingOneOnOneFormat: false,
        configurableSessionQuestions: true,
        planComingSoon: false,
      };
    case "coaching_management_training":
      return {
        overview: true,
        clientInfo: false,
        chat: true,
        schedule: true,
        fta: false,
        sessions: true,
        skillCheck: false,
        pdca: false,
        reflection: false,
        lifelineChart: false,
        summaryReport: false,
        coachingRoleplay: false,
        coachingQuestions: false,
        coachingIcebreaker: true,
        coachingOneOnOneFormat: false,
        configurableSessionQuestions: false,
        planComingSoon: false,
      };
    case "workplace_activation":
    default:
      return {
        overview: true,
        clientInfo: true,
        chat: true,
        schedule: true,
        fta: true,
        sessions: true,
        skillCheck: false,
        pdca: false,
        reflection: false,
        lifelineChart: false,
        summaryReport: false,
        coachingRoleplay: false,
        coachingQuestions: false,
        coachingIcebreaker: false,
        coachingOneOnOneFormat: false,
        configurableSessionQuestions: false,
        planComingSoon: false,
      };
  }
}

/** プラン既定値に企業ごとの成果物 ON/OFF を合成する。 */
export function resolvePlanFeatures(
  plan: CompanyPlan,
  overrides?: PlanFeatureOverrides | null,
  coachingSettings?: CoachingPlanSettingsOverrides | null,
): PlanFeatures {
  const base = getPlanFeatures(plan);
  if (plan === "individual_companion" && overrides) {
    const merged = { ...base };
    for (const { key } of INDIVIDUAL_COMPANION_FEATURE_OPTIONS) {
      if (overrides[key] !== undefined) merged[key] = overrides[key]!;
    }
    return merged;
  }
  if (plan === "coaching_management_training") {
    const cs = resolveCoachingPlanSettings(coachingSettings);
    return {
      ...base,
      coachingQuestions: cs.publishQuestions,
      coachingOneOnOneFormat: cs.publishOneOnOneFormat,
    };
  }
  return base;
}

export function resolveCompanyPlan(
  companyId: string | null | undefined,
  companies: Array<{ id: string; plan?: CompanyPlan }>,
): CompanyPlan {
  const id = (companyId ?? "").trim();
  if (!id) return DEFAULT_COMPANY_PLAN;
  const company = companies.find((c) => c.id === id);
  return normalizeCompanyPlan(company?.plan);
}

/**
 * グローバルナビ・ホームの「自分FTA」導線を出すか。
 * クライアント系はペアルーム内タブのみ（プランに応じて match-workspace 側で制御）。
 */
export function shouldShowGlobalFta(
  role: "PARTNER" | "CLIENT" | "CLIENT_ADMIN" | "CLIENT_HR" | string,
  _companyPlan?: CompanyPlan,
): boolean {
  return role === "PARTNER";
}

/** クライアント向け FTA 入力・促しを出すか（マッチ／企業のプラン依存）。 */
export function shouldUseClientFta(
  companyPlan: CompanyPlan,
  overrides?: PlanFeatureOverrides | null,
): boolean {
  return resolvePlanFeatures(companyPlan, overrides).fta;
}
