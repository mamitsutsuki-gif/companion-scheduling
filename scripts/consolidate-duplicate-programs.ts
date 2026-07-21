/**
 * 企業単位で同一プランの重複プログラムを統合する。
 *
 * 使い方:
 *   npx tsx scripts/consolidate-duplicate-programs.ts --dry-run company-mr2y8ov7
 *   npx tsx scripts/consolidate-duplicate-programs.ts --apply company-mr2y8ov7
 *
 * --list のみ: 企業名から候補を表示
 *   npx tsx scripts/consolidate-duplicate-programs.ts --list 三井住友
 */
import "dotenv/config";
import {
  getFirebaseFirestoreClient,
  isFirebaseAdminConfigured,
} from "../src/lib/firebase-admin";
import {
  consolidateDuplicateProgramsForCompany,
  getProgramUsageStats,
  listProgramsForCompany,
} from "../src/lib/repositories/program-repository";
import { companyPlanLabel } from "../src/lib/company-plan";
import { getAppSettingsRow } from "../src/lib/repositories/app-settings-repository";

async function listCompaniesByNameHint(hint: string) {
  const settings = await getAppSettingsRow();
  return settings.companies.filter(
    (c) => c.name.includes(hint) || c.id.includes(hint),
  );
}

async function preview(companyId: string) {
  const programs = await listProgramsForCompany(companyId);
  const byPlan = new Map<string, typeof programs>();
  for (const p of programs) {
    const list = byPlan.get(p.plan) ?? [];
    list.push(p);
    byPlan.set(p.plan, list);
  }

  console.log(`\n=== preview companyId=${companyId} programs=${programs.length} ===`);
  for (const [plan, list] of byPlan) {
    const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    console.log(`\nplan=${plan} (${companyPlanLabel(plan as never)}) count=${list.length}`);
    for (const p of sorted) {
      const usage = await getProgramUsageStats(p.id);
      const tag = p.id === sorted[0]!.id && list.length > 1 ? " [CANONICAL]" : list.length > 1 ? " [DUPLICATE]" : "";
      console.log(
        `  ${p.id}${tag} name="${p.name}" created=${p.createdAt} assigned=${usage.assignedMatchCount} pending=${usage.pendingMatchCount}`,
      );
    }
  }
  const dupes = [...byPlan.values()].filter((l) => l.length > 1);
  return { programs, duplicatePlanCount: dupes.length };
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.find((a) => a === "--dry-run" || a === "--apply" || a === "--list") ?? "--dry-run";
  const target = args.find((a) => !a.startsWith("--")) ?? "";

  if (!isFirebaseAdminConfigured()) {
    console.error("Firebase Admin 未設定です。.env の FIREBASE_* を確認してください。");
    process.exit(1);
  }
  if (!getFirebaseFirestoreClient()) {
    console.error("Firestore クライアントを初期化できません。");
    process.exit(1);
  }

  if (mode === "--list") {
    if (!target) {
      console.error("Usage: --list <企業名の一部>");
      process.exit(1);
    }
    const hits = await listCompaniesByNameHint(target);
    console.log(`companies matching "${target}": ${hits.length}`);
    for (const c of hits) {
      console.log(`  ${c.id}  ${c.name}  plan=${c.plan ?? "(none)"}`);
      await preview(c.id);
    }
    return;
  }

  if (!target) {
    console.error("Usage: --dry-run|--apply <companyId>");
    process.exit(1);
  }

  const settings = await getAppSettingsRow();
  const company = settings.companies.find((c) => c.id === target);
  if (!company) {
    console.error(`企業IDが見つかりません: ${target}`);
    process.exit(1);
  }
  console.log(`Target: ${company.id} / ${company.name}`);

  const { duplicatePlanCount } = await preview(target);
  if (duplicatePlanCount === 0) {
    console.log("\n重複なし。処理不要です。");
    return;
  }

  if (mode === "--dry-run") {
    console.log("\n[dry-run] 書き込みなし。--apply で統合を実行します。");
    return;
  }

  console.log("\n[apply] consolidateDuplicateProgramsForCompany ...");
  const result = await consolidateDuplicateProgramsForCompany(target);
  console.log(JSON.stringify(result, null, 2));
  await preview(target);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
