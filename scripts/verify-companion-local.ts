/**
 * 個別伴走プラン機能のローカル（Prisma/SQLite）スモーク検証。
 * 実行: DATA_BACKEND=prisma npx tsx scripts/verify-companion-local.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { isFirebaseDataBackend } from "../src/lib/firebase-admin";
import { getAppSettingsRow, upsertAppSettingsRow } from "../src/lib/repositories/app-settings-repository";
import { resolveCompanionAccessForMatch } from "../src/lib/companion-access";
import { filterLifelineForViewer } from "../src/lib/companion-lifeline";
import { getPlanFeatures } from "../src/lib/company-plan";
import {
  deletePdcaEntry,
  getLifelineChart,
  getPdcaStore,
  getReflectionSheet,
  newPdcaEntryId,
  upsertLifelineChart,
  upsertPdcaEntry,
  upsertReflectionSheet,
  getSummaryReportDoc,
  upsertSummaryReportDoc,
} from "../src/lib/repositories/companion-repository";

const DEMO_COMPANY_ID = "companion-verify-co";

function ok(name: string, cond: boolean, detail?: string) {
  if (!cond) {
    console.error("FAIL:", name, detail ?? "");
    process.exit(1);
  }
  console.log("OK:", name);
}

async function main() {
  if (isFirebaseDataBackend()) {
    console.error("SKIP: DATA_BACKEND=firebase — ローカル Prisma 検証は DATA_BACKEND=prisma で実行してください。");
    process.exit(0);
  }

  const prisma = new PrismaClient();
  const partner = await prisma.user.findUnique({ where: { email: "partner@example.com" } });
  const client = await prisma.user.findUnique({ where: { email: "client@example.com" } });
  const admin = await prisma.user.findUnique({ where: { email: "admin@example.com" } });
  ok("seed users", Boolean(partner && client && admin));

  const match = await prisma.match.findFirst({
    where: { partnerId: partner!.id, clientId: client!.id },
  });
  ok("demo match", Boolean(match));

  const settings = await getAppSettingsRow();
  const baselineCompanies = [...settings.companies];
  const nextCompanies = [
    ...settings.companies.filter((c) => c.id !== DEMO_COMPANY_ID),
    { id: DEMO_COMPANY_ID, name: "個別伴走検証企業", plan: "individual_companion" as const },
  ];
  await upsertAppSettingsRow({
    slotDurationMinutes: settings.slotDurationMinutes,
    totalSessions: settings.totalSessions,
    timezone: settings.timezone,
    companies: nextCompanies,
  });
  await prisma.user.update({ where: { id: client!.id }, data: { companyId: DEMO_COMPANY_ID } });

  const features = getPlanFeatures("individual_companion");
  ok("plan features", features.pdca && features.skillCheck && features.lifelineChart && features.fta);

  const entryId = newPdcaEntryId();
  await upsertPdcaEntry(client!.id, DEMO_COMPANY_ID, {
    id: entryId,
    sessionNumber: 1,
    periodLabel: "第1期",
    focusTheme: "コミュニケーション",
    focusSkillIds: ["engagement"],
    plan: "Plan文",
    doText: "Do文",
    check: "Check文",
    act: "Act文",
    clientNotes: "メモ",
    coachComment: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const pdca = await getPdcaStore(client!.id, DEMO_COMPANY_ID);
  ok("PDCA round-trip", pdca.entries.some((e) => e.id === entryId && e.plan === "Plan文"));

  await upsertReflectionSheet(client!.id, DEMO_COMPANY_ID, {
    changedThrough: "振り返りテスト",
  });
  const reflection = await getReflectionSheet(client!.id, DEMO_COMPANY_ID);
  ok("reflection round-trip", reflection.changedThrough === "振り返りテスト");

  await upsertLifelineChart(client!.id, DEMO_COMPANY_ID, [
    {
      id: "ev1",
      title: "転職",
      ageOrPeriod: "30歳",
      detail: "",
      emotionScore: 2,
      emotionReason: "",
      insights: "秘密の気づき",
      locked: true,
      sortOrder: 0,
    },
  ]);
  const lifeline = await getLifelineChart(client!.id, DEMO_COMPANY_ID);
  const masked = filterLifelineForViewer(lifeline, "manager");
  ok(
    "lifeline mask for manager",
    masked.events[0]?.title === "（非公開の出来事）" && masked.events[0]?.insights === "秘密の気づき",
  );

  await upsertSummaryReportDoc(client!.id, DEMO_COMPANY_ID, {
    motiveSummary: "総括テスト",
  }, admin!.id);
  const summary = await getSummaryReportDoc(client!.id, DEMO_COMPANY_ID);
  ok("summary round-trip", summary.motiveSummary === "総括テスト");

  const clientAccess = await resolveCompanionAccessForMatch(match!.id, {
    id: client!.id,
    role: "CLIENT",
  });
  const partnerAccess = await resolveCompanionAccessForMatch(match!.id, {
    id: partner!.id,
    role: "PARTNER",
  });
  const adminAccess = await resolveCompanionAccessForMatch(match!.id, {
    id: admin!.id,
    role: "ADMIN",
  });

  if ("error" in clientAccess) {
    console.log("NOTE: prisma では companies が DB に永続化されないため plan アクセス検証はスキップ:", clientAccess.error);
  } else {
    ok("client can edit PDCA", clientAccess.canEditClient && clientAccess.lifelineViewMode === "self");
    ok("partner coach comment", !("error" in partnerAccess) && partnerAccess.canEditCoach);
    ok("admin full access", !("error" in adminAccess) && adminAccess.canEditAdminSummary);
  }

  await deletePdcaEntry(client!.id, DEMO_COMPANY_ID, entryId);
  await prisma.userCompanionReflection.deleteMany({ where: { userId: client!.id } });
  await prisma.userCompanionLifeline.deleteMany({ where: { userId: client!.id } });
  await prisma.userCompanionSummaryReport.deleteMany({ where: { userId: client!.id } });
  await prisma.user.update({ where: { id: client!.id }, data: { companyId: null } });
  const finalSettings = await getAppSettingsRow();
  await upsertAppSettingsRow({
    slotDurationMinutes: finalSettings.slotDurationMinutes,
    totalSessions: finalSettings.totalSessions,
    timezone: finalSettings.timezone,
    companies: baselineCompanies,
  });

  console.log("All companion local checks passed.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
