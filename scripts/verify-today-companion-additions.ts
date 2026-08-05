/**
 * 今日追加した個別伴走シート（成長・挑戦合意／育成機会／業務課題）のスモーク検証。
 * 実行: DATA_BACKEND=prisma npx tsx scripts/verify-today-companion-additions.ts
 */
import "dotenv/config";
import { getPlanFeatures } from "../src/lib/company-plan";
import {
  normalizeSkillCheckProfile,
  SKILL_CHECK_AGREEMENT_TEXT_MAX,
} from "../src/lib/skill-check";
import {
  applyDevelopmentOpportunityTemplate,
  DEVELOPMENT_OPPORTUNITY_TEMPLATES,
  isDevelopmentOpportunityConditionReady,
  normalizeDevelopmentOpportunitySheet,
} from "../src/lib/companion-development-opportunity";
import {
  BUSINESS_PROBLEM_STEPS,
  businessProblemStepFillCounts,
  businessProblemTheme,
  normalizeBusinessProblemSheet,
} from "../src/lib/companion-business-problem";
import {
  getBusinessProblemSheet,
  getDevelopmentOpportunitySheet,
  upsertBusinessProblemSheet,
  upsertDevelopmentOpportunitySheet,
} from "../src/lib/repositories/companion-repository";
import { isFirebaseDataBackend } from "../src/lib/firebase-admin";
import {
  getSkillCheckProfile,
  upsertSkillCheckProfile,
} from "../src/lib/repositories/skill-check-repository";

const STAGING = "https://companion-scheduling--motive-iji-cloud-1e300.asia-east1.hosted.app";

function ok(name: string, cond: boolean, detail?: string) {
  if (!cond) {
    console.error("FAIL:", name, detail ?? "");
    process.exit(1);
  }
  console.log("OK:", name, detail ?? "");
}

function checkPlanFeatures() {
  const ic = getPlanFeatures("individual_companion");
  ok(
    "individual_companion features ON",
    ic.developmentOpportunity && !ic.businessProblem && ic.skillCheck && ic.fta,
  );
  const other = getPlanFeatures("coaching_management_training");
  ok(
    "coaching plan features OFF",
    !other.developmentOpportunity && !other.businessProblem,
  );
}

function checkAgreementNormalize() {
  const long = "あ".repeat(SKILL_CHECK_AGREEMENT_TEXT_MAX + 50);
  const p = normalizeSkillCheckProfile("u1", "c1", {
    focusSkillIds: ["engagement"],
    clientValuesText: " 大切  ",
    clientSixMonthGoalText: long,
    managerCurrentRoleText: "現役割",
    managerNextRoleText: "次役割",
  });
  ok("agreement fields normalized", p.clientValuesText === "大切");
  ok(
    "agreement max length",
    p.clientSixMonthGoalText.length === SKILL_CHECK_AGREEMENT_TEXT_MAX,
  );
  ok("agreement manager fields", p.managerCurrentRoleText === "現役割" && p.managerNextRoleText === "次役割");
}

function checkOpportunityNormalize() {
  let sheet = normalizeDevelopmentOpportunitySheet("u1", "c1", {});
  ok("opportunity default unset", sheet.status === "unset" && !isDevelopmentOpportunityConditionReady(sheet));
  const tpl = DEVELOPMENT_OPPORTUNITY_TEMPLATES[0];
  sheet = applyDevelopmentOpportunityTemplate(sheet, tpl);
  sheet = normalizeDevelopmentOpportunitySheet("u1", "c1", {
    ...sheet,
    practiceStartDate: "2026-09-01",
    status: "agreed",
    requiredChecks: {
      canGrantAuthority: true,
      canVerifyWithin6Months: true,
      canAvoidMajorLoss: true,
    },
  });
  ok("opportunity template applied", sheet.workText === tpl.workText && sheet.status === "agreed");
  ok("opportunity condition ready", isDevelopmentOpportunityConditionReady(sheet));
}

function checkBusinessProblemNormalize() {
  ok("business problem has 8 steps", BUSINESS_PROBLEM_STEPS.length === 8);
  ok(
    "partnerQuestions present",
    BUSINESS_PROBLEM_STEPS.every((s) => Array.isArray(s.partnerQuestions) && s.partnerQuestions.length > 0),
  );
  const sheet = normalizeBusinessProblemSheet("u1", "c1", {
    stepValues: { "1": { theme: " 要件整理リード ", gap: "Gap" } },
    coachComment: "should-be-ignored",
  });
  ok("business theme", businessProblemTheme(sheet) === "要件整理リード");
  ok("no coachComment field", !("coachComment" in sheet));
  const counts = businessProblemStepFillCounts(sheet);
  ok("fill count step1", counts[0]?.filled === 2 && counts[0]?.total === 7);
}

async function checkStagingRoutes() {
  const paths = [
    "/api/matches/test-match-id/development-opportunity",
    "/api/matches/test-match-id/business-problem",
    "/api/matches/test-match-id/skill-check",
  ];
  for (const path of paths) {
    const res = await fetch(`${STAGING}${path}`, { cache: "no-store" });
    ok(`staging ${path}`, res.status === 401 || res.status === 403 || res.status === 404, `HTTP ${res.status}`);
  }
}

async function checkPrismaRoundTrip() {
  if (isFirebaseDataBackend()) {
    console.log("SKIP: prisma round-trip (DATA_BACKEND=firebase)");
    return;
  }
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) {
      console.log("SKIP: prisma round-trip (no users in local db)");
      return;
    }
    const userId = user.id;
    const companyId = (user.companyId ?? "verify-today-co").trim() || "verify-today-co";

    await upsertDevelopmentOpportunitySheet(userId, companyId, {
      status: "draft",
      workText: "検証仕事",
      practiceStartDate: "2026-10-01",
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
    ok("opportunity round-trip", opp.workText === "検証仕事" && opp.status === "draft");

    await upsertBusinessProblemSheet(userId, companyId, {
      stepValues: { "1": { theme: "検証テーマ", policy: "方針" } },
    });
    const bp = await getBusinessProblemSheet(userId, companyId);
    ok("business-problem round-trip", bp.stepValues["1"]?.theme === "検証テーマ");

    await upsertSkillCheckProfile({
      userId,
      companyId,
      phase: "baseline",
      assessments: {},
      focusSkillIds: ["engagement"],
      clientValuesText: "価値観テスト",
      clientSixMonthGoalText: "6か月ゴール",
      managerCurrentRoleText: "現役割テスト",
      managerNextRoleText: "次役割テスト",
    });
    const sc = await getSkillCheckProfile(userId);
    ok(
      "skill-check agreement round-trip",
      sc?.clientValuesText === "価値観テスト" && sc?.managerNextRoleText === "次役割テスト",
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  console.log("\n=== Plan features ===");
  checkPlanFeatures();

  console.log("\n=== Normalizers ===");
  checkAgreementNormalize();
  checkOpportunityNormalize();
  checkBusinessProblemNormalize();

  console.log("\n=== Staging API existence ===");
  await checkStagingRoutes();

  console.log("\n=== Prisma repository round-trip ===");
  await checkPrismaRoundTrip();

  console.log("\nPASS: today companion additions\n");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
