PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

ALTER TABLE "User" ADD COLUMN "baseRole" TEXT NOT NULL DEFAULT 'USER';
ALTER TABLE "User" ADD COLUMN "lastLoginAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "lastMachineName" TEXT;
ALTER TABLE "User" ADD COLUMN "lastMachineFingerprint" TEXT;

UPDATE "User"
SET
  "baseRole" = CASE "accessLevel"
    WHEN 3 THEN 'BOSS'
    WHEN 2 THEN 'TESTER'
    ELSE 'USER'
  END,
  "lastLoginAt" = COALESCE("lastLoginAt", "lastLogin"),
  "lastMachineName" = COALESCE("lastMachineName", "machineName");

CREATE TABLE "PluginSessionSnapshot" (
  "snapshotId" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "pluginSlug" TEXT NOT NULL,
  "machineFingerprint" TEXT NOT NULL,
  "machineName" TEXT NOT NULL,
  "revitVersion" TEXT NOT NULL,
  "policyVersion" INTEGER NOT NULL,
  "issuedAtUtc" DATETIME NOT NULL,
  "refreshAfterUtc" DATETIME NOT NULL,
  "graceUntilUtc" DATETIME NOT NULL,
  "revokedAtUtc" DATETIME,
  "allowedCommandKeys" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PluginSessionSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PluginSessionSnapshot_userId_pluginSlug_idx" ON "PluginSessionSnapshot"("userId", "pluginSlug");
CREATE INDEX "PluginSessionSnapshot_machineFingerprint_idx" ON "PluginSessionSnapshot"("machineFingerprint");

CREATE TABLE "UsageLog_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "pluginSlug" TEXT NOT NULL DEFAULT 'dokaflex',
  "functionName" TEXT NOT NULL,
  "commandKey" TEXT,
  "snapshotId" TEXT,
  "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UsageLog_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PluginSessionSnapshot" ("snapshotId") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "UsageLog_new" ("id", "userId", "pluginSlug", "functionName", "commandKey", "snapshotId", "timestamp")
SELECT "id", "userId", 'dokaflex', "functionName", "functionName", NULL, "timestamp"
FROM "UsageLog";

DROP TABLE "UsageLog";
ALTER TABLE "UsageLog_new" RENAME TO "UsageLog";
CREATE INDEX "UsageLog_pluginSlug_commandKey_idx" ON "UsageLog"("pluginSlug", "commandKey");

CREATE TABLE "Command_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "pluginSlug" TEXT NOT NULL DEFAULT 'dokaflex',
  "commandKey" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "stage" TEXT NOT NULL DEFAULT 'RELEASED',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "category" TEXT,
  "description" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uniqueName" TEXT NOT NULL,
  "descriptiveName" TEXT NOT NULL,
  "requiredAccessLevel" INTEGER NOT NULL DEFAULT 1
);

INSERT INTO "Command_new" (
  "id",
  "pluginSlug",
  "commandKey",
  "displayName",
  "stage",
  "isActive",
  "category",
  "description",
  "createdAt",
  "updatedAt",
  "uniqueName",
  "descriptiveName",
  "requiredAccessLevel"
)
SELECT
  "id",
  'dokaflex',
  "uniqueName",
  "descriptiveName",
  CASE "requiredAccessLevel"
    WHEN 3 THEN 'DEVELOPMENT'
    WHEN 2 THEN 'TESTING'
    ELSE 'RELEASED'
  END,
  true,
  NULL,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  "uniqueName",
  "descriptiveName",
  "requiredAccessLevel"
FROM "Command";

DROP TABLE "Command";
ALTER TABLE "Command_new" RENAME TO "Command";
CREATE UNIQUE INDEX "Command_uniqueName_key" ON "Command"("uniqueName");
CREATE UNIQUE INDEX "Command_pluginSlug_commandKey_key" ON "Command"("pluginSlug", "commandKey");

CREATE TABLE "UserCommandOverride" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "commandId" TEXT NOT NULL,
  "effect" TEXT NOT NULL,
  "expiresAt" DATETIME,
  "reason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserCommandOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserCommandOverride_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "Command" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "UserCommandOverride_userId_commandId_idx" ON "UserCommandOverride"("userId", "commandId");

CREATE TABLE "SecurityEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT,
  "pluginSlug" TEXT,
  "username" TEXT,
  "machineName" TEXT,
  "machineFingerprint" TEXT,
  "eventType" TEXT NOT NULL,
  "reason" TEXT,
  "details" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "SecurityEvent_createdAt_idx" ON "SecurityEvent"("createdAt");
CREATE INDEX "SecurityEvent_eventType_idx" ON "SecurityEvent"("eventType");

CREATE TABLE "ApiKey" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL,
  "secretHash" TEXT NOT NULL,
  "scopes" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" DATETIME,
  "lastUsedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ApiKey_keyPrefix_key" ON "ApiKey"("keyPrefix");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
