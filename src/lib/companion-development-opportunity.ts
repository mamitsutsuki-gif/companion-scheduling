/** 育成機会・挑戦役割シート（上司が任せる仕事・権限・支援を記録） */

export type DevelopmentOpportunityStatus = "unset" | "draft" | "agreed" | "active";

export const DEVELOPMENT_OPPORTUNITY_STATUS_OPTIONS: Array<{
  value: DevelopmentOpportunityStatus;
  label: string;
}> = [
  { value: "unset", label: "未設定" },
  { value: "draft", label: "案作成中" },
  { value: "agreed", label: "合意済み" },
  { value: "active", label: "実践中" },
];

export type DevelopmentOpportunityRequiredChecks = {
  canGrantAuthority: boolean;
  canVerifyWithin6Months: boolean;
  canAvoidMajorLoss: boolean;
};

export type DevelopmentOpportunityRecommendedChecks = {
  needsHigherAction: boolean;
  hasThinkingRoom: boolean;
  needsCoordination: boolean;
  clearResponsibility: boolean;
  objectiveResults: boolean;
};

export type DevelopmentOpportunitySheet = {
  userId: string;
  companyId: string;
  status: DevelopmentOpportunityStatus;
  /** 与える仕事 */
  workText: string;
  /** 実践開始期限 (YYYY-MM-DD) */
  practiceStartDate: string;
  /** 任せる理由 */
  reasonText: string;
  /** 任せる役割 */
  scopeText: string;
  /** 付与する権限 */
  authorityText: string;
  /** 関係者 */
  stakeholdersText: string;
  /** 成果指標 */
  metricsText: string;
  /** 失敗許容範囲 */
  toleranceText: string;
  /** 上司の支援 */
  supportText: string;
  /** 本人のアクションアイテム（FTA等を踏まえた実践内容） */
  actionItemsText: string;
  /** フィードバックポイント */
  feedbackPointsText: string;
  requiredChecks: DevelopmentOpportunityRequiredChecks;
  recommendedChecks: DevelopmentOpportunityRecommendedChecks;
  updatedAt: string;
};

export const DEVELOPMENT_OPPORTUNITY_TEXT_MAX = 2000;

export type DevelopmentOpportunityTemplate = {
  id: string;
  label: string;
  summary: string;
  workText: string;
  reasonText: string;
  scopeText: string;
  authorityText: string;
  stakeholdersText: string;
  metricsText: string;
  toleranceText: string;
  supportText: string;
};

/** 挑戦機会候補バンク（ADVデモ仕様） */
export const DEVELOPMENT_OPPORTUNITY_TEMPLATES: DevelopmentOpportunityTemplate[] = [
  {
    id: "collaboration",
    label: "巻き込み",
    summary: "部門横断会議の推進",
    workText: "次期システム刷新の要件整理リード",
    reasonText: "要件整理の経験を積み、関係者調整力を伸ばすため",
    scopeText: "要件ヒアリング、優先度案の作成、関係者への説明",
    authorityText: "関係部署への直接ヒアリング、優先度の一次決定",
    stakeholdersText: "情報システム部、業務部門リーダー",
    metricsText: "要件定義書の合意、関係者満足度",
    toleranceText: "スケジュール1週間の遅延は許容。要件漏れは上司と即共有",
    supportText: "週1回の進捗確認、関係者への事前根回し",
  },
  {
    id: "decision",
    label: "判断",
    summary: "複数案の比較・推奨案提示",
    workText: "複数案の比較検討と推奨案の提示",
    reasonText: "判断の根拠を言語化し、関係者を巻き込む力を伸ばすため",
    scopeText: "選択肢の整理、比較軸の設定、推奨案の作成と説明",
    authorityText: "比較検討会議のファシリテーション、一次案の提示",
    stakeholdersText: "部門長、関連チームリーダー",
    metricsText: "推奨案の採択率、関係者の納得度",
    toleranceText: "判断遅延は上司と相談。重大なコスト影響は事前承認",
    supportText: "判断前の壁打ち、関係者への根回し",
  },
  {
    id: "people",
    label: "人材育成",
    summary: "後輩への仕事委譲",
    workText: "後輩への仕事委譲と育成",
    reasonText: "任せ方とフィードバックの経験を積むため",
    scopeText: "業務の切り出し、期待の伝達、進捗確認、FB",
    authorityText: "後輩への業務割当、進捗確認の実施",
    stakeholdersText: "後輩2名、チームメンバー",
    metricsText: "後輩の自走度、業務品質の維持",
    toleranceText: "初回の品質低下は許容。重大ミスは即介入",
    supportText: "委譲前の設計相談、月1回の振り返り",
  },
];

export const DEVELOPMENT_OPPORTUNITY_REQUIRED_CHECK_LABELS: Array<{
  key: keyof DevelopmentOpportunityRequiredChecks;
  label: string;
}> = [
  { key: "canGrantAuthority", label: "上司が必要な権限を実際に付与できる" },
  { key: "canVerifyWithin6Months", label: "6か月以内に成果を客観的に確認できる" },
  { key: "canAvoidMajorLoss", label: "重大な損失を避けられる" },
];

export const DEVELOPMENT_OPPORTUNITY_RECOMMENDED_CHECK_LABELS: Array<{
  key: keyof DevelopmentOpportunityRecommendedChecks;
  label: string;
}> = [
  { key: "needsHigherAction", label: "現在より一段高い行動が必要" },
  { key: "hasThinkingRoom", label: "本人に考える余地がある" },
  { key: "needsCoordination", label: "他者との調整が必要" },
  { key: "clearResponsibility", label: "本人の責任範囲が明確" },
  { key: "objectiveResults", label: "成果を客観的に説明できる" },
];

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

function trimText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function asBool(value: unknown): boolean {
  return value === true;
}

function normalizeStatus(value: unknown): DevelopmentOpportunityStatus {
  if (value === "draft" || value === "agreed" || value === "active" || value === "unset") return value;
  return "unset";
}

function normalizeDate(value: unknown): string {
  if (typeof value !== "string") return "";
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "";
  return v;
}

export function isDevelopmentOpportunityConditionReady(sheet: DevelopmentOpportunitySheet): boolean {
  if (sheet.status === "unset" || sheet.status === "draft") return false;
  const requiredFilled =
    Boolean(sheet.workText.trim()) &&
    Boolean(sheet.practiceStartDate) &&
    Boolean(sheet.scopeText.trim()) &&
    Boolean(sheet.authorityText.trim()) &&
    Boolean(sheet.toleranceText.trim()) &&
    Boolean(sheet.supportText.trim());
  const checksOk =
    sheet.requiredChecks.canGrantAuthority &&
    sheet.requiredChecks.canVerifyWithin6Months &&
    sheet.requiredChecks.canAvoidMajorLoss;
  return requiredFilled && checksOk;
}

export function normalizeDevelopmentOpportunitySheet(
  userId: string,
  companyId: string,
  input: unknown,
): DevelopmentOpportunitySheet {
  const raw = asRecord(input);
  const requiredRaw = asRecord(raw.requiredChecks);
  const recommendedRaw = asRecord(raw.recommendedChecks);
  return {
    userId,
    companyId,
    status: normalizeStatus(raw.status),
    workText: trimText(raw.workText, DEVELOPMENT_OPPORTUNITY_TEXT_MAX),
    practiceStartDate: normalizeDate(raw.practiceStartDate),
    reasonText: trimText(raw.reasonText, DEVELOPMENT_OPPORTUNITY_TEXT_MAX),
    scopeText: trimText(raw.scopeText, DEVELOPMENT_OPPORTUNITY_TEXT_MAX),
    authorityText: trimText(raw.authorityText, DEVELOPMENT_OPPORTUNITY_TEXT_MAX),
    stakeholdersText: trimText(raw.stakeholdersText, DEVELOPMENT_OPPORTUNITY_TEXT_MAX),
    metricsText: trimText(raw.metricsText, DEVELOPMENT_OPPORTUNITY_TEXT_MAX),
    toleranceText: trimText(raw.toleranceText, DEVELOPMENT_OPPORTUNITY_TEXT_MAX),
    supportText: trimText(raw.supportText, DEVELOPMENT_OPPORTUNITY_TEXT_MAX),
    actionItemsText: trimText(raw.actionItemsText, DEVELOPMENT_OPPORTUNITY_TEXT_MAX),
    feedbackPointsText: trimText(raw.feedbackPointsText, DEVELOPMENT_OPPORTUNITY_TEXT_MAX),
    requiredChecks: {
      canGrantAuthority: asBool(requiredRaw.canGrantAuthority),
      canVerifyWithin6Months: asBool(requiredRaw.canVerifyWithin6Months),
      canAvoidMajorLoss: asBool(requiredRaw.canAvoidMajorLoss),
    },
    recommendedChecks: {
      needsHigherAction: asBool(recommendedRaw.needsHigherAction),
      hasThinkingRoom: asBool(recommendedRaw.hasThinkingRoom),
      needsCoordination: asBool(recommendedRaw.needsCoordination),
      clearResponsibility: asBool(recommendedRaw.clearResponsibility),
      objectiveResults: asBool(recommendedRaw.objectiveResults),
    },
    updatedAt:
      typeof raw.updatedAt === "string" && raw.updatedAt.trim()
        ? raw.updatedAt
        : new Date().toISOString(),
  };
}

export function applyDevelopmentOpportunityTemplate(
  sheet: DevelopmentOpportunitySheet,
  template: DevelopmentOpportunityTemplate,
): DevelopmentOpportunitySheet {
  return {
    ...sheet,
    status: sheet.status === "unset" ? "draft" : sheet.status,
    workText: template.workText,
    reasonText: template.reasonText,
    scopeText: template.scopeText,
    authorityText: template.authorityText,
    stakeholdersText: template.stakeholdersText,
    metricsText: template.metricsText,
    toleranceText: template.toleranceText,
    supportText: template.supportText,
  };
}
