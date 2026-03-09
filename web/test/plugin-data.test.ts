import assert from "node:assert/strict";
import crypto, { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { CommandStage, PrismaClient, RibbonItemKind } from "@prisma/client";

import {
  buildRibbonItemHierarchy,
  getCommandDailyUsageSeries,
  getCommandUsageAggregates,
  getRibbonLayoutViewModel,
} from "../src/lib/plugin-data/analyticsService";
import { handlePluginCatalogSyncRequest } from "../src/lib/plugin-data/catalogEndpoint";
import { syncPluginCatalog, type PluginCatalogSyncInput } from "../src/lib/plugin-data/catalogService";
import { handlePluginUsageBatchRequest } from "../src/lib/plugin-data/usageBatchEndpoint";
import { ingestUsageBatch } from "../src/lib/plugin-data/usageBatchService";
import { replaceRibbonLayout } from "../src/lib/ribbon-layout/service";

type CatalogSyncTestInput = PluginCatalogSyncInput & {
  ribbonTabs: Array<{
    tabKey: string;
    title: string;
    order: number;
  }>;
  ribbonPanels: Array<{
    panelKey: string;
    tabKey: string;
    title: string;
    order: number;
  }>;
  ribbonItems: Array<{
    itemKey: string;
    panelKey: string;
    order: number;
    kind: string;
    size?: string | null;
    commandKey?: string | null;
    iconCommandKey?: string | null;
    parentItemKey?: string | null;
    title?: string | null;
  }>;
};

test("catalog sync is idempotent through the plugin endpoint without mutating server-authored layout", async () => {
  await withTestPrisma(async (prisma) => {
    const pluginSlug = `catalog-${randomUUID()}`;
    const manifest = createCatalogSyncInput(pluginSlug);
    await prisma.ribbonTab.create({
      data: {
        pluginSlug,
        tabKey: "SERVER.TAB.MAIN",
        title: "Server Tab",
        order: 1,
      },
    });
    await prisma.ribbonPanel.create({
      data: {
        pluginSlug,
        panelKey: "SERVER.PANEL.MAIN",
        tabKey: "SERVER.TAB.MAIN",
        title: "Server Panel",
        order: 1,
      },
    });
    await prisma.ribbonItem.create({
      data: {
        pluginSlug,
        itemKey: "SERVER.ITEM.ONLY",
        panelKey: "SERVER.PANEL.MAIN",
        order: 1,
        kind: RibbonItemKind.push_button,
        commandKey: "DF.SERVER_ONLY",
      },
    });
    const rawBody = JSON.stringify(manifest);

    const firstResult = await withPluginSecret("slice-5-plugin-secret", () =>
      handlePluginCatalogSyncRequest(prisma, {
        rawBody,
        signature: createPluginSignature(rawBody, "slice-5-plugin-secret"),
      })
    );
    const secondResult = await withPluginSecret("slice-5-plugin-secret", () =>
      handlePluginCatalogSyncRequest(prisma, {
        rawBody,
        signature: createPluginSignature(rawBody, "slice-5-plugin-secret"),
      })
    );

    assert.equal(firstResult.status, 200);
    assert.equal(secondResult.status, 200);

    assert.equal(await prisma.command.count({ where: { pluginSlug } }), manifest.commands.length);
    assert.equal(await prisma.iconAsset.count({ where: { pluginSlug } }), manifest.iconAssets.length);
    assert.equal(await prisma.ribbonTab.count({ where: { pluginSlug } }), 1);
    assert.equal(await prisma.ribbonPanel.count({ where: { pluginSlug } }), 1);
    assert.equal(await prisma.ribbonItem.count({ where: { pluginSlug } }), 1);

    const serverItem = await prisma.ribbonItem.findUniqueOrThrow({
      where: {
        pluginSlug_itemKey: {
          pluginSlug,
          itemKey: "SERVER.ITEM.ONLY",
        },
      },
    });
    assert.equal(serverItem.commandKey, "DF.SERVER_ONLY");
  });
});

test("icon asset upsert updates the existing asset without duplicating rows", async () => {
  await withTestPrisma(async (prisma) => {
    const pluginSlug = `icons-${randomUUID()}`;
    const manifest = createCatalogSyncInput(pluginSlug);

    await syncPluginCatalog(prisma, manifest);
    await syncPluginCatalog(prisma, {
      pluginSlug,
      commands: [],
      iconAssets: [
        {
          iconKey: "DF.GENERATE_BEAM",
          contentType: "image/svg+xml",
          dataUri: "data:image/svg+xml;base64,UPDATED-ICON",
        },
      ],
    });

    assert.equal(await prisma.iconAsset.count({ where: { pluginSlug, iconKey: "DF.GENERATE_BEAM" } }), 1);

    const iconAsset = await prisma.iconAsset.findUniqueOrThrow({
      where: {
        pluginSlug_iconKey: {
          pluginSlug,
          iconKey: "DF.GENERATE_BEAM",
        },
      },
    });

    assert.equal(iconAsset.dataUri, "data:image/svg+xml;base64,UPDATED-ICON");
  });
});

test("plugin catalog sync keeps server-authored command metadata once the admin locks it", async () => {
  await withTestPrisma(async (prisma) => {
    const pluginSlug = `metadata-${randomUUID()}`;

    await syncPluginCatalog(prisma, {
      pluginSlug,
      commands: [
        {
          commandKey: "DF.GENERATE_BEAM",
          displayName: "Generate Beam",
          manifestTitle: "Generate Beam",
          description: "Plugin default tooltip",
          stage: CommandStage.RELEASED,
        },
      ],
      iconAssets: [],
    });

    await prisma.command.update({
      where: {
        pluginSlug_commandKey: {
          pluginSlug,
          commandKey: "DF.GENERATE_BEAM",
        },
      },
      data: {
        displayName: "Beam Generator",
        displayNameLocked: true,
        manifestTitle: "Beam Gen",
        manifestTitleLocked: true,
        description: "Server-authored tooltip",
        descriptionLocked: true,
        descriptiveName: "Beam Generator",
      },
    });

    await syncPluginCatalog(prisma, {
      pluginSlug,
      commands: [
        {
          commandKey: "DF.GENERATE_BEAM",
          displayName: "Plugin Generate Beam",
          manifestTitle: "Plugin Beam",
          description: "Plugin updated tooltip",
          stage: CommandStage.RELEASED,
        },
      ],
      iconAssets: [],
    });

    const command = await prisma.command.findUniqueOrThrow({
      where: {
        pluginSlug_commandKey: {
          pluginSlug,
          commandKey: "DF.GENERATE_BEAM",
        },
      },
    });

    assert.equal(command.displayName, "Beam Generator");
    assert.equal(command.manifestTitle, "Beam Gen");
    assert.equal(command.description, "Server-authored tooltip");
    assert.equal(command.descriptiveName, "Beam Generator");
  });
});

test("usage batch endpoint dedupes by eventId and stays retry-safe", async () => {
  await withTestPrisma(async (prisma) => {
    const pluginSlug = `usage-${randomUUID()}`;
    const requestBody = JSON.stringify({
      pluginSlug,
      events: [
        createUsageEvent("event-1", "DF.GENERATE_BEAM", "ppetkov", "2026-03-08T10:00:00Z"),
        createUsageEvent("event-2", "DF.GENERATE_BEAM", "ppetkov", "2026-03-08T10:05:00Z"),
        createUsageEvent("event-1", "DF.GENERATE_BEAM", "ppetkov", "2026-03-08T10:00:00Z"),
      ],
    });

    const firstResult = await withPluginSecret("slice-5-plugin-secret", () =>
      handlePluginUsageBatchRequest(prisma, {
        rawBody: requestBody,
        signature: createPluginSignature(requestBody, "slice-5-plugin-secret"),
      })
    );

    assert.equal(firstResult.status, 200);
    if (!("acceptedEventIds" in firstResult.body)) {
      assert.fail("Expected a usage batch success response");
    }

    assert.deepEqual(firstResult.body.acceptedEventIds, ["event-1", "event-2"]);
    assert.deepEqual(firstResult.body.duplicateEventIds, ["event-1"]);
    assert.equal(await prisma.rawUsageEvent.count({ where: { pluginSlug } }), 2);

    const secondResult = await withPluginSecret("slice-5-plugin-secret", () =>
      handlePluginUsageBatchRequest(prisma, {
        rawBody: requestBody,
        signature: createPluginSignature(requestBody, "slice-5-plugin-secret"),
      })
    );

    assert.equal(secondResult.status, 200);
    if (!("acceptedEventIds" in secondResult.body)) {
      assert.fail("Expected a usage batch success response");
    }

    assert.deepEqual(secondResult.body.acceptedEventIds, []);
    assert.deepEqual(secondResult.body.duplicateEventIds.sort(), ["event-1", "event-2"]);
    assert.equal(await prisma.rawUsageEvent.count({ where: { pluginSlug } }), 2);
  });
});

test("usage aggregation calculates totals, unique users, last used time, and daily series", async () => {
  await withTestPrisma(async (prisma) => {
    const pluginSlug = `analytics-${randomUUID()}`;
    await syncPluginCatalog(prisma, createCatalogSyncInput(pluginSlug));

    await ingestUsageBatch(prisma, {
      pluginSlug,
      events: [
        createUsageEvent("agg-1", "DF.GENERATE_BEAM", "ppetkov", "2026-03-08T10:00:00Z"),
        createUsageEvent("agg-2", "DF.GENERATE_BEAM", "ppetkov", "2026-03-08T11:00:00Z"),
        createUsageEvent("agg-3", "DF.GENERATE_BEAM", "other-user", "2026-03-09T09:00:00Z"),
        createUsageEvent("agg-4", "DF.SMART_ARRAY", "ppetkov", "2026-03-09T12:00:00Z"),
      ],
    });

    const aggregates = await getCommandUsageAggregates(prisma, { pluginSlug });
    const generateBeam = aggregates.find((aggregate) => aggregate.commandKey === "DF.GENERATE_BEAM");
    const smartArray = aggregates.find((aggregate) => aggregate.commandKey === "DF.SMART_ARRAY");

    assert.ok(generateBeam);
    assert.ok(smartArray);
    assert.equal(generateBeam?.totalUses, 3);
    assert.equal(generateBeam?.uniqueUsers, 2);
    assert.equal(generateBeam?.lastUsedAtUtc?.toISOString(), "2026-03-09T09:00:00.000Z");
    assert.equal(smartArray?.totalUses, 1);
    assert.equal(smartArray?.uniqueUsers, 1);

    const dailySeries = await getCommandDailyUsageSeries(prisma, {
      pluginSlug,
      commandKey: "DF.GENERATE_BEAM",
    });

    assert.deepEqual(dailySeries, [
      { dateUtc: "2026-03-08", totalUses: 2 },
      { dateUtc: "2026-03-09", totalUses: 1 },
    ]);
  });
});

test("ribbon hierarchy mapping and ribbon layout view model preserve nested item order", async () => {
  const nestedItems = buildRibbonItemHierarchy([
    {
      itemKey: "child-b",
      panelKey: "panel-1",
      order: 2,
      kind: RibbonItemKind.push_button,
      size: "SMALL",
      commandKey: "DF.CHILD_B",
      iconCommandKey: "DF.CHILD_B",
      parentItemKey: "parent",
      title: "Child B",
    },
    {
      itemKey: "parent",
      panelKey: "panel-1",
      order: 1,
      kind: RibbonItemKind.pulldown,
      size: null,
      commandKey: null,
      iconCommandKey: null,
      parentItemKey: null,
      title: "Parent",
    },
    {
      itemKey: "child-a",
      panelKey: "panel-1",
      order: 1,
      kind: RibbonItemKind.push_button,
      size: "SMALL",
      commandKey: "DF.CHILD_A",
      iconCommandKey: "DF.CHILD_A",
      parentItemKey: "parent",
      title: "Child A",
    },
  ]);

  assert.deepEqual(nestedItems.map((item) => item.itemKey), ["parent"]);
  assert.deepEqual(nestedItems[0]?.children.map((item) => item.itemKey), ["child-a", "child-b"]);

  await withTestPrisma(async (prisma) => {
    const pluginSlug = `ribbon-${randomUUID()}`;
    await syncPluginCatalog(prisma, createCatalogSyncInput(pluginSlug));
    await replaceRibbonLayout(prisma, createServerOwnedRibbonLayout(pluginSlug));
    await ingestUsageBatch(prisma, {
      pluginSlug,
      events: [
        createUsageEvent("ribbon-1", "DF.GENERATE_BEAM", "ppetkov", "2026-03-08T10:00:00Z"),
        createUsageEvent("ribbon-2", "DF.SMART_ARRAY", "ppetkov", "2026-03-08T11:00:00Z"),
      ],
    });

    const ribbonView = await getRibbonLayoutViewModel(prisma, { pluginSlug });

    assert.equal(ribbonView.tabs.length, 1);
    assert.equal(ribbonView.tabs[0]?.panels.length, 1);
    assert.deepEqual(
      ribbonView.tabs[0]?.panels[0]?.items.map((item) => item.itemKey),
      ["DF.ITEM.GENERATE_BEAM", "DF.ITEM.TOOLS_GROUP"]
    );
    assert.deepEqual(
      ribbonView.tabs[0]?.panels[0]?.items[1]?.children.map((item) => item.itemKey),
      ["DF.ITEM.SMART_ARRAY"]
    );
    assert.equal(
      ribbonView.tabs[0]?.panels[0]?.items[0]?.iconDataUri,
      "data:image/svg+xml;base64,ICON-GENERATE-BEAM"
    );
    assert.equal(ribbonView.tabs[0]?.panels[0]?.items[0]?.analytics?.totalUses, 1);
    assert.equal(ribbonView.tabs[0]?.panels[0]?.items[0]?.analytics?.uniqueUsers, 1);
  });
});

async function withTestPrisma(run: (prisma: PrismaClient) => Promise<void>) {
  const webRoot = process.cwd();
  const runtimeDir = path.join(webRoot, ".test-runtime");
  const sourceDbPath = path.join(webRoot, "prisma", "dev.db");
  fs.mkdirSync(runtimeDir, { recursive: true });

  const dbName = `test-${randomUUID()}.db`;
  const dbPath = path.join(runtimeDir, dbName);
  fs.copyFileSync(sourceDbPath, dbPath);
  const sqliteUrl = `file:${dbPath.replace(/\\/g, "/")}`;

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: sqliteUrl,
      },
    },
  });

  try {
    await resetTestDatabase(prisma);
    await run(prisma);
  } finally {
    await prisma.$disconnect();
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(`${dbPath}-journal`, { force: true });
  }
}

async function resetTestDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.rawUsageEvent.deleteMany();
  await prisma.usageLog.deleteMany();
  await prisma.userCommandOverride.deleteMany();
  await prisma.pluginSessionSnapshot.deleteMany();
  await prisma.failedAttempt.deleteMany();
  await prisma.securityEvent.deleteMany();
  await prisma.ribbonItem.deleteMany();
  await prisma.ribbonPanel.deleteMany();
  await prisma.ribbonTab.deleteMany();
  await prisma.pluginConfigurationState.deleteMany();
  await prisma.iconAsset.deleteMany();
  await prisma.command.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.user.deleteMany();
}

function createPluginSignature(rawBody: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

function withPluginSecret<T>(secret: string, run: () => T): T {
  const originalSecret = process.env.PLUGIN_SECRET;
  process.env.PLUGIN_SECRET = secret;

  try {
    return run();
  } finally {
    if (originalSecret === undefined) {
      delete process.env.PLUGIN_SECRET;
    } else {
      process.env.PLUGIN_SECRET = originalSecret;
    }
  }
}

function createCatalogSyncInput(pluginSlug: string): CatalogSyncTestInput {
  return {
    pluginSlug,
    commands: [
      {
        commandKey: "DF.GENERATE_BEAM",
        displayName: "Generate Beam",
        manifestTitle: "Generate Beam",
        iconCommandKey: "DF.GENERATE_BEAM",
        stage: CommandStage.RELEASED,
        category: "Beams",
        description: "Generate a primary beam.",
      },
      {
        commandKey: "DF.SMART_ARRAY",
        displayName: "Smart Array",
        manifestTitle: "Smart Array",
        iconCommandKey: "DF.SMART_ARRAY",
        stage: CommandStage.TESTING,
        category: "Arrays",
        description: "Create a testing smart array.",
      },
    ],
    iconAssets: [
      {
        iconKey: "DF.GENERATE_BEAM",
        contentType: "image/svg+xml",
        dataUri: "data:image/svg+xml;base64,ICON-GENERATE-BEAM",
      },
      {
        iconKey: "DF.SMART_ARRAY",
        contentType: "image/svg+xml",
        dataUri: "data:image/svg+xml;base64,ICON-SMART-ARRAY",
      },
    ],
    ribbonTabs: [
      {
        tabKey: "DF.TAB.MAIN",
        title: "Dokaflex",
        order: 1,
      },
    ],
    ribbonPanels: [
      {
        panelKey: "DF.PANEL.BEAMS",
        tabKey: "DF.TAB.MAIN",
        title: "Beams",
        order: 1,
      },
    ],
    ribbonItems: [
      {
        itemKey: "DF.ITEM.GENERATE_BEAM",
        panelKey: "DF.PANEL.BEAMS",
        order: 1,
        kind: "BUTTON",
        size: "LARGE",
        commandKey: "DF.GENERATE_BEAM",
        iconCommandKey: "DF.GENERATE_BEAM",
        title: "Generate Beam",
      },
      {
        itemKey: "DF.ITEM.TOOLS_GROUP",
        panelKey: "DF.PANEL.BEAMS",
        order: 2,
        kind: "STACKED",
        size: null,
        commandKey: null,
        iconCommandKey: null,
        parentItemKey: null,
        title: "Tools Group",
      },
      {
        itemKey: "DF.ITEM.SMART_ARRAY",
        panelKey: "DF.PANEL.BEAMS",
        order: 1,
        kind: "BUTTON",
        size: "SMALL",
        commandKey: "DF.SMART_ARRAY",
        iconCommandKey: "DF.SMART_ARRAY",
        parentItemKey: "DF.ITEM.TOOLS_GROUP",
        title: "Smart Array",
      },
    ],
  };
}

function createServerOwnedRibbonLayout(pluginSlug: string) {
  return {
    pluginSlug,
    tabs: [
      {
        tabKey: "DF.TAB.MAIN",
        title: "Dokaflex",
        order: 1,
        panels: [
          {
            panelKey: "DF.PANEL.BEAMS",
            title: "Beams",
            order: 1,
            items: [
              {
                itemKey: "DF.ITEM.GENERATE_BEAM",
                order: 1,
                kind: RibbonItemKind.push_button,
                size: "LARGE",
                commandKey: "DF.GENERATE_BEAM",
                iconCommandKey: "DF.GENERATE_BEAM",
                title: "Generate Beam",
              },
              {
                itemKey: "DF.ITEM.TOOLS_GROUP",
                order: 2,
                kind: RibbonItemKind.pulldown,
                title: "Tools Group",
                children: [
                  {
                    itemKey: "DF.ITEM.SMART_ARRAY",
                    order: 1,
                    kind: RibbonItemKind.push_button,
                    size: "SMALL",
                    commandKey: "DF.SMART_ARRAY",
                    iconCommandKey: "DF.SMART_ARRAY",
                    title: "Smart Array",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function createUsageEvent(
  eventId: string,
  commandKey: string,
  username: string,
  occurredAtUtc: string
) {
  return {
    eventId,
    commandKey,
    username,
    machineFingerprint: "fingerprint-123",
    pluginVersion: "24.10.03",
    revitVersion: "2024",
    occurredAtUtc,
  };
}
