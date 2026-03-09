import assert from "node:assert/strict";
import crypto, { generateKeyPairSync, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  PrismaClient,
  RibbonItemKind,
  UserCommandOverrideEffect,
  type CommandStage,
} from "@prisma/client";

import { handlePluginCatalogSyncRequest } from "../src/lib/plugin-data/catalogEndpoint";
import { syncPluginCatalog, type PluginCatalogSyncInput } from "../src/lib/plugin-data/catalogService";
import {
  buildSignedPluginConfigSnapshotEnvelope,
  serializeCanonicalPluginConfigSnapshotPayload,
  verifyPluginConfigSnapshotSignature,
} from "../src/lib/plugin-configuration/configSnapshot";
import { seedDokaflexRibbonLayout } from "../src/lib/ribbon-layout/dokaflexLayout";
import {
  getRibbonLayoutDocument,
  replaceRibbonLayout,
  RibbonLayoutError,
  validateRibbonLayoutDocument,
  type RibbonLayoutDocumentInput,
  type RibbonLayoutItemInput,
} from "../src/lib/ribbon-layout/service";

test("plugin catalog sync ignores plugin-owned ribbon layout payloads", async () => {
  await withTestPrisma(async (prisma) => {
    const pluginSlug = `catalog-layout-${randomUUID()}`;
    const initialLayout = createBaselineLayout(pluginSlug);
    await replaceRibbonLayout(prisma, initialLayout);
    const beforeSync = await getRibbonLayoutDocument(prisma, { pluginSlug });

    const rawBody = JSON.stringify(createCatalogSyncPayload(pluginSlug));
    const result = await withPluginSecret("slice-6-plugin-secret", () =>
      handlePluginCatalogSyncRequest(prisma, {
        rawBody,
        signature: createPluginSignature(rawBody, "slice-6-plugin-secret"),
      })
    );

    assert.equal(result.status, 200);
    if (!("ignoredRibbonTabsCount" in result.body)) {
      assert.fail("Expected a catalog sync success response");
    }

    const afterSync = await getRibbonLayoutDocument(prisma, { pluginSlug });
    assert.equal(result.body.ignoredRibbonTabsCount, 1);
    assert.equal(result.body.ignoredRibbonPanelsCount, 1);
    assert.equal(result.body.ignoredRibbonItemsCount, 1);
    assert.equal(result.body.versions.capabilityCatalogVersion, 1);
    assert.equal(result.body.versions.ribbonLayoutVersion, 1);
    assert.equal(result.body.versions.configVersion, 2);
    assert.deepEqual(afterSync.tabs, beforeSync.tabs);
  });
});

test("valid ribbon kind and cardinality combinations persist successfully", async () => {
  await withTestPrisma(async (prisma) => {
    const pluginSlug = `valid-layout-${randomUUID()}`;
    const layout = createAllKindsLayout(pluginSlug);

    validateRibbonLayoutDocument(layout);
    const result = await replaceRibbonLayout(prisma, layout);
    const storedLayout = await getRibbonLayoutDocument(prisma, { pluginSlug });

    assert.equal(result.changed, true);
    assert.equal(result.tabsPersisted, 1);
    assert.equal(result.panelsPersisted, 1);
    assert.equal(result.itemsPersisted, 15);
    assert.deepEqual(
      storedLayout.tabs[0]?.panels[0]?.items.map((item) => item.kind),
      [
        RibbonItemKind.push_button,
        RibbonItemKind.stack_2,
        RibbonItemKind.stack_3,
        RibbonItemKind.pulldown,
        RibbonItemKind.split_button,
        RibbonItemKind.separator,
        RibbonItemKind.slideout,
      ]
    );
  });
});

test("invalid ribbon kind and cardinality inputs are rejected", () => {
  const cases: Array<{
    expectedCode: string;
    input: RibbonLayoutDocumentInput;
  }> = [
    {
      expectedCode: "INVALID_PUSH_BUTTON",
      input: createLayoutWithSingleItem("invalid-push", {
        itemKey: "ITEM.PUSH",
        order: 1,
        kind: RibbonItemKind.push_button,
      }),
    },
    {
      expectedCode: "INVALID_CONTAINER_CARDINALITY",
      input: createLayoutWithSingleItem("invalid-stack-2", {
        itemKey: "ITEM.STACK2",
        order: 1,
        kind: RibbonItemKind.stack_2,
        children: [createPushButtonItem("ITEM.STACK2.CHILD.1", 1, "DF.CHILD.1")],
      }),
    },
    {
      expectedCode: "INVALID_CONTAINER_COMMAND",
      input: createLayoutWithSingleItem("invalid-stack-3-command", {
        itemKey: "ITEM.STACK3",
        order: 1,
        kind: RibbonItemKind.stack_3,
        commandKey: "DF.INVALID",
        children: [
          createPushButtonItem("ITEM.STACK3.CHILD.1", 1, "DF.CHILD.1"),
          createPushButtonItem("ITEM.STACK3.CHILD.2", 2, "DF.CHILD.2"),
          createPushButtonItem("ITEM.STACK3.CHILD.3", 3, "DF.CHILD.3"),
        ],
      }),
    },
    {
      expectedCode: "INVALID_CONTAINER_CARDINALITY",
      input: createLayoutWithSingleItem("invalid-pulldown", {
        itemKey: "ITEM.PULLDOWN",
        order: 1,
        kind: RibbonItemKind.pulldown,
      }),
    },
    {
      expectedCode: "INVALID_SEPARATOR_COMMAND",
      input: createLayoutWithSingleItem("invalid-separator", {
        itemKey: "ITEM.SEPARATOR",
        order: 1,
        kind: RibbonItemKind.separator,
        commandKey: "DF.INVALID",
      }),
    },
    {
      expectedCode: "INVALID_SLIDEOUT_CHILDREN",
      input: createLayoutWithSingleItem("invalid-slideout", {
        itemKey: "ITEM.SLIDEOUT",
        order: 1,
        kind: RibbonItemKind.slideout,
        children: [createPushButtonItem("ITEM.SLIDEOUT.CHILD.1", 1, "DF.CHILD.1")],
      }),
    },
  ];

  for (const testCase of cases) {
    assert.throws(
      () => validateRibbonLayoutDocument(testCase.input),
      (error: unknown) => error instanceof RibbonLayoutError && error.code === testCase.expectedCode
    );
  }
});

test("stored ribbon layout rejects orphan and cross-panel parent references", async () => {
  await withTestPrisma(async (prisma) => {
    const orphanPanelPlugin = `orphan-panel-${randomUUID()}`;
    await prisma.ribbonPanel.create({
      data: {
        pluginSlug: orphanPanelPlugin,
        panelKey: "PANEL.ORPHAN",
        tabKey: "TAB.MISSING",
        title: "Orphan",
        order: 1,
      },
    });

    await assert.rejects(
      () => getRibbonLayoutDocument(prisma, { pluginSlug: orphanPanelPlugin }),
      (error: unknown) => error instanceof RibbonLayoutError && error.code === "ORPHAN_PANEL"
    );

    const crossPanelPlugin = `cross-panel-${randomUUID()}`;
    await prisma.ribbonTab.create({
      data: {
        pluginSlug: crossPanelPlugin,
        tabKey: "TAB.MAIN",
        title: "Main",
        order: 1,
      },
    });
    await prisma.ribbonPanel.createMany({
      data: [
        {
          pluginSlug: crossPanelPlugin,
          panelKey: "PANEL.ONE",
          tabKey: "TAB.MAIN",
          title: "One",
          order: 1,
        },
        {
          pluginSlug: crossPanelPlugin,
          panelKey: "PANEL.TWO",
          tabKey: "TAB.MAIN",
          title: "Two",
          order: 2,
        },
      ],
    });
    await prisma.ribbonItem.createMany({
      data: [
        {
          pluginSlug: crossPanelPlugin,
          itemKey: "ITEM.PARENT",
          panelKey: "PANEL.ONE",
          order: 1,
          kind: RibbonItemKind.stack_2,
        },
        {
          pluginSlug: crossPanelPlugin,
          itemKey: "ITEM.CHILD",
          panelKey: "PANEL.TWO",
          order: 1,
          kind: RibbonItemKind.push_button,
          commandKey: "DF.CHILD",
          parentItemKey: "ITEM.PARENT",
        },
      ],
    });

    await assert.rejects(
      () => getRibbonLayoutDocument(prisma, { pluginSlug: crossPanelPlugin }),
      (error: unknown) => error instanceof RibbonLayoutError && error.code === "CROSS_PANEL_PARENT"
    );
  });
});

test("layout ordering is normalized deterministically for tabs, panels, and items", async () => {
  await withTestPrisma(async (prisma) => {
    const pluginSlug = `layout-order-${randomUUID()}`;

    await replaceRibbonLayout(prisma, {
      pluginSlug,
      tabs: [
        {
          tabKey: "TAB.B",
          title: "Tab B",
          order: 2,
          panels: [
            {
              panelKey: "PANEL.B",
              title: "Panel B",
              order: 2,
              items: [
                createPushButtonItem("ITEM.B", 2, "DF.B"),
                createPushButtonItem("ITEM.A", 1, "DF.A"),
              ],
            },
            {
              panelKey: "PANEL.A",
              title: "Panel A",
              order: 1,
              items: [
                {
                  itemKey: "ITEM.STACK",
                  order: 1,
                  kind: RibbonItemKind.stack_2,
                  children: [
                    createPushButtonItem("ITEM.STACK.B", 2, "DF.STACK.B"),
                    createPushButtonItem("ITEM.STACK.A", 1, "DF.STACK.A"),
                  ],
                },
              ],
            },
          ],
        },
        {
          tabKey: "TAB.A",
          title: "Tab A",
          order: 1,
          panels: [],
        },
      ],
    });

    const storedLayout = await getRibbonLayoutDocument(prisma, { pluginSlug });
    assert.deepEqual(storedLayout.tabs.map((tab) => tab.tabKey), ["TAB.A", "TAB.B"]);
    assert.deepEqual(storedLayout.tabs[1]?.panels.map((panel) => panel.panelKey), ["PANEL.A", "PANEL.B"]);
    assert.deepEqual(storedLayout.tabs[1]?.panels[1]?.items.map((item) => item.itemKey), ["ITEM.A", "ITEM.B"]);
    const stackChildren = storedLayout.tabs[1]?.panels[0]?.items[0]?.children ?? [];
    assert.deepEqual(
      stackChildren.map((item) => item.itemKey),
      ["ITEM.STACK.A", "ITEM.STACK.B"]
    );
  });
});

test("config snapshot foundation signs server-authored layout, capabilities, icons, and resolved access", async () => {
  await withTestPrisma(async (prisma) => {
    const { privateKey, publicKey } = generateTestKeyPair();
    const pluginSlug = `config-snapshot-${randomUUID()}`;
    const username = `snapshot-user-${randomUUID()}`;

    await syncPluginCatalog(prisma, createCatalogSyncInput(pluginSlug));
    await replaceRibbonLayout(prisma, createBaselineLayout(pluginSlug));

    const user = await prisma.user.create({
      data: {
        username,
        isActive: true,
        baseRole: "USER",
        accessLevel: 1,
      },
    });
    const smartArrayCommand = await prisma.command.findUniqueOrThrow({
      where: {
        pluginSlug_commandKey: {
          pluginSlug,
          commandKey: "DF.SMART_ARRAY",
        },
      },
    });
    await prisma.userCommandOverride.create({
      data: {
        userId: user.id,
        commandId: smartArrayCommand.id,
        effect: UserCommandOverrideEffect.GRANT,
      },
    });

    const envelope = await buildSignedPluginConfigSnapshotEnvelope(
      prisma,
      {
        pluginSlug,
        username,
        machineFingerprint: "fingerprint-123",
        machineName: "DEV-PC-01",
        revitVersion: "2024",
        pluginVersion: "24.10.03",
        now: new Date("2026-03-08T10:00:00Z"),
      },
      privateKey
    );

    assert.equal(envelope.format, "pcad-plugin-config/v1");
    assert.equal(envelope.payload.policyVersion, 1);
    assert.equal(envelope.payload.capabilityCatalogVersion, 1);
    assert.equal(envelope.payload.ribbonLayoutVersion, 1);
    assert.equal(envelope.payload.configVersion, 2);
    assert.equal(envelope.payload.refreshAfterUtc, "2026-03-09T10:00:00Z");
    assert.equal(envelope.payload.graceUntilUtc, "2026-03-15T10:00:00Z");
    assert.equal(envelope.payload.access.baseRole, "USER");
    assert.deepEqual(envelope.payload.access.allowedCommandKeys, ["DF.GENERATE_BEAM", "DF.SMART_ARRAY", "DF.USER_SETTINGS"]);
    assert.equal(envelope.payload.commands.length, 4);
    assert.equal(envelope.payload.icons.length, 4);
    assert.equal(envelope.payload.ribbonLayout.tabs[0]?.tabKey, "DF.TAB.MAIN");
    assert.equal(envelope.payload.ribbonLayout.tabs[0]?.panels[0]?.items[0]?.itemKey, "DF.ITEM.GENERATE_BEAM");

    const canonicalPayload = serializeCanonicalPluginConfigSnapshotPayload(envelope.payload);
    assert.equal(canonicalPayload, serializeCanonicalPluginConfigSnapshotPayload(envelope.payload));
    assert.ok(canonicalPayload.includes('"refreshAfterUtc":"2026-03-09T10:00:00Z"'));
    assert.ok(canonicalPayload.includes('"graceUntilUtc":"2026-03-15T10:00:00Z"'));
    assert.ok(canonicalPayload.includes('"capabilityCatalogVersion":1'));
    assert.ok(canonicalPayload.includes('"ribbonLayoutVersion":1'));
    assert.equal(verifyPluginConfigSnapshotSignature(envelope.payload, envelope.signature, publicKey), true);
  });
});

test("Dokaflex server-owned ribbon layout seed is idempotent and non-destructive", async () => {
  await withTestPrisma(async (prisma) => {
    const firstSeed = await seedDokaflexRibbonLayout(prisma);
    const secondSeed = await seedDokaflexRibbonLayout(prisma);
    const storedLayout = await getRibbonLayoutDocument(prisma, { pluginSlug: "dokaflex" });

    assert.equal(firstSeed.created, true);
    assert.equal(firstSeed.existing, false);
    assert.equal(firstSeed.tabsPersisted, 1);
    assert.equal(firstSeed.panelsPersisted, 5);
    assert.equal(firstSeed.itemsPersisted, 15);
    assert.equal(secondSeed.created, false);
    assert.equal(secondSeed.existing, true);
    assert.equal(storedLayout.tabs[0]?.tabKey, "DF.TAB.MAIN");
    assert.deepEqual(
      storedLayout.tabs[0]?.panels.map((panel) => panel.panelKey),
      [
        "DF.PANEL.UTILITIES",
        "DF.PANEL.GENERATE",
        "DF.PANEL.ARRAYS",
        "DF.PANEL.MODIFY",
        "DF.PANEL.SETTINGS",
      ]
    );
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

function createCatalogSyncPayload(pluginSlug: string) {
  return {
    ...createCatalogSyncInput(pluginSlug),
    ribbonTabs: [
      {
        tabKey: "PLUGIN.TAB.IGNORED",
        title: "Ignored Tab",
        order: 99,
      },
    ],
    ribbonPanels: [
      {
        panelKey: "PLUGIN.PANEL.IGNORED",
        tabKey: "PLUGIN.TAB.IGNORED",
        title: "Ignored Panel",
        order: 99,
      },
    ],
    ribbonItems: [
      {
        itemKey: "PLUGIN.ITEM.IGNORED",
        panelKey: "PLUGIN.PANEL.IGNORED",
        order: 99,
        kind: "push_button",
        commandKey: "DF.COMMANDS_WINDOW",
      },
    ],
  };
}

function createCatalogSyncInput(pluginSlug: string): PluginCatalogSyncInput {
  return {
    pluginSlug,
    commands: [
      createCommandInput("DF.GENERATE_BEAM", "Generate Beam", "Generate Beam", "DF.GENERATE_BEAM", "RELEASED"),
      createCommandInput("DF.SMART_ARRAY", "Smart Array", "Smart Array", "DF.SMART_ARRAY", "TESTING"),
      createCommandInput("DF.USER_SETTINGS", "User Settings", "User Settings", "DF.USER_SETTINGS", "RELEASED"),
      createCommandInput("DF.COMMANDS_WINDOW", "Commands Window", "Commands Window", "DF.COMMANDS_WINDOW", "DEVELOPMENT"),
    ],
    iconAssets: [
      createIconAssetInput("DF.GENERATE_BEAM", "ICON-GENERATE-BEAM"),
      createIconAssetInput("DF.SMART_ARRAY", "ICON-SMART-ARRAY"),
      createIconAssetInput("DF.USER_SETTINGS", "ICON-USER-SETTINGS"),
      createIconAssetInput("DF.COMMANDS_WINDOW", "ICON-COMMANDS-WINDOW"),
    ],
  };
}

function createBaselineLayout(pluginSlug: string): RibbonLayoutDocumentInput {
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
              createPushButtonItem("DF.ITEM.GENERATE_BEAM", 1, "DF.GENERATE_BEAM"),
            ],
          },
        ],
      },
    ],
  };
}

function createAllKindsLayout(pluginSlug: string): RibbonLayoutDocumentInput {
  return {
    pluginSlug,
    tabs: [
      {
        tabKey: "TAB.ALL_KINDS",
        title: "All Kinds",
        order: 1,
        panels: [
          {
            panelKey: "PANEL.ALL_KINDS",
            title: "All Kinds",
            order: 1,
            items: [
              createPushButtonItem("ITEM.PUSH", 1, "DF.PUSH"),
              {
                itemKey: "ITEM.STACK2",
                order: 2,
                kind: RibbonItemKind.stack_2,
                children: [
                  createPushButtonItem("ITEM.STACK2.CHILD.1", 1, "DF.STACK2.1"),
                  createPushButtonItem("ITEM.STACK2.CHILD.2", 2, "DF.STACK2.2"),
                ],
              },
              {
                itemKey: "ITEM.STACK3",
                order: 3,
                kind: RibbonItemKind.stack_3,
                children: [
                  createPushButtonItem("ITEM.STACK3.CHILD.1", 1, "DF.STACK3.1"),
                  createPushButtonItem("ITEM.STACK3.CHILD.2", 2, "DF.STACK3.2"),
                  createPushButtonItem("ITEM.STACK3.CHILD.3", 3, "DF.STACK3.3"),
                ],
              },
              {
                itemKey: "ITEM.PULLDOWN",
                order: 4,
                kind: RibbonItemKind.pulldown,
                title: "Pulldown",
                children: [
                  createPushButtonItem("ITEM.PULLDOWN.CHILD.1", 1, "DF.PULLDOWN.1"),
                  createPushButtonItem("ITEM.PULLDOWN.CHILD.2", 2, "DF.PULLDOWN.2"),
                ],
              },
              {
                itemKey: "ITEM.SPLIT_BUTTON",
                order: 5,
                kind: RibbonItemKind.split_button,
                title: "Split Button",
                children: [createPushButtonItem("ITEM.SPLIT.CHILD.1", 1, "DF.SPLIT.1")],
              },
              {
                itemKey: "ITEM.SEPARATOR",
                order: 6,
                kind: RibbonItemKind.separator,
              },
              {
                itemKey: "ITEM.SLIDEOUT",
                order: 7,
                kind: RibbonItemKind.slideout,
              },
            ],
          },
        ],
      },
    ],
  };
}

function createLayoutWithSingleItem(pluginSlug: string, item: RibbonLayoutItemInput): RibbonLayoutDocumentInput {
  return {
    pluginSlug,
    tabs: [
      {
        tabKey: "TAB.MAIN",
        title: "Main",
        order: 1,
        panels: [
          {
            panelKey: "PANEL.MAIN",
            title: "Main",
            order: 1,
            items: [item],
          },
        ],
      },
    ],
  };
}

function createPushButtonItem(itemKey: string, order: number, commandKey: string): RibbonLayoutItemInput {
  return {
    itemKey,
    order,
    kind: RibbonItemKind.push_button,
    size: "SMALL",
    commandKey,
    iconCommandKey: commandKey,
    title: itemKey,
  };
}

function createCommandInput(
  commandKey: string,
  displayName: string,
  manifestTitle: string,
  iconCommandKey: string,
  stage: CommandStage
) {
  return {
    commandKey,
    displayName,
    manifestTitle,
    iconCommandKey,
    stage,
    category: "Dokaflex",
    description: `${displayName} description`,
  };
}

function createIconAssetInput(iconKey: string, encodedName: string) {
  return {
    iconKey,
    contentType: "image/svg+xml",
    dataUri: `data:image/svg+xml;base64,${encodedName}`,
  };
}

function generateTestKeyPair(): { privateKey: string; publicKey: string } {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });
}
