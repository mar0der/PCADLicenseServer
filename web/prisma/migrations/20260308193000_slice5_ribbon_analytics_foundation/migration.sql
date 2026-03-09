ALTER TABLE "Command" ADD COLUMN "manifestTitle" TEXT;
ALTER TABLE "Command" ADD COLUMN "iconCommandKey" TEXT;

UPDATE "Command"
SET
  "manifestTitle" = COALESCE("manifestTitle", "displayName"),
  "iconCommandKey" = COALESCE("iconCommandKey", "commandKey");

CREATE TABLE "IconAsset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "pluginSlug" TEXT NOT NULL,
  "iconKey" TEXT NOT NULL,
  "contentType" TEXT,
  "dataUri" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "IconAsset_pluginSlug_iconKey_key" ON "IconAsset"("pluginSlug", "iconKey");
CREATE INDEX "IconAsset_pluginSlug_idx" ON "IconAsset"("pluginSlug");

CREATE TABLE "RibbonTab" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "pluginSlug" TEXT NOT NULL,
  "tabKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "RibbonTab_pluginSlug_tabKey_key" ON "RibbonTab"("pluginSlug", "tabKey");
CREATE INDEX "RibbonTab_pluginSlug_order_idx" ON "RibbonTab"("pluginSlug", "order");

CREATE TABLE "RibbonPanel" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "pluginSlug" TEXT NOT NULL,
  "panelKey" TEXT NOT NULL,
  "tabKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "RibbonPanel_pluginSlug_panelKey_key" ON "RibbonPanel"("pluginSlug", "panelKey");
CREATE INDEX "RibbonPanel_pluginSlug_tabKey_order_idx" ON "RibbonPanel"("pluginSlug", "tabKey", "order");

CREATE TABLE "RibbonItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "pluginSlug" TEXT NOT NULL,
  "itemKey" TEXT NOT NULL,
  "panelKey" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "size" TEXT,
  "commandKey" TEXT,
  "iconCommandKey" TEXT,
  "parentItemKey" TEXT,
  "title" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "RibbonItem_pluginSlug_itemKey_key" ON "RibbonItem"("pluginSlug", "itemKey");
CREATE INDEX "RibbonItem_pluginSlug_panelKey_order_idx" ON "RibbonItem"("pluginSlug", "panelKey", "order");
CREATE INDEX "RibbonItem_pluginSlug_parentItemKey_order_idx" ON "RibbonItem"("pluginSlug", "parentItemKey", "order");

CREATE TABLE "RawUsageEvent" (
  "eventId" TEXT NOT NULL PRIMARY KEY,
  "pluginSlug" TEXT NOT NULL,
  "commandKey" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "machineFingerprint" TEXT NOT NULL,
  "pluginVersion" TEXT NOT NULL,
  "revitVersion" TEXT NOT NULL,
  "occurredAtUtc" DATETIME NOT NULL,
  "occurredOnDateUtc" DATETIME NOT NULL,
  "snapshotId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RawUsageEvent_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PluginSessionSnapshot" ("snapshotId") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "RawUsageEvent_pluginSlug_commandKey_occurredAtUtc_idx" ON "RawUsageEvent"("pluginSlug", "commandKey", "occurredAtUtc");
CREATE INDEX "RawUsageEvent_pluginSlug_commandKey_occurredOnDateUtc_idx" ON "RawUsageEvent"("pluginSlug", "commandKey", "occurredOnDateUtc");
CREATE INDEX "RawUsageEvent_pluginSlug_username_idx" ON "RawUsageEvent"("pluginSlug", "username");
