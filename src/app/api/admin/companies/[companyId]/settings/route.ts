import { z } from "zod";
import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import {
  type AppSettingsOverridableFields,
  deleteCompanyAppSettingsOverride,
  getAppSettingsRow,
  getCompanyAppSettingsOverride,
  getEffectiveAppSettings,
  upsertCompanyAppSettingsOverride,
} from "@/lib/repositories/app-settings-repository";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ companyId: string }> };

const availabilityOptionSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  startMin: z.number().int().min(0).max(60 * 24),
  endMin: z.number().int().min(0).max(60 * 24),
});

const extraQuestionsSchema = z.record(z.string(), z.array(z.string().max(500)).max(8));

const guidelineEntrySchema = z.object({
  client: z.string().max(4000),
  partner: z.string().max(4000),
});
const sessionGuidelinesSchema = z.record(z.string(), guidelineEntrySchema);

const OVERRIDABLE_KEYS = [
  "slotDurationMinutes",
  "totalSessions",
  "timezone",
  "availabilitySlotOptions",
  "partnerExtraQuestionsByRound",
  "sessionGuidelinesByRound",
  "slotEarliestHour",
  "slotLatestHour",
  "allowWeekends",
] as const satisfies readonly (keyof AppSettingsOverridableFields)[];

const patchSchema = z.object({
  slotDurationMinutes: z.number().int().min(5).max(240).optional(),
  totalSessions: z.number().int().min(1).max(60).optional(),
  timezone: z.string().min(1).max(64).optional(),
  availabilitySlotOptions: z.array(availabilityOptionSchema).max(32).optional(),
  partnerExtraQuestionsByRound: extraQuestionsSchema.optional(),
  sessionGuidelinesByRound: sessionGuidelinesSchema.optional(),
  slotEarliestHour: z.number().int().min(0).max(24).optional(),
  slotLatestHour: z.number().int().min(0).max(24).optional(),
  allowWeekends: z.boolean().optional(),
  /** ここに入れたフィールドは「上書きを解除（=全体設定を使う）」として扱われる */
  clearFields: z
    .array(z.enum(OVERRIDABLE_KEYS))
    .max(OVERRIDABLE_KEYS.length)
    .optional(),
});

/**
 * 企業ごとの設定（上書き）を取得する。閲覧専用ビュー。
 * 編集は PATCH を使うこと。
 */
export async function GET(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "ADMIN_ASSISTANT"))
    return jsonError("権限がありません。", 403);
  const { companyId } = await ctx.params;
  if (!companyId) return jsonError("企業IDが指定されていません。", 400);

  const [settings, override] = await Promise.all([
    getAppSettingsRow(),
    getCompanyAppSettingsOverride(companyId),
  ]);
  const registered = settings.companies.find((c) => c.id === companyId) ?? null;
  const effective = await getEffectiveAppSettings({ companyId, global: settings, override });

  return jsonOk({
    company: registered ? { id: registered.id, name: registered.name } : null,
    isRegistered: Boolean(registered),
    override: override ?? null,
    global: settings,
    effective,
  });
}

/**
 * 企業ごとの上書き設定を更新する。
 * - 渡されたフィールドはその値で上書き
 * - `clearFields` に含まれるフィールドは上書きを解除（=全体設定にフォールバック）
 * - 上書きが完全に空になった場合、ドキュメントごと削除する
 */
export async function PATCH(request: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session || session.role !== "ADMIN") return jsonError("権限がありません。", 403);
  const { companyId } = await ctx.params;
  if (!companyId) return jsonError("企業IDが指定されていません。", 400);

  const settings = await getAppSettingsRow();
  if (!settings.companies.some((c) => c.id === companyId)) {
    return jsonError("登録されていない企業IDです。先に「アプリ設定 → 企業（テナント）」で登録してください。", 400);
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("入力内容が不正です。");

  const { clearFields, ...rest } = parsed.data;
  if (clearFields && clearFields.length > 0) {
    for (const k of clearFields) {
      if (rest[k] !== undefined) {
        return jsonError(`同じフィールド (${k}) を clear と set 両方で指定することはできません。`);
      }
    }
  }
  if (
    typeof rest.slotEarliestHour === "number" &&
    typeof rest.slotLatestHour === "number" &&
    rest.slotEarliestHour >= rest.slotLatestHour
  ) {
    return jsonError("候補の制約：開始時刻は終了時刻より前にしてください。");
  }

  const next = await upsertCompanyAppSettingsOverride(companyId, {
    ...rest,
    clearFields,
  });

  const onlyMeta = !next || Object.keys(next).every((k) => k === "companyId" || k === "updatedAt");
  if (onlyMeta) {
    await deleteCompanyAppSettingsOverride(companyId);
  }

  const final = await getCompanyAppSettingsOverride(companyId);
  const effective = await getEffectiveAppSettings({ companyId, global: settings, override: final });
  return jsonOk({ ok: true, override: final, effective });
}

/** すべての上書きを一括削除（=全項目を全体設定に戻す） */
export async function DELETE(_req: Request, ctx: RouteContext) {
  const session = await readSession();
  if (!session || session.role !== "ADMIN") return jsonError("権限がありません。", 403);
  const { companyId } = await ctx.params;
  if (!companyId) return jsonError("企業IDが指定されていません。", 400);
  await deleteCompanyAppSettingsOverride(companyId);
  return jsonOk({ ok: true });
}
