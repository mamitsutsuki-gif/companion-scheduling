import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { resolveSkillCheckAccessForUser } from "@/lib/skill-check-access";
import {
  getCompanySkillDefinitions,
  getSkillCheckProfile,
} from "@/lib/repositories/skill-check-repository";
import { normalizeSkillCheckProfile } from "@/lib/skill-check";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  const access = await resolveSkillCheckAccessForUser(session.sub, {
    id: session.sub,
    role: session.role,
  });
  if ("error" in access) {
    if (access.error === "plan_disabled") {
      return jsonOk({ skills: [], focusSkillIds: [], focusSkillOptions: [] });
    }
    return jsonError("取得できません。", 403);
  }
  const [skills, profile] = await Promise.all([
    getCompanySkillDefinitions(access.companyId),
    getSkillCheckProfile(access.targetUserId),
  ]);
  const normalized =
    profile ??
    normalizeSkillCheckProfile(access.targetUserId, access.companyId, {});
  const focusSkillOptions = skills.filter((s) => normalized.focusSkillIds.includes(s.id));
  return jsonOk({
    skills,
    focusSkillIds: normalized.focusSkillIds,
    focusSkillOptions: focusSkillOptions.map((s) => ({ id: s.id, name: s.name })),
  });
}
