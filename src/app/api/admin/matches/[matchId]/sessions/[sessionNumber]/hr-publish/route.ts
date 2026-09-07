import { requireAdminish, requireAdminWriter } from "@/lib/admin-access";
import {
  getRoleplaySessionForNumber,
  validateRoleplayClientSaveFields,
  type RoleplaySession,
} from "@/lib/coaching-roleplay";
import {
  coachingSessionModeContextFromEffective,
  isCoachingRoleplaySession,
} from "@/lib/coaching-session-mode";
import { getEffectiveAppSettingsForMatch } from "@/lib/effective-app-settings";
import { jsonError, jsonOk } from "@/lib/json";
import { getRoleplayStore } from "@/lib/repositories/coaching-repository";
import { getMatchById } from "@/lib/repositories/match-repository";
import {
  deleteSessionHrPublish,
  getSessionHrPublish,
  upsertSessionHrPublish,
} from "@/lib/repositories/session-hr-publish-repository";
import { readSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ matchId: string; sessionNumber: string }> };

type PublishContext =
  | { ok: true; roleplaySession: RoleplaySession; clientReady: boolean }
  | { ok: false; response: Response };

async function resolvePublishContext(
  matchId: string,
  sessionNumber: number,
): Promise<PublishContext> {
  const match = await getMatchById(matchId);
  if (!match) return { ok: false, response: jsonError("マッチが見つかりません。", 404) };

  const settings = await getEffectiveAppSettingsForMatch(matchId);
  if (settings.companyPlan !== "coaching_management_training") {
    return {
      ok: false,
      response: jsonError("このプランでは人事向け振り返り公開を利用できません。", 403),
    };
  }

  const modeCtx = coachingSessionModeContextFromEffective(settings);
  if (!isCoachingRoleplaySession(modeCtx, sessionNumber)) {
    return {
      ok: false,
      response: jsonError("この回はロールプレイ評価の対象ではありません。", 403),
    };
  }

  const store = await getRoleplayStore(matchId);
  const roleplaySession = getRoleplaySessionForNumber(store, sessionNumber);
  const clientReady =
    Boolean(roleplaySession.clientSubmittedAt) &&
    validateRoleplayClientSaveFields(roleplaySession) === null;

  return { ok: true, roleplaySession, clientReady };
}

function parseSessionNumber(raw: string) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/** 公開状態の確認（ADMIN / ADMIN_ASSISTANT） */
export async function GET(_request: Request, context: RouteContext) {
  const session = await readSession();
  const denied = requireAdminish(session);
  if (denied) return jsonError(denied.error, denied.status);

  const { matchId, sessionNumber } = await context.params;
  const n = parseSessionNumber(sessionNumber);
  if (n == null) return jsonError("回数の指定が不正です。");

  const ctx = await resolvePublishContext(matchId, n);
  if (!ctx.ok) return ctx.response;

  const published = await getSessionHrPublish(matchId, n);
  return jsonOk({
    matchId,
    sessionNumber: n,
    published: Boolean(published),
    publishedAt: published?.publishedAt ?? null,
    publishedBy: published?.publishedBy ?? null,
    canPublish: ctx.clientReady,
    clientSubmitted: Boolean(ctx.roleplaySession.clientSubmittedAt),
  });
}

/** 人事向けにクライアント振り返りを公開（ADMIN のみ） */
export async function POST(_request: Request, context: RouteContext) {
  const session = await readSession();
  const denied = requireAdminWriter(session);
  if (denied) return jsonError(denied.error, denied.status);

  const { matchId, sessionNumber } = await context.params;
  const n = parseSessionNumber(sessionNumber);
  if (n == null) return jsonError("回数の指定が不正です。");

  const ctx = await resolvePublishContext(matchId, n);
  if (!ctx.ok) return ctx.response;

  if (!ctx.clientReady) {
    return jsonError(
      "クライアントのロールプレイ振り返り（提出済み・必須項目完了）が揃っていないため公開できません。",
      409,
    );
  }

  const row = await upsertSessionHrPublish({
    matchId,
    sessionNumber: n,
    publishedBy: session!.sub,
  });

  return jsonOk({
    ok: true,
    matchId,
    sessionNumber: n,
    published: true,
    publishedAt: row.publishedAt,
    publishedBy: row.publishedBy,
  });
}

/** 人事向け公開を取り消し（ADMIN のみ） */
export async function DELETE(_request: Request, context: RouteContext) {
  const session = await readSession();
  const denied = requireAdminWriter(session);
  if (denied) return jsonError(denied.error, denied.status);

  const { matchId, sessionNumber } = await context.params;
  const n = parseSessionNumber(sessionNumber);
  if (n == null) return jsonError("回数の指定が不正です。");

  const match = await getMatchById(matchId);
  if (!match) return jsonError("マッチが見つかりません。", 404);

  await deleteSessionHrPublish(matchId, n);
  return jsonOk({ ok: true, matchId, sessionNumber: n, published: false });
}
