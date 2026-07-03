/**
 * 「マッチID」「ユーザーID」から、その文脈に効く実効的なアプリ設定
 * （= グローバル設定 + 企業/プログラム上書き）を取得するための薄いヘルパー群。
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

/** マッチに紐付くプログラム（または企業の既定プログラム）から実効設定を得る。 */
export async function getEffectiveAppSettingsForMatch(
  matchId: string,
): Promise<EffectiveAppSettings> {
  const match = await getMatchById(matchId);
  if (!match) return getEffectiveAppSettings({});

  const client = await getUserById(match.clientId);
  const companyId = ((client as { companyId?: string | null } | null)?.companyId ?? null) || null;

  let programId = match.programId ?? null;
  if (!programId && companyId) {
    const fallback = await ensureDefaultProgramForCompany(companyId);
    programId = fallback?.id ?? null;
    if (programId) {
      await backfillMatchProgramId(matchId, programId).catch(() => undefined);
    }
  }

  return getEffectiveAppSettings({ companyId, programId });
}

/** 任意ユーザーの企業ID から実効設定を得る（プログラム未指定 = 企業既定）。 */
export async function getEffectiveAppSettingsForUser(
  userId: string,
  programId?: string | null,
): Promise<EffectiveAppSettings> {
  const user = await getUserById(userId);
  const companyId = ((user as { companyId?: string | null } | null)?.companyId ?? null) || null;
  let resolvedProgramId = programId ?? null;
  if (!resolvedProgramId && companyId) {
    const fallback = await ensureDefaultProgramForCompany(companyId);
    resolvedProgramId = fallback?.id ?? null;
  }
  return getEffectiveAppSettings({ companyId, programId: resolvedProgramId });
}

export async function getProgramPlanForMatch(matchId: string) {
  const match = await getMatchById(matchId);
  if (!match?.programId) return null;
  const program = await getProgramById(match.programId);
  return program?.plan ?? null;
}
