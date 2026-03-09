import assert from "node:assert/strict";
import test from "node:test";

import { BaseRole } from "@prisma/client";

import {
  addPushButtonToPanel,
  addRibbonPanel,
  buildCommandMetadataForm,
  buildDokaflexUserSurfaceSummary,
  buildLocalTestingStatusModel,
  buildPreviewDisplayRows,
  buildRibbonCommandCatalogRows,
  buildRibbonItemCommandPresentation,
  countRibbonLayoutInventory,
  moveRibbonItemToPanel,
  moveRibbonItemWithinPanel,
  moveRibbonPanel,
  removeRibbonPanel,
  renameRibbonPanel,
  renameRibbonTab,
  validateCommandMetadataForm,
  validateOverrideDeleteId,
  validateOverrideForm,
} from "../src/lib/dashboard/dokaflexAdmin";
import type { ResolvedCommandAccess } from "../src/lib/access-control/resolveEffectiveAllowedCommandKeys";
import type { RibbonLayoutDocumentInput } from "../src/lib/ribbon-layout/service";

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

test("buildCommandMetadataForm mirrors the current server-authored command metadata", () => {
  const form = buildCommandMetadataForm({
    id: "command-1",
    commandKey: "DF.GENERATE_BEAM",
    displayName: "Beam Generator",
    manifestTitle: "Beam Gen",
    description: "Server-authored tooltip",
    stage: "TESTING",
    iconDataUri: null,
    totalUses: 0,
    uniqueUsers: 0,
    lastUsedAtUtc: null,
  });

  assert.deepEqual(form, {
    displayName: "Beam Generator",
    shortLabel: "Beam Gen",
    tooltip: "Server-authored tooltip",
    stage: "TESTING",
  });
});

test("validateCommandMetadataForm trims editable labels and rejects invalid stage values", () => {
  const validResult = validateCommandMetadataForm({
    displayName: "  Beam Generator  ",
    shortLabel: "  Beam Gen  ",
    tooltip: "  Server-authored tooltip  ",
    stage: "DEVELOPMENT",
  });

  assert.equal(validResult.ok, true);
  if (!validResult.ok) {
    assert.fail("Expected metadata validation to succeed");
  }

  assert.deepEqual(validResult.value, {
    displayName: "Beam Generator",
    manifestTitle: "Beam Gen",
    description: "Server-authored tooltip",
    stage: "DEVELOPMENT",
  });

  const invalidResult = validateCommandMetadataForm({
    displayName: "   ",
    shortLabel: "",
    tooltip: "",
    stage: "ALPHA",
  });

  assert.equal(invalidResult.ok, false);
  if (invalidResult.ok) {
    assert.fail("Expected metadata validation to fail");
  }

  assert.deepEqual(invalidResult.errors, [
    "Display name is required.",
    "Stage must be RELEASED, TESTING, DEVELOPMENT, or DISABLED.",
  ]);
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

test("buildDokaflexUserSurfaceSummary keeps the selected user context unambiguous", () => {
  const summary = buildDokaflexUserSurfaceSummary({
    username: "ppetkov",
    isActive: false,
    baseRole: BaseRole.TESTER,
    lastMachineName: "REVIT-WS-07",
    lastLoginAt: "2026-03-08T08:15:00Z",
  });

  assert.deepEqual(summary, {
    username: "ppetkov",
    statusLabel: "Disabled",
    statusTone: "danger",
    roleLabel: "TESTER base role",
    machineLabel: "REVIT-WS-07",
    lastLoginLabel: "2026-03-08T08:15:00.000Z",
  });
});

test("buildLocalTestingStatusModel reports when Dokaflex is ready for local live testing", () => {
  const readyModel = buildLocalTestingStatusModel({
    commandCount: 15,
    tabCount: 1,
    panelCount: 5,
    itemCount: 15,
    capabilityCatalogVersion: 2,
    ribbonLayoutVersion: 3,
    configVersion: 5,
  });
  const missingModel = buildLocalTestingStatusModel({
    commandCount: 15,
    tabCount: 0,
    panelCount: 0,
    itemCount: 0,
    capabilityCatalogVersion: 2,
    ribbonLayoutVersion: 0,
    configVersion: 2,
  });

  assert.equal(readyModel.isReady, true);
  assert.equal(readyModel.readinessLabel, "Ready for local Dokaflex testing");
  assert.equal(readyModel.versionCards[2]?.value, 5);
  assert.equal(missingModel.isReady, false);
  assert.match(missingModel.readinessMessage, /server-owned Dokaflex ribbon layout is still missing/i);
});

test("layout editor helpers rename, reorder, and move Dokaflex panels deterministically", () => {
  const baseline = createDokaflexLayout();

  const renamedTab = renameRibbonTab(baseline, "DF.TAB.MAIN", "Dokaflex Live");
  assert.equal(renamedTab.ok, true);
  if (!renamedTab.ok) {
    assert.fail("Expected tab rename to succeed");
  }

  const addedPanel = addRibbonPanel(renamedTab.value, "DF.TAB.MAIN", "Diagnostics");
  assert.equal(addedPanel.ok, true);
  if (!addedPanel.ok) {
    assert.fail("Expected panel add to succeed");
  }

  const renamedPanel = renameRibbonPanel(addedPanel.value, "DF.PANEL.DIAGNOSTICS", "Diagnostics + Support");
  assert.equal(renamedPanel.ok, true);
  if (!renamedPanel.ok) {
    assert.fail("Expected panel rename to succeed");
  }

  const movedPanel = moveRibbonPanel(renamedPanel.value, "DF.PANEL.DIAGNOSTICS", "up");
  assert.equal(movedPanel.ok, true);
  if (!movedPanel.ok) {
    assert.fail("Expected panel move to succeed");
  }

  assert.deepEqual(
    movedPanel.value.tabs[0]?.panels.map((panel) => `${panel.order}:${panel.panelKey}:${panel.title}`),
    [
      "1:DF.PANEL.BEAMS:Beams",
      "2:DF.PANEL.DIAGNOSTICS:Diagnostics + Support",
      "3:DF.PANEL.SETTINGS:Settings",
    ]
  );
});

test("layout editor helpers validate panel removal and item moves across panels", () => {
  const baseline = createDokaflexLayout();

  const blockedRemoval = removeRibbonPanel(baseline, "DF.PANEL.BEAMS");
  assert.equal(blockedRemoval.ok, false);
  if (blockedRemoval.ok) {
    assert.fail("Expected non-empty panel removal to fail");
  }
  assert.match(blockedRemoval.error, /move or remove them before deleting/i);

  const movedItem = moveRibbonItemToPanel(
    baseline,
    "DF.PANEL.BEAMS",
    "DF.ITEM.GENERATE_BEAM",
    "DF.PANEL.SETTINGS"
  );
  assert.equal(movedItem.ok, true);
  if (!movedItem.ok) {
    assert.fail("Expected cross-panel move to succeed");
  }

  assert.deepEqual(
    movedItem.value.tabs[0]?.panels[0]?.items.map((item) => `${item.order}:${item.itemKey}`),
    ["1:DF.ITEM.PLACE_PRIMARY_BEAMS"]
  );
  assert.deepEqual(
    movedItem.value.tabs[0]?.panels[1]?.items.map((item) => `${item.order}:${item.itemKey}`),
    ["1:DF.ITEM.USER_SETTINGS", "2:DF.ITEM.GENERATE_BEAM"]
  );

  const removedNowEmptyPanel = removeRibbonPanel(
    {
      ...movedItem.value,
      tabs: movedItem.value.tabs.map((tab) => ({
        ...tab,
        panels: tab.panels.map((panel) =>
          panel.panelKey === "DF.PANEL.BEAMS"
            ? { ...panel, items: [] }
            : panel
        ),
      })),
    },
    "DF.PANEL.BEAMS"
  );

  assert.equal(removedNowEmptyPanel.ok, true);
});

test("layout editor helpers support in-panel reordering, push-button creation, and inventory counting", () => {
  const baseline = createDokaflexLayout();
  const addedButton = addPushButtonToPanel(
    baseline,
    "DF.PANEL.SETTINGS",
    "DF.PARAMETER_EDITOR",
    "Parameter Editor"
  );
  assert.equal(addedButton.ok, true);
  if (!addedButton.ok) {
    assert.fail("Expected add push button to succeed");
  }

  const reordered = moveRibbonItemWithinPanel(
    addedButton.value,
    "DF.PANEL.SETTINGS",
    "DF.ITEM.DF_PARAMETER_EDITOR",
    "up"
  );
  assert.equal(reordered.ok, true);
  if (!reordered.ok) {
    assert.fail("Expected in-panel reorder to succeed");
  }

  assert.deepEqual(
    reordered.value.tabs[0]?.panels[1]?.items.map((item) => `${item.order}:${item.itemKey}`),
    ["1:DF.ITEM.DF_PARAMETER_EDITOR", "2:DF.ITEM.USER_SETTINGS"]
  );
  assert.deepEqual(countRibbonLayoutInventory(reordered.value), {
    tabCount: 1,
    panelCount: 2,
    itemCount: 4,
  });
});

test("buildRibbonCommandCatalogRows reframes Dokaflex commands around stage, usage, icon, and layout placement", () => {
  const rows = buildRibbonCommandCatalogRows({
    layout: createDokaflexLayout(),
    commands: [
      {
        id: "command-2",
        commandKey: "DF.PARAMETER_EDITOR",
        displayName: "Parameter Editor",
        manifestTitle: "Parameter Editor",
        description: null,
        stage: "TESTING",
        iconDataUri: "data:image/png;base64,AAA",
        totalUses: 3,
        uniqueUsers: 2,
        lastUsedAtUtc: "2026-03-08T10:00:00Z",
      },
      {
        id: "command-1",
        commandKey: "DF.GENERATE_BEAM",
        displayName: "Beam Generator",
        manifestTitle: "Beam Gen",
        description: "Server-authored tooltip",
        stage: "RELEASED",
        iconDataUri: null,
        totalUses: 12,
        uniqueUsers: 4,
        lastUsedAtUtc: "2026-03-09T08:30:00Z",
      },
    ],
  });

  assert.deepEqual(rows, [
    {
      id: "command-1",
      commandKey: "DF.GENERATE_BEAM",
      displayName: "Beam Generator",
      shortLabel: "Beam Gen",
      tooltip: "Server-authored tooltip",
      title: "Beam Gen",
      stage: "RELEASED",
      iconDataUri: null,
      totalUses: 12,
      uniqueUsers: 4,
      lastUsedAtUtc: "2026-03-09T08:30:00Z",
      placements: ["Dokaflex / Beams"],
      placementCount: 1,
    },
    {
      id: "command-2",
      commandKey: "DF.PARAMETER_EDITOR",
      displayName: "Parameter Editor",
      shortLabel: "Parameter Editor",
      tooltip: null,
      title: "Parameter Editor",
      stage: "TESTING",
      iconDataUri: "data:image/png;base64,AAA",
      totalUses: 3,
      uniqueUsers: 2,
      lastUsedAtUtc: "2026-03-08T10:00:00Z",
      placements: [],
      placementCount: 0,
    },
  ]);
});

test("buildRibbonItemCommandPresentation keeps immutable command identity separate from display metadata", () => {
  assert.deepEqual(
    buildRibbonItemCommandPresentation({
      displayName: "Beam Generator",
      manifestTitle: "Beam Gen",
      description: "Server-authored tooltip",
    }),
    {
      displayName: "Beam Generator",
      shortLabel: "Beam Gen",
      tooltip: "Server-authored tooltip",
      title: "Beam Gen",
    }
  );
});

function createDokaflexLayout(): RibbonLayoutDocumentInput {
  return {
    pluginSlug: "dokaflex",
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
              createPushButtonItem("DF.ITEM.GENERATE_BEAM", 1, "DF.GENERATE_BEAM", "Generate Beam"),
              createPushButtonItem(
                "DF.ITEM.PLACE_PRIMARY_BEAMS",
                2,
                "DF.PLACE_PRIMARY_BEAMS",
                "Place Primary Beams"
              ),
            ],
          },
          {
            panelKey: "DF.PANEL.SETTINGS",
            title: "Settings",
            order: 2,
            items: [createPushButtonItem("DF.ITEM.USER_SETTINGS", 1, "DF.USER_SETTINGS", "User Settings")],
          },
        ],
      },
    ],
  };
}

function createPushButtonItem(
  itemKey: string,
  order: number,
  commandKey: string,
  title: string
) {
  return {
    itemKey,
    order,
    kind: "push_button" as const,
    size: "LARGE",
    commandKey,
    iconCommandKey: commandKey,
    title,
    children: [],
  };
}
