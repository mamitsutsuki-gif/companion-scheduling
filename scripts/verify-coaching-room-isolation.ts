/**
 * コーチングマネジメント研修ルームの隔離ロジック検証（純関数・DB 不要）。
 * 実行: npx tsx scripts/verify-coaching-room-isolation.ts
 */
import { selectCoachingProgramsForClient } from "../src/lib/match-partner-pending";
import type { CompanyPlan } from "../src/lib/company-plan";

function ok(name: string, cond: boolean, detail?: string) {
  if (!cond) {
    console.error("FAIL:", name, detail ?? "");
    process.exit(1);
  }
  console.log("OK:", name);
}

const exec = { id: "p-exec", plan: "individual_companion_exec" as CompanyPlan };
const pro = { id: "p-pro", plan: "individual_companion_pro" as CompanyPlan };
const coaching = { id: "p-coaching", plan: "coaching_management_training" as CompanyPlan };

const multiPlanPrograms = [exec, pro, coaching];

ok(
  "研修が未チェックのメンバーにはルームを作らない",
  selectCoachingProgramsForClient({
    programs: multiPlanPrograms,
    enrolledProgramIds: [exec.id],
    registryPlan: "individual_companion_exec",
  }).length === 0,
);

ok(
  "研修をチェックしたメンバーにはルームを作る",
  selectCoachingProgramsForClient({
    programs: multiPlanPrograms,
    enrolledProgramIds: [exec.id, coaching.id],
    registryPlan: "individual_companion_exec",
  }).map((p) => p.id).join(",") === coaching.id,
);

ok(
  "複数プラン企業で参加未設定ならルームを作らない（レジストリが研修でも）",
  selectCoachingProgramsForClient({
    programs: multiPlanPrograms,
    enrolledProgramIds: [],
    registryPlan: "coaching_management_training",
  }).length === 0,
);

ok(
  "研修だけの企業で参加未設定ならレジストリ判定で作る",
  selectCoachingProgramsForClient({
    programs: [coaching],
    enrolledProgramIds: [],
    registryPlan: "coaching_management_training",
  }).map((p) => p.id).join(",") === coaching.id,
);

ok(
  "研修プログラムが無い企業では何も作らない",
  selectCoachingProgramsForClient({
    programs: [exec, pro],
    enrolledProgramIds: [],
    registryPlan: "coaching_management_training",
  }).length === 0,
);

console.log("\nAll coaching room isolation checks passed.");
