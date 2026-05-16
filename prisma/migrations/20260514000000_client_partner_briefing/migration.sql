-- CreateTable
CREATE TABLE "ClientPartnerBriefing" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "jobTitle" TEXT,
    "age" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClientPartnerBriefing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
