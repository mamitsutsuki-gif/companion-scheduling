/**
 * ClientPartnerBriefing リポジトリ + Prisma のスモーク検証（実DBを使用）。
 * 実行: npx tsx scripts/verify-client-partner-briefing.ts
 *
 * seed 済み demo（partner@example.com / client@example.com）前提。
 * テスト用にクライアントへ companyId を付与し、AppSettings に企業 1 件を登録します。
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  getAppSettingsRow,
  upsertAppSettingsRow,
} from "../src/lib/repositories/app-settings-repository";
import {
  getPartnerVisibleClientBriefingForMatch,
  listClientsWithBriefingForCompany,
  upsertBriefingForCompanyClient,
} from "../src/lib/repositories/client-partner-briefing-repository";
import { isFirebaseDataBackend } from "../src/lib/firebase-admin";

const DEMO_COMPANY_ID = "demo-company-verify";

function ok(name: string, cond: boolean, detail?: string) {
  if (!cond) {
    console.error("FAIL:", name, detail ?? "");
    process.exit(1);
  }
  console.log("OK:", name);
}

async function main() {
  if (isFirebaseDataBackend()) {
    console.error("SKIP: DATA_BACKEND is firebase — Prisma briefing not applicable.");
    process.exit(0);
  }

  const prisma = new PrismaClient();

  const partnerUser = await prisma.user.findUnique({ where: { email: "partner@example.com" } });
  const clientUser = await prisma.user.findUnique({ where: { email: "client@example.com" } });
  ok("seed partner exists", Boolean(partnerUser));
  ok("seed client exists", Boolean(clientUser));

  const match = await prisma.match.findFirst({
    where: { partnerId: partnerUser!.id, clientId: clientUser!.id },
  });
  ok("demo match exists", Boolean(match));

  const settings = await getAppSettingsRow();
  const baselineCompanies = [...settings.companies];

  const nextCompanies = [...settings.companies.filter((c) => c.id !== DEMO_COMPANY_ID)];
  nextCompanies.push({ id: DEMO_COMPANY_ID, name: "検証デモ企業" });
  await upsertAppSettingsRow({
    slotDurationMinutes: settings.slotDurationMinutes,
    totalSessions: settings.totalSessions,
    timezone: settings.timezone,
    companies: nextCompanies,
  });

  await prisma.user.update({
    where: { id: clientUser!.id },
    data: { companyId: DEMO_COMPANY_ID },
  });

  const listed = await listClientsWithBriefingForCompany(DEMO_COMPANY_ID);
  ok(
    "list contains demo client",
    listed.some((r) => r.userId === clientUser!.id),
    JSON.stringify(listed),
  );

  const rClear = await upsertBriefingForCompanyClient({
    companyId: DEMO_COMPANY_ID,
    clientUserId: clientUser!.id,
    age: null,
    jobTitle: null,
  });
  ok("clear briefing", rClear.ok === true);

  const rUpsert = await upsertBriefingForCompanyClient({
    companyId: DEMO_COMPANY_ID,
    clientUserId: clientUser!.id,
    age: 41,
    jobTitle: "部長（検証）",
  });
  ok("upsert briefing", rUpsert.ok === true);

  const bad = await upsertBriefingForCompanyClient({
    companyId: DEMO_COMPANY_ID,
    clientUserId: partnerUser!.id,
    age: 30,
    jobTitle: "x",
  });
  ok("reject wrong user for company", bad.ok === false && bad.error === "INVALID_USER");

  const pv = await getPartnerVisibleClientBriefingForMatch({
    matchId: match!.id,
    partnerUserId: partnerUser!.id,
  });
  ok(
    "partner sees briefing",
    Boolean(
      pv.ok &&
        pv.clientDisplayName === clientUser!.displayName &&
        pv.age === 41 &&
        pv.jobTitle === "部長（検証）" &&
        (pv.companyName.includes("検証デモ") || pv.companyName.includes(DEMO_COMPANY_ID)),
    ),
  );

  const deny = await getPartnerVisibleClientBriefingForMatch({
    matchId: match!.id,
    partnerUserId: clientUser!.id,
  });
  ok("non-partner forbidden", deny.ok === false && deny.error === "FORBIDDEN");

  await prisma.clientPartnerBriefing.deleteMany({ where: { userId: clientUser!.id } });
  await prisma.user.update({ where: { id: clientUser!.id }, data: { companyId: null } });

  const finalSettings = await getAppSettingsRow();
  await upsertAppSettingsRow({
    slotDurationMinutes: finalSettings.slotDurationMinutes,
    totalSessions: finalSettings.totalSessions,
    timezone: finalSettings.timezone,
    companies: baselineCompanies,
  });

  console.log("All client-partner briefing checks passed.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
