import assert from "node:assert/strict";
import crypto, { generateKeyPairSync, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { CommandStage, PrismaClient, UserCommandOverrideEffect } from "@prisma/client";

import {
  accessLevelFromCommandStage,
  commandStageFromAccessLevel,
  DISABLED_LEGACY_ACCESS_LEVEL,
} from "../src/lib/access-control/compat";
import { DOKAFLEX_COMMAND_CATALOG, seedDokaflexCommandCatalog } from "../src/lib/access-control/dokaflexCatalog";
import { handleAccessRefreshRequest } from "../src/lib/access-control/refreshEndpoint";
import { issueAccessSnapshot } from "../src/lib/access-control/refreshService";
import {
  createUserCommandOverride,
  deleteUserCommandOverride,
  listUserCommandOverrides,
  previewEffectiveAccess,
} from "../src/lib/access-control/service";
import {
  buildSnapshotPayload,
  createSignedSnapshotEnvelope,
  serializeCanonicalSnapshotPayload,
  verifySnapshotPayloadSignature,
} from "../src/lib/access-control/snapshotContract";
import {
  resolveEffectiveAllowedCommandKeys,
  type PolicyCommand,
  type PolicyOverride,
} from "../src/lib/access-control/resolveEffectiveAllowedCommandKeys";

const commands: PolicyCommand[] = [
  { commandKey: "DF.RELEASED", stage: "RELEASED" },
  { commandKey: "DF.TESTING", stage: "TESTING" },
  { commandKey: "DF.DEVELOPMENT", stage: "DEVELOPMENT" },
  { commandKey: "DF.DISABLED", stage: "DISABLED" },
];
const now = new Date("2026-03-08T12:00:00Z");

test("base role access matrix matches the architecture spec", () => {
  assert.deepEqual(
    resolveEffectiveAllowedCommandKeys({
      user: { isActive: true, baseRole: "USER" },
      commands,
    }),
    ["DF.RELEASED"]
  );

  assert.deepEqual(
    resolveEffectiveAllowedCommandKeys({
      user: { isActive: true, baseRole: "TESTER" },
      commands,
    }),
    ["DF.RELEASED", "DF.TESTING"]
  );

  assert.deepEqual(
    resolveEffectiveAllowedCommandKeys({
      user: { isActive: true, baseRole: "BOSS" },
      commands,
    }),
    ["DF.DEVELOPMENT", "DF.RELEASED", "DF.TESTING"]
  );
});

test("explicit deny removes base-role access and later grant wins for enabled commands", () => {
  const overrides: PolicyOverride[] = [
    { commandKey: "DF.RELEASED", effect: "DENY" },
    { commandKey: "DF.DEVELOPMENT", effect: "DENY" },
    { commandKey: "DF.DEVELOPMENT", effect: "GRANT" },
  ];

  assert.deepEqual(
    resolveEffectiveAllowedCommandKeys({
      user: { isActive: true, baseRole: "TESTER" },
      commands,
      overrides,
    }),
    ["DF.DEVELOPMENT", "DF.TESTING"]
  );
});

test("malformed expiry strings fail closed", () => {
  const overrides: PolicyOverride[] = [
    { commandKey: "DF.DEVELOPMENT", effect: "GRANT", expiresAt: "not-a-date" },
  ];

  assert.deepEqual(
    resolveEffectiveAllowedCommandKeys({
      user: { isActive: true, baseRole: "TESTER" },
      commands,
      overrides,
      now,
    }),
    ["DF.RELEASED", "DF.TESTING"]
  );
});

test("expired overrides are inactive and future expiries stay active", () => {
  assert.deepEqual(
    resolveEffectiveAllowedCommandKeys({
      user: { isActive: true, baseRole: "TESTER" },
      commands,
      overrides: [
        { commandKey: "DF.DEVELOPMENT", effect: "GRANT", expiresAt: "2026-03-08T11:59:59Z" },
      ],
      now,
    }),
    ["DF.RELEASED", "DF.TESTING"]
  );

  assert.deepEqual(
    resolveEffectiveAllowedCommandKeys({
      user: { isActive: true, baseRole: "TESTER" },
      commands,
      overrides: [
        { commandKey: "DF.DEVELOPMENT", effect: "GRANT", expiresAt: "2026-03-08T12:00:01Z" },
      ],
      now,
    }),
    ["DF.DEVELOPMENT", "DF.RELEASED", "DF.TESTING"]
  );
});

test("null and undefined expiries keep overrides active", () => {
  assert.deepEqual(
    resolveEffectiveAllowedCommandKeys({
      user: { isActive: true, baseRole: "TESTER" },
      commands,
      overrides: [
        { commandKey: "DF.DEVELOPMENT", effect: "GRANT", expiresAt: null },
      ],
      now,
    }),
    ["DF.DEVELOPMENT", "DF.RELEASED", "DF.TESTING"]
  );

  assert.deepEqual(
    resolveEffectiveAllowedCommandKeys({
      user: { isActive: true, baseRole: "TESTER" },
      commands,
      overrides: [
        { commandKey: "DF.DEVELOPMENT", effect: "GRANT" },
      ],
      now,
    }),
    ["DF.DEVELOPMENT", "DF.RELEASED", "DF.TESTING"]
  );
});

test("disabled commands stay denied even when explicitly granted", () => {
  const overrides: PolicyOverride[] = [
    { commandKey: "DF.DISABLED", effect: "GRANT" },
  ];

  assert.deepEqual(
    resolveEffectiveAllowedCommandKeys({
      user: { isActive: true, baseRole: "BOSS" },
      commands,
      overrides,
    }),
    ["DF.DEVELOPMENT", "DF.RELEASED", "DF.TESTING"]
  );
});

test("inactive users receive no commands even with grants", () => {
  const overrides: PolicyOverride[] = [
    { commandKey: "DF.DEVELOPMENT", effect: "GRANT" },
  ];

  assert.deepEqual(
    resolveEffectiveAllowedCommandKeys({
      user: { isActive: false, baseRole: "BOSS" },
      commands,
      overrides,
    }),
    []
  );
});

test("legacy disabled-command compatibility never aliases to boss access", () => {
  assert.equal(accessLevelFromCommandStage(CommandStage.DISABLED), DISABLED_LEGACY_ACCESS_LEVEL);
  assert.equal(commandStageFromAccessLevel(DISABLED_LEGACY_ACCESS_LEVEL), CommandStage.DISABLED);
});

test("canonical payload signing is deterministic and preserves the frozen contract", () => {
  const { privateKey, publicKey } = generateTestKeyPair();
  const payload = buildSnapshotPayload({
    snapshotId: "00000000-0000-4000-8000-000000000001",
    policyVersion: 42,
    pluginSlug: "dokaflex",
    username: "ppetkov",
    machineFingerprint: "machine-fingerprint",
    machineName: "DEV-PC-01",
    revitVersion: "2024",
    baseRole: "TESTER",
    allowedCommandKeys: ["DF.SMART_ARRAY", "DF.GENERATE_BEAM", "DF.SMART_ARRAY"],
    issuedAtUtc: new Date("2026-03-08T10:00:00.000Z"),
    refreshAfterUtc: new Date("2026-03-09T10:00:00.000Z"),
    graceUntilUtc: new Date("2026-03-16T10:00:00.000Z"),
  });

  const canonical = serializeCanonicalSnapshotPayload(payload);
  assert.equal(
    canonical,
    '{"snapshotId":"00000000-0000-4000-8000-000000000001","policyVersion":42,"pluginSlug":"dokaflex","username":"ppetkov","machineFingerprint":"machine-fingerprint","machineName":"DEV-PC-01","revitVersion":"2024","baseRole":"TESTER","allowedCommandKeys":["DF.GENERATE_BEAM","DF.SMART_ARRAY"],"issuedAtUtc":"2026-03-08T10:00:00Z","refreshAfterUtc":"2026-03-09T10:00:00Z","graceUntilUtc":"2026-03-16T10:00:00Z"}'
  );

  const firstEnvelope = createSignedSnapshotEnvelope(payload, privateKey);
  const secondEnvelope = createSignedSnapshotEnvelope(payload, privateKey);

  assert.equal(firstEnvelope.signature, secondEnvelope.signature);
  assert.equal(
    verifySnapshotPayloadSignature(firstEnvelope.payload, firstEnvelope.signature, publicKey),
    true
  );
});

test("refresh endpoint success path issues a signed snapshot with resolved command access", async () => {
  await withTestPrisma(async (prisma) => {
    const { privateKey, publicKey } = generateTestKeyPair();
    const pluginSlug = `dokaflex-refresh-${randomUUID()}`;
    const username = `refresh-user-${randomUUID()}`;

    await prisma.user.create({
      data: {
        username,
        isActive: true,
        baseRole: "TESTER",
        accessLevel: 2,
      },
    });

    await prisma.command.createMany({
      data: [
        createCommandRecord(pluginSlug, "DF.RELEASED", "Released", CommandStage.RELEASED),
        createCommandRecord(pluginSlug, "DF.TESTING", "Testing", CommandStage.TESTING),
        createCommandRecord(pluginSlug, "DF.DEVELOPMENT", "Development", CommandStage.DEVELOPMENT),
        createCommandRecord(pluginSlug, "DF.DISABLED", "Disabled", CommandStage.DISABLED),
      ],
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { username } });
    const developmentCommand = await prisma.command.findUniqueOrThrow({
      where: { pluginSlug_commandKey: { pluginSlug, commandKey: "DF.DEVELOPMENT" } },
    });
    const testingCommand = await prisma.command.findUniqueOrThrow({
      where: { pluginSlug_commandKey: { pluginSlug, commandKey: "DF.TESTING" } },
    });

    await prisma.userCommandOverride.createMany({
      data: [
        {
          id: randomUUID(),
          userId: user.id,
          commandId: developmentCommand.id,
          effect: UserCommandOverrideEffect.GRANT,
        },
        {
          id: randomUUID(),
          userId: user.id,
          commandId: testingCommand.id,
          effect: UserCommandOverrideEffect.DENY,
        },
      ],
    });

    const requestBody = JSON.stringify({
      pluginSlug,
      username,
      machineName: "DEV-PC-01",
      machineFingerprint: "fingerprint-123",
      revitVersion: "2024",
      pluginVersion: "24.10.03",
    });

    const result = await withPluginSecret("slice-2-plugin-secret", () =>
      handleAccessRefreshRequest(prisma, {
        rawBody: requestBody,
        signature: createPluginSignature(requestBody, "slice-2-plugin-secret"),
        now: new Date("2026-03-08T10:00:00Z"),
        loadPrivateKeyPem: () => privateKey,
      })
    );

    assert.equal(result.status, 200);
    if (!("format" in result.body)) {
      assert.fail("Expected a signed snapshot envelope");
    }

    assert.equal(result.body.format, "pcad-access-snapshot/v1");
    assert.deepEqual(result.body.payload.allowedCommandKeys, ["DF.DEVELOPMENT", "DF.RELEASED"]);
    assert.equal(result.body.payload.baseRole, "TESTER");
    assert.equal(result.body.payload.issuedAtUtc, "2026-03-08T10:00:00Z");
    assert.equal(result.body.payload.refreshAfterUtc, "2026-03-09T10:00:00Z");
    assert.equal(result.body.payload.graceUntilUtc, "2026-03-15T10:00:00Z");
    assert.equal(
      verifySnapshotPayloadSignature(result.body.payload, result.body.signature, publicKey),
      true
    );

    const snapshot = await prisma.pluginSessionSnapshot.findUniqueOrThrow({
      where: { snapshotId: result.body.payload.snapshotId },
    });
    assert.equal(snapshot.pluginVersion, "24.10.03");
    assert.equal(snapshot.allowedCommandKeys, JSON.stringify(["DF.DEVELOPMENT", "DF.RELEASED"]));

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { username } });
    assert.equal(updatedUser.lastMachineFingerprint, "fingerprint-123");
    assert.equal(updatedUser.lastMachineName, "DEV-PC-01");
  });
});

test("refresh endpoint rejects invalid HMAC and logs a security event", async () => {
  await withTestPrisma(async (prisma) => {
    const requestBody = JSON.stringify({
      pluginSlug: "dokaflex",
      username: "unknown-user",
      machineName: "DEV-PC-01",
      machineFingerprint: "fingerprint-123",
      revitVersion: "2024",
      pluginVersion: "24.10.03",
    });

    const result = await withPluginSecret("slice-2-plugin-secret", () =>
      handleAccessRefreshRequest(prisma, {
        rawBody: requestBody,
        signature: "bad-signature",
      })
    );

    assert.equal(result.status, 401);
    assert.deepEqual(result.body, {
      code: "INVALID_SIGNATURE",
      message: "Invalid signature",
    });

    const securityEvents = await prisma.securityEvent.findMany({
      where: { eventType: "invalid_signature" },
    });
    assert.equal(securityEvents.length, 1);
  });
});

test("refresh endpoint rejects unknown and inactive users", async () => {
  await withTestPrisma(async (prisma) => {
    const { privateKey } = generateTestKeyPair();
    const pluginSlug = `dokaflex-auth-${randomUUID()}`;
    const inactiveUsername = `inactive-user-${randomUUID()}`;

    await prisma.user.create({
      data: {
        username: inactiveUsername,
        isActive: false,
        baseRole: "USER",
        accessLevel: 1,
      },
    });

    const unknownBody = JSON.stringify({
      pluginSlug,
      username: "unknown-user",
      machineName: "DEV-PC-01",
      machineFingerprint: "fingerprint-123",
      revitVersion: "2024",
      pluginVersion: "24.10.03",
    });
    const unknownResult = await withPluginSecret("slice-2-plugin-secret", () =>
      handleAccessRefreshRequest(prisma, {
        rawBody: unknownBody,
        signature: createPluginSignature(unknownBody, "slice-2-plugin-secret"),
        loadPrivateKeyPem: () => privateKey,
      })
    );

    assert.equal(unknownResult.status, 403);
    assert.deepEqual(unknownResult.body, {
      code: "USER_NOT_FOUND",
      message: "Access denied",
    });

    const inactiveBody = JSON.stringify({
      pluginSlug,
      username: inactiveUsername,
      machineName: "DEV-PC-02",
      machineFingerprint: "fingerprint-456",
      revitVersion: "2024",
      pluginVersion: "24.10.03",
    });
    const inactiveResult = await withPluginSecret("slice-2-plugin-secret", () =>
      handleAccessRefreshRequest(prisma, {
        rawBody: inactiveBody,
        signature: createPluginSignature(inactiveBody, "slice-2-plugin-secret"),
        loadPrivateKeyPem: () => privateKey,
      })
    );

    assert.equal(inactiveResult.status, 403);
    assert.deepEqual(inactiveResult.body, {
      code: "USER_INACTIVE",
      message: "Access denied",
    });

    const unknownEvents = await prisma.securityEvent.findMany({
      where: { eventType: "unknown_user_attempt" },
    });
    const inactiveEvents = await prisma.securityEvent.findMany({
      where: { eventType: "disabled_user_attempt" },
    });
    assert.equal(unknownEvents.length, 1);
    assert.equal(inactiveEvents.length, 1);
  });
});

test("override APIs and effective-access preview stay in sync", async () => {
  await withTestPrisma(async (prisma) => {
    const pluginSlug = `preview-${randomUUID()}`;
    const username = `preview-user-${randomUUID()}`;

    await prisma.user.create({
      data: {
        username,
        isActive: true,
        baseRole: "USER",
        accessLevel: 1,
      },
    });

    await prisma.command.createMany({
      data: [
        createCommandRecord(pluginSlug, "DF.RELEASED", "Released", CommandStage.RELEASED),
        createCommandRecord(pluginSlug, "DF.TESTING", "Testing", CommandStage.TESTING),
      ],
    });

    const createdOverride = await createUserCommandOverride(prisma, {
      username,
      pluginSlug,
      commandKey: "DF.TESTING",
      effect: UserCommandOverrideEffect.GRANT,
      reason: "Local live test",
    });

    const listedOverrides = await listUserCommandOverrides(prisma, {
      username,
      pluginSlug,
    });
    assert.equal(listedOverrides.overrides.length, 1);
    assert.equal(listedOverrides.overrides[0]?.commandKey, "DF.TESTING");

    const preview = await previewEffectiveAccess(prisma, {
      username,
      pluginSlug,
      now,
    });
    assert.deepEqual(preview.allowedCommandKeys, ["DF.RELEASED", "DF.TESTING"]);
    assert.deepEqual(
      preview.commandAccess.find((command) => command.commandKey === "DF.TESTING")?.reasons,
      ["explicit_grant"]
    );

    await deleteUserCommandOverride(prisma, { id: createdOverride.id });

    const afterDelete = await listUserCommandOverrides(prisma, {
      username,
      pluginSlug,
    });
    assert.equal(afterDelete.overrides.length, 0);
  });
});

test("Dokaflex catalog bootstrap is idempotent and preserves requested stage defaults", async () => {
  await withTestPrisma(async (prisma) => {
    await prisma.userCommandOverride.deleteMany({
      where: {
        command: {
          pluginSlug: "dokaflex",
          commandKey: {
            in: DOKAFLEX_COMMAND_CATALOG.map((command) => command.commandKey),
          },
        },
      },
    });
    await prisma.command.deleteMany({
      where: {
        pluginSlug: "dokaflex",
        commandKey: {
          in: DOKAFLEX_COMMAND_CATALOG.map((command) => command.commandKey),
        },
      },
    });

    const firstSeed = await seedDokaflexCommandCatalog(prisma);
    const secondSeed = await seedDokaflexCommandCatalog(prisma);

    assert.equal(firstSeed.createdCount, DOKAFLEX_COMMAND_CATALOG.length);
    assert.equal(firstSeed.existingCount, 0);
    assert.equal(secondSeed.createdCount, 0);
    assert.equal(secondSeed.existingCount, DOKAFLEX_COMMAND_CATALOG.length);

    const commands = await prisma.command.findMany({
      where: {
        pluginSlug: "dokaflex",
        commandKey: {
          in: ["DF.COMMANDS_WINDOW", "DF.SMART_ARRAY", "DF.GENERATE_BEAM"],
        },
      },
    });

    const commandStages = new Map(commands.map((command) => [command.commandKey, command.stage]));
    assert.equal(commandStages.get("DF.COMMANDS_WINDOW"), CommandStage.DEVELOPMENT);
    assert.equal(commandStages.get("DF.SMART_ARRAY"), CommandStage.TESTING);
    assert.equal(commandStages.get("DF.GENERATE_BEAM"), CommandStage.RELEASED);
  });
});

test("issueAccessSnapshot can be called directly for local services", async () => {
  await withTestPrisma(async (prisma) => {
    const { privateKey, publicKey } = generateTestKeyPair();
    const pluginSlug = `direct-issue-${randomUUID()}`;
    const username = `direct-user-${randomUUID()}`;

    await prisma.user.create({
      data: {
        username,
        isActive: true,
        baseRole: "USER",
        accessLevel: 1,
      },
    });
    await prisma.command.create({
      data: createCommandRecord(pluginSlug, "DF.RELEASED", "Released", CommandStage.RELEASED),
    });

    const result = await issueAccessSnapshot(
      prisma,
      {
        pluginSlug,
        username,
        machineName: "DEV-PC-03",
        machineFingerprint: "fingerprint-789",
        revitVersion: "2025",
        pluginVersion: "25.01.00",
        now: new Date("2026-03-08T09:00:00Z"),
      },
      privateKey
    );

    assert.equal(result.envelope.payload.allowedCommandKeys.length, 1);
    assert.equal(
      verifySnapshotPayloadSignature(result.envelope.payload, result.envelope.signature, publicKey),
      true
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
    await run(prisma);
  } finally {
    await prisma.$disconnect();
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(`${dbPath}-journal`, { force: true });
  }
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

function createCommandRecord(
  pluginSlug: string,
  commandKey: string,
  displayName: string,
  stage: CommandStage
): {
  id: string;
  pluginSlug: string;
  commandKey: string;
  displayName: string;
  stage: CommandStage;
  uniqueName: string;
  descriptiveName: string;
  requiredAccessLevel: number;
} {
  return {
    id: randomUUID(),
    pluginSlug,
    commandKey,
    displayName,
    stage,
    uniqueName: commandKey,
    descriptiveName: displayName,
    requiredAccessLevel: accessLevelFromCommandStage(stage),
  };
}
