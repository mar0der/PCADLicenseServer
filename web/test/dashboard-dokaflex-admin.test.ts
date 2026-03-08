import assert from "node:assert/strict";
import test from "node:test";

import { BaseRole } from "@prisma/client";

import {
  buildPreviewDisplayRows,
  validateOverrideDeleteId,
  validateOverrideForm,
} from "../src/lib/dashboard/dokaflexAdmin";
import type { ResolvedCommandAccess } from "../src/lib/access-control/resolveEffectiveAllowedCommandKeys";

test("validateOverrideForm normalizes a valid override payload", () => {
  const result = validateOverrideForm(
    {
      commandKey: "DF.SMART_ARRAY",
      effect: "GRANT",
      expiresAtLocal: "2026-03-11T09:15:00.000Z",
      reason: "  Local live test  ",
    },
    ["DF.GENERATE_BEAM", "DF.SMART_ARRAY"]
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("Expected override validation to succeed");
  }

  assert.deepEqual(result.value, {
    commandKey: "DF.SMART_ARRAY",
    effect: "GRANT",
    expiresAt: "2026-03-11T09:15:00.000Z",
    reason: "Local live test",
  });
});

test("validateOverrideForm rejects invalid command selection, effect, and expiry", () => {
  const result = validateOverrideForm(
    {
      commandKey: "DF.UNKNOWN",
      effect: "ALLOW",
      expiresAtLocal: "not-a-date",
      reason: "",
    },
    ["DF.GENERATE_BEAM"]
  );

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("Expected override validation to fail");
  }

  assert.deepEqual(result.errors, [
    "Select a Dokaflex command from the current catalog.",
    "Override effect must be GRANT or DENY.",
    "Expiry must be a valid date and time.",
  ]);
});

test("validateOverrideDeleteId fails closed for blank ids", () => {
  assert.equal(validateOverrideDeleteId(""), "Override id is required.");
  assert.equal(validateOverrideDeleteId("   "), "Override id is required.");
  assert.equal(validateOverrideDeleteId("override-123"), null);
});

test("buildPreviewDisplayRows maps preview rows into operator-facing basis labels", () => {
  const commandAccess: ResolvedCommandAccess[] = [
    {
      commandKey: "DF.GENERATE_BEAM",
      stage: "RELEASED",
      allowed: true,
      baseRoleAllowed: true,
      appliedEffects: [],
      reasons: ["base_role_stage"],
    },
    {
      commandKey: "DF.SMART_ARRAY",
      stage: "TESTING",
      allowed: false,
      baseRoleAllowed: true,
      appliedEffects: ["DENY"],
      reasons: ["base_role_stage", "explicit_deny"],
    },
    {
      commandKey: "DF.COMMANDS_WINDOW",
      stage: "DISABLED",
      allowed: false,
      baseRoleAllowed: false,
      appliedEffects: [],
      reasons: ["disabled_command"],
    },
  ];

  const rows = buildPreviewDisplayRows({
    baseRole: BaseRole.TESTER,
    commandAccess,
  });

  assert.deepEqual(rows, [
    {
      commandKey: "DF.GENERATE_BEAM",
      stage: "RELEASED",
      statusLabel: "Allowed",
      reasonBadges: ["TESTER base role"],
      reasonSummary: "TESTER base role",
    },
    {
      commandKey: "DF.SMART_ARRAY",
      stage: "TESTING",
      statusLabel: "Blocked",
      reasonBadges: ["TESTER base role", "Explicit deny"],
      reasonSummary: "TESTER base role, Explicit deny",
    },
    {
      commandKey: "DF.COMMANDS_WINDOW",
      stage: "DISABLED",
      statusLabel: "Blocked",
      reasonBadges: ["Disabled command"],
      reasonSummary: "Disabled command",
    },
  ]);
});
