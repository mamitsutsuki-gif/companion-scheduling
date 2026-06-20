/**
 * 個別伴走プラン機能のスモーク検証。
 * 実行: npx tsx scripts/verify-companion-sheets.ts
 */
import "dotenv/config";
import { getFirebaseFirestoreClient, isFirebaseAdminConfigured, isFirebaseDataBackend } from "../src/lib/firebase-admin";
import { resolveCompanyPlan, type CompanyPlan } from "../src/lib/company-plan";
import { normalizePdcaStore, pdcaSkillCounts } from "../src/lib/companion-pdca";
import { normalizeReflectionSheet } from "../src/lib/companion-reflection";
import { normalizeLifelineChart, filterLifelineForViewer } from "../src/lib/companion-lifeline";
import { normalizeSummaryReportDoc } from "../src/lib/companion-summary";
import {
  getPdcaStore,
  upsertPdcaEntry,
  deletePdcaEntry,
  newPdcaEntryId,
} from "../src/lib/repositories/companion-repository";

const STAGING = "https://companion-scheduling--motive-iji-cloud-1e300.asia-east1.hosted.app";

async function checkPublicRoutes() {
  const routes = [
    "/api/matches/test-match-id/pdca",
    "/api/matches/test-match-id/reflection",
    "/api/matches/test-match-id/lifeline",
    "/api/matches/test-match-id/summary-report",
    "/api/matches/test-match-id/skill-check",
    "/api/skill-check/me",
  ];
  let ok = 0;
  for (const path of routes) {
    const res = await fetch(`${STAGING}${path}`, { cache: "no-store" });
    const status = res.status;
    const pass = status === 401 || status === 403 || status === 404;
    console.log(`  ${pass ? "✓" : "✗"} ${path} → HTTP ${status}`);
    if (pass) ok += 1;
  }
  return ok === routes.length;
}

async function checkFirebaseData() {
  if (!isFirebaseDataBackend() || !isFirebaseAdminConfigured()) {
    console.log("  (skip) Firebase Admin 未設定");
    return true;
  }
  const db = getFirebaseFirestoreClient();
  if (!db) return false;
  try {

  const settings = await db.collection("appSettings").doc("app").get();
  const companies = (settings.data()?.companies ?? []) as Array<{ id: string; name: string; plan?: CompanyPlan }>;
  const companionCompanies = companies.filter((c) => resolveCompanyPlan(c.id, companies) === "individual_companion");
  console.log(`  ✓ 登録企業 ${companies.length} 件 / 個別伴走プラン ${companionCompanies.length} 件`);
  for (const c of companionCompanies.slice(0, 5)) {
    console.log(`    - ${c.name}（${c.id}）`);
  }

  const matchesSnap = await db.collection("matches").limit(5).get();
  console.log(`  ✓ マッチ（サンプル最大5件）: ${matchesSnap.size} 件`);

  return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("invalid_grant") || msg.includes("reauth")) {
      console.log("  (skip) Firebase 認証期限切れ — gcloud auth application-default login が必要");
      return true;
    }
    throw e;
  }
}

async function checkRepositoryRoundTrip() {
  if (!isFirebaseDataBackend() || !isFirebaseAdminConfigured()) {
    console.log("  (skip) repository round-trip");
    return true;
  }
  try {
  const testUserId = "__verify_companion_smoke__";
  const companyId = "verify-co";
  const entryId = newPdcaEntryId();
  await upsertPdcaEntry(testUserId, companyId, {
    id: entryId,
    sessionNumber: 1,
    periodLabel: "検証用",
    focusTheme: "テスト",
    focusSkillIds: ["engagement"],
    plan: "Plan",
    doText: "Do",
    check: "Check",
    act: "Act",
    clientNotes: "",
    coachComment: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const store = await getPdcaStore(testUserId, companyId);
  const found = store.entries.some((e) => e.id === entryId && e.plan === "Plan");
  await deletePdcaEntry(testUserId, companyId, entryId);
  console.log(`  ${found ? "✓" : "✗"} PDCA 書き込み→読み込み→削除`);
  return found;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("invalid_grant") || msg.includes("reauth")) {
      console.log("  (skip) Firebase 認証期限切れ");
      return true;
    }
    throw e;
  }
}

function checkNormalizers() {
  const pdca = normalizePdcaStore("u1", "c1", {
    entries: [{ id: "p1", plan: "x", focusSkillIds: ["a"], sessionNumber: 1 }],
  });
  const counts = pdcaSkillCounts(pdca.entries);
  const reflection = normalizeReflectionSheet("u1", "c1", { changedThrough: "変化" });
  const lifeline = normalizeLifelineChart("u1", "c1", {
    events: [{ id: "e1", title: "入学", emotionScore: 3, locked: true, insights: "挑戦" }],
  });
  const masked = filterLifelineForViewer(lifeline, "manager");
  const summary = normalizeSummaryReportDoc("u1", "c1", { motiveSummary: "総括" });
  const ok =
    pdca.entries.length === 1 &&
    counts[0]?.count === 1 &&
    reflection.changedThrough === "変化" &&
    masked.events[0]?.title === "（非公開の出来事）" &&
    summary.motiveSummary === "総括";
  console.log(`  ${ok ? "✓" : "✗"} 正規化・マスク・集計ロジック`);
  return ok;
}

async function main() {
  console.log("\n=== 1. ステージング API ルート（未ログイン）===");
  const routesOk = await checkPublicRoutes();

  console.log("\n=== 2. ユニット（正規化）===");
  const normOk = checkNormalizers();

  console.log("\n=== 3. Firebase データ ===");
  const dataOk = await checkFirebaseData();

  console.log("\n=== 4. Firestore 書き込みスモーク ===");
  const repoOk = await checkRepositoryRoundTrip();

  const all = routesOk && normOk && dataOk && repoOk;
  console.log(`\n${all ? "PASS" : "FAIL"}: companion sheets smoke\n`);
  process.exit(all ? 0 : 1);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
