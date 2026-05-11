/**
 * 「マッチID」「ユーザーID」から、その文脈に効く実効的なアプリ設定
 * （= グローバル設定 + 当該企業の上書き）を取得するための薄いヘルパー群。
 *
 * 既存の `getAppSettingsRow()` をそのまま使い続ける場所もあるため、
 * 文脈（マッチ・ユーザー）が分かる API ルート / リポジトリ関数だけ
 * 順次このヘルパー経由に置き換えていく。
 *
 * 配置メモ:
 *   getEffectiveAppSettings は app-settings-repository に同居しているが、
 *   そこから match-repository / user-repository を import すると循環依存に
 *   なるため、このファイル（より外側）で両者を橋渡ししている。
 */
import {
  getEffectiveAppSettings,
  type EffectiveAppSettings,
} from "@/lib/repositories/app-settings-repository";
import { getMatchById } from "@/lib/repositories/match-repository";
import { getUserById } from "@/lib/repositories/user-repository";

/** マッチに紐付くクライアントの企業ID から実効設定を得る。 */
export async function getEffectiveAppSettingsForMatch(
  matchId: string,
): Promise<EffectiveAppSettings> {
  const match = await getMatchById(matchId);
  if (!match) return getEffectiveAppSettings({});
  const client = await getUserById(match.clientId);
  const companyId = ((client as { companyId?: string | null } | null)?.companyId ?? null) || null;
  return getEffectiveAppSettings({ companyId });
}

/** 任意ユーザーの企業ID から実効設定を得る（クライアント / クライアント管理者向け）。 */
export async function getEffectiveAppSettingsForUser(
  userId: string,
): Promise<EffectiveAppSettings> {
  const user = await getUserById(userId);
  const companyId = ((user as { companyId?: string | null } | null)?.companyId ?? null) || null;
  return getEffectiveAppSettings({ companyId });
}
