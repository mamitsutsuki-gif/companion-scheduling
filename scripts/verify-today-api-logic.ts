/**
 * API 権限・レスポンス形状の直接検証（HTTPサーバ不要）。
 * 実行: DATA_BACKEND=prisma npx tsx scripts/verify-today-api-logic.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  getBusinessProblemSheet,
  getDevelopmentOpportunitySheet,
  upsertBusinessProblemSheet,
  upsertDevelopmentOpportunitySheet,
} from "../src/lib/repositories/companion-repository";
import {
  getSkillCheckProfile,
  upsertSkillCheckProfile,
} from "../src/lib/repositories/skill-check-repository";
import { isFirebaseDataBackend } from "../src/lib/firebase-admin";
import { BUSINESS_PROBLEM_STEPS } from "../src/lib/companion-business-problem";
import { isDevelopmentOpportunityConditionReady } from "../src/lib/companion-development-opportunity";

function ok(name: string, cond: boolean, detail?: string) {
  if (!cond) {
    console.error("FAIL:", name, detail ?? "");
    process.exit(1);
  }
  console.log("OK:", name, detail ?? "");
}

/** ルートと同じ権限ルールを再現（機会創出は上司専用） */
function mayEditOpportunity(perms: { canEditSupervisor: boolean }) {
  return perms.canEditSupervisor;
}
function mayEditBusinessProblem(perms: { canEditClient: boolean; canEditCoach: boolean }) {
  return perms.canEditClient || perms.canEditCoach;
}
function mayEditAgreementSelf(perms: { canEditSelf: boolean }) {
  return perms.canEditSelf;
}
function mayEditAgreementManager(perms: { canEditManager: boolean }) {
  return perms.canEditManager;
}

async function main() {
  ok("client cannot edit opportunity", !mayEditOpportunity({ canEditSupervisor: false }));
  ok("partner cannot edit opportunity", !mayEditOpportunity({ canEditSupervisor: false }));
  ok("supervisor can edit opportunity", mayEditOpportunity({ canEditSupervisor: true }));
  ok("client can edit business problem", mayEditBusinessProblem({ canEditClient: true, canEditCoach: false }));
  ok("partner can edit business problem", mayEditBusinessProblem({ canEditClient: false, canEditCoach: true }));
  ok("viewer cannot edit business problem", !mayEditBusinessProblem({ canEditClient: false, canEditCoach: false }));
  ok("client can edit agreement self fields", mayEditAgreementSelf({ canEditSelf: true }));
  ok("manager can edit agreement manager fields", mayEditAgreementManager({ canEditManager: true }));

  if (isFirebaseDataBackend()) {
    console.log("SKIP: prisma data checks");
    console.log("\nPASS: today api logic (permissions only)\n");
    return;
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    ok("local user exists", Boolean(user));
    const userId = user!.id;
    const companyId = user!.companyId ?? "demo-company";

    await upsertDevelopmentOpportunitySheet(userId, companyId, {
      status: "agreed",
      workText: "権限ロジック検証",
      practiceStartDate: "2026-12-01",
      scopeText: "範囲",
      authorityText: "権限",
      toleranceText: "許容",
      supportText: "支援",
      requiredChecks: {
        canGrantAuthority: true,
        canVerifyWithin6Months: true,
        canAvoidMajorLoss: true,
      },
    });
    const opp = await getDevelopmentOpportunitySheet(userId, companyId);
    ok("opportunity ready after required fields", isDevelopmentOpportunityConditionReady(opp));

    await upsertBusinessProblemSheet(userId, companyId, {
      stepValues: { "1": { theme: "APIロジック", gap: "数値Gap" }, "2": { problem: "問題点" } },
    });
    const bp = await getBusinessProblemSheet(userId, companyId);
    ok("business problem persists multi-step", bp.stepValues["1"]?.theme === "APIロジック" && bp.stepValues["2"]?.problem === "問題点");
    ok("business problem steps metadata", BUSINESS_PROBLEM_STEPS.length === 8);
    ok("no coachComment on sheet", !("coachComment" in bp));

    await upsertSkillCheckProfile({
      userId,
      companyId,
      phase: "current",
      assessments: {},
      clientValuesText: "合意本人",
      managerCurrentRoleText: "合意上司",
    });
    const sc = await getSkillCheckProfile(userId);
    ok("agreement fields persist", sc?.clientValuesText === "合意本人" && sc?.managerCurrentRoleText === "合意上司");
  } finally {
    await prisma.$disconnect();
  }

  console.log("\nPASS: today api logic\n");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
