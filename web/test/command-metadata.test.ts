import assert from "node:assert/strict";
import test from "node:test";

import type { CommandStage } from "@prisma/client";

import {
  buildAdminCommandMetadataUpdate,
  buildPluginSyncedCommandMetadataUpdate,
  resolveCommandPresentation,
  validateAdminCommandMetadataUpdate,
} from "../src/lib/commands/metadata";

test("admin command metadata update locks edited fields without allowing identity changes", () => {
  const validation = validateAdminCommandMetadataUpdate({
    displayName: "  Beam Generator  ",
    manifestTitle: "  Beam Gen  ",
    description: "  Generates the main beam command label.  ",
    stage: "TESTING",
  });

  assert.equal(validation.ok, true);
  if (!validation.ok) {
    assert.fail("Expected command metadata validation to succeed");
  }

  const update = buildAdminCommandMetadataUpdate(
    {
      displayName: "Generate Beam",
      displayNameLocked: false,
      manifestTitle: "Generate Beam",
      manifestTitleLocked: false,
      description: "Plugin default tooltip",
      descriptionLocked: false,
      stage: "RELEASED",
      requiredAccessLevel: 1,
      descriptiveName: "Generate Beam",
    },
    validation.value
  );

  assert.equal(update.changed, true);
  assert.deepEqual(update.data, {
    displayName: "Beam Generator",
    displayNameLocked: true,
    manifestTitle: "Beam Gen",
    manifestTitleLocked: true,
    description: "Generates the main beam command label.",
    descriptionLocked: true,
    stage: "TESTING",
    requiredAccessLevel: 2,
    descriptiveName: "Beam Generator",
  });
});

test("normal admin metadata validation rejects command identity mutation attempts", () => {
  const result = validateAdminCommandMetadataUpdate({
    displayName: "Generate Beam",
    commandKey: "DF.REWRITE_COMMAND",
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("Expected command identity mutation to be rejected");
  }

  assert.deepEqual(result.errors, [
    "Command identity is immutable in the normal admin flow.",
  ]);
});

test("plugin sync preserves server-authored metadata while still refreshing unlocked defaults", () => {
  const preserved = buildPluginSyncedCommandMetadataUpdate(
    {
      displayName: "Beam Generator",
      displayNameLocked: true,
      manifestTitle: "Beam Gen",
      manifestTitleLocked: true,
      description: "Server tooltip",
      descriptionLocked: true,
      stage: "RELEASED" as CommandStage,
      requiredAccessLevel: 1,
      descriptiveName: "Beam Generator",
    },
    {
      displayName: "Plugin Generate Beam",
      manifestTitle: "Plugin Beam",
      description: "Plugin tooltip",
    }
  );

  assert.equal(preserved.changed, false);
  assert.deepEqual(preserved.data, {
    displayName: "Beam Generator",
    manifestTitle: "Beam Gen",
    description: "Server tooltip",
    descriptiveName: "Beam Generator",
  });

  const unlocked = buildPluginSyncedCommandMetadataUpdate(
    {
      displayName: "Generate Beam",
      displayNameLocked: false,
      manifestTitle: "Generate Beam",
      manifestTitleLocked: false,
      description: null,
      descriptionLocked: false,
      stage: "RELEASED" as CommandStage,
      requiredAccessLevel: 1,
      descriptiveName: "Generate Beam",
    },
    {
      displayName: "Plugin Generate Beam",
      manifestTitle: "Plugin Beam",
      description: "Plugin tooltip",
    }
  );

  assert.equal(unlocked.changed, true);
  assert.deepEqual(unlocked.data, {
    displayName: "Plugin Generate Beam",
    manifestTitle: "Plugin Beam",
    description: "Plugin tooltip",
    descriptiveName: "Plugin Generate Beam",
  });
});

test("command presentation prefers short label for ribbon title while keeping display name separate", () => {
  assert.deepEqual(
    resolveCommandPresentation({
      displayName: "Beam Generator",
      manifestTitle: "Beam Gen",
      description: "Server tooltip",
    }),
    {
      displayName: "Beam Generator",
      shortLabel: "Beam Gen",
      tooltip: "Server tooltip",
      title: "Beam Gen",
    }
  );
});
