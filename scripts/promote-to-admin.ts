/**
 * Grant ADMIN role (and optionally set password) for an existing user.
 *
 * Usage:
 *   npx tsx scripts/promote-to-admin.ts "<email>" [passwordIfReset]
 *
 * If password is omitted, only role is updated.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const email = process.argv[2];
const plainPassword = process.argv[3];

async function main() {
  if (!email) {
    console.error(
      'Usage: npx tsx scripts/promote-to-admin.ts "<email>" [newPassword]',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found for email: ${email}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  await prisma.user.update({
    where: { email },
    data: {
      role: "ADMIN",
      ...(plainPassword ? { passwordHash: await bcrypt.hash(plainPassword, 12) } : {}),
    },
  });

  // eslint-disable-next-line no-console
  console.log("Updated:", email, "→ role ADMIN", plainPassword ? "(password reset)" : "(password unchanged)");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
