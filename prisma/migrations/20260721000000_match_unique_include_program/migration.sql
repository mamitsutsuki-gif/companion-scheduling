-- RedefineUniqueIndex
DROP INDEX IF EXISTS "Match_partnerId_clientId_key";
CREATE UNIQUE INDEX "Match_partnerId_clientId_programId_key" ON "Match"("partnerId", "clientId", "programId");
