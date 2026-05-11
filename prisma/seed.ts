import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  await prisma.appSettings.upsert({
    where: { id: "app" },
    create: { id: "app", slotDurationMinutes: 30, timezone: "Asia/Tokyo" },
    update: {},
  });

  const password = await bcrypt.hash("demo12345", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      passwordHash: password,
      displayName: "管理者（デモ）",
      role: "ADMIN",
    },
  });

  const partner = await prisma.user.upsert({
    where: { email: "partner@example.com" },
    update: {},
    create: {
      email: "partner@example.com",
      passwordHash: password,
      displayName: "パートナー（デモ）",
      role: "PARTNER",
    },
  });

  const client = await prisma.user.upsert({
    where: { email: "client@example.com" },
    update: {},
    create: {
      email: "client@example.com",
      passwordHash: password,
      displayName: "クライアント（デモ）",
      role: "CLIENT",
    },
  });

  await prisma.partnerZoomProfile.upsert({
    where: { partnerId: partner.id },
    update: {
      zoomUrl: "https://zoom.us/j/0000000000",
      zoomMeetingId: "000 0000 0000",
      zoomPass: "demo",
    },
    create: {
      partnerId: partner.id,
      zoomUrl: "https://zoom.us/j/0000000000",
      zoomMeetingId: "000 0000 0000",
      zoomPass: "demo",
    },
  });

  await prisma.match.upsert({
    where: {
      partnerId_clientId: { partnerId: partner.id, clientId: client.id },
    },
    update: {},
    create: {
      partnerId: partner.id,
      clientId: client.id,
    },
  });

  // eslint-disable-next-line no-console
  console.log("Seed OK. accounts (password demo12345):");
  console.log("  ADMIN ", admin.email);
  console.log("  PARTNER", partner.email);
  console.log("  CLIENT ", client.email);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
