/**
 * 「マッチID」「ユーザーID」から、その文脈に効く実効的なアプリ設定
 * （= グローバル設定 + 企業/プログラム上書き）を取得するための薄いヘルパー群。
 *
 * プラン判定の正本は「マッチの programId → そのプログラムの plan」。
 * programId が無いレガシーマッチだけ、企業レジストリプランのプログラムへ安全に寄せる
 * （別プランの最古プログラムへは落とさない）。
 */
import {
  getEffectiveAppSettings,
  type EffectiveAppSettings,
} from "@/lib/repositories/app-settings-repository";
import {
  ensureDefaultProgramForCompany,
  getProgramById,
} from "@/lib/repositories/program-repository";
import { getMatchById, backfillMatchProgramId } from "@/lib/repositories/match-repository";
import { getUserById } from "@/lib/repositories/user-repository";
import { resolveCompanyPlan } from "@/lib/company-plan";
import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";

/** マッチに紐付くプログラム（または企業レジストリプランのプログラム）から実効設定を得る。 */
export async function getEffectiveAppSettingsForMatch(
  matchId: string,
): Promise<EffectiveAppSettings> {
  const match = await getMatchById(matchId);
  if (!match) return getEffectiveAppSettings({});

  const client = await getUserById(match.clientId);
  const companyId = ((client as { companyId?: string | null } | null)?.companyId ?? null) || null;

  let programId = match.programId ?? null;
  if (!programId && companyId) {
    // レジストリプランのプログラムのみ採用。別プランへフォールバックしない。
    const fallback = await ensureDefaultProgramForCompany(companyId);
    if (fallback) {
      const settings = await getAppSettingsRow();
      const registryPlan = resolveCompanyPlan(companyId, settings.companies);
      if (fallback.plan === registryPlan) {
        programId = fallback.id;
        await backfillMatchProgramId(matchId, programId).catch(() => undefined);
      }
    }
  }

  return getEffectiveAppSettings({ companyId, programId });
}

/** 任意ユーザーの企業ID から実効設定を得る（プログラム未指定 = 企業レジストリプランのプログラム）。 */
export async function getEffectiveAppSettingsForUser(
  userId: string,
  programId?: string | null,
): Promise<EffectiveAppSettings> {
  const user = await getUserById(userId);
  const companyId = ((user as { companyId?: string | null } | null)?.companyId ?? null) || null;
  let resolvedProgramId = programId ?? null;
  if (!resolvedProgramId && companyId) {
    const fallback = await ensureDefaultProgramForCompany(companyId);
    if (fallback) {
      const settings = await getAppSettingsRow();
      const registryPlan = resolveCompanyPlan(companyId, settings.companies);
      if (fallback.plan === registryPlan) {
        resolvedProgramId = fallback.id;
      }
    }
  }
  return getEffectiveAppSettings({ companyId, programId: resolvedProgramId });
}

export async function getProgramPlanForMatch(matchId: string) {
  const match = await getMatchById(matchId);
  if (!match?.programId) return null;
  const program = await getProgramById(match.programId);
  return program?.plan ?? null;
}
