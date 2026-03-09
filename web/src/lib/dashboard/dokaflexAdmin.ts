import type {
  BaseRole,
  CommandStage,
  UserCommandOverrideEffect,
} from "@prisma/client";

import type {
  CommandAccessReason,
  ResolvedCommandAccess,
} from "../access-control/resolveEffectiveAllowedCommandKeys";
import {
  resolveCommandPresentation,
  type CommandPresentation,
} from "../commands/metadata";
import type {
  RibbonLayoutDocumentInput,
  RibbonLayoutItemInput,
  RibbonLayoutPanelInput,
  RibbonLayoutTabInput,
} from "../ribbon-layout/service";

export type OverrideFormInput = {
  commandKey: string;
  effect: string;
  expiresAtLocal: string;
  reason: string;
};

export type ValidatedOverrideForm = {
  commandKey: string;
  effect: UserCommandOverrideEffect;
  expiresAt: string | null;
  reason: string | null;
};

export type OverrideValidationResult =
  | { ok: true; value: ValidatedOverrideForm }
  | { ok: false; errors: string[] };

export type CommandMetadataFormInput = {
  displayName: string;
  shortLabel: string;
  tooltip: string;
  stage: string;
};

export type ValidatedCommandMetadataForm = {
  displayName: string;
  manifestTitle: string | null;
  description: string | null;
  stage: CommandStage;
};

export type CommandMetadataValidationResult =
  | { ok: true; value: ValidatedCommandMetadataForm }
  | { ok: false; errors: string[] };

export type PreviewDisplayRow = {
  commandKey: string;
  stage: ResolvedCommandAccess["stage"];
  statusLabel: "Allowed" | "Blocked";
  reasonBadges: string[];
  reasonSummary: string;
};

export type DokaflexUserSurfaceInput = {
  username: string;
  isActive: boolean;
  baseRole: BaseRole;
  machineName?: string | null;
  lastMachineName?: string | null;
  lastLogin?: string | Date | null;
  lastLoginAt?: string | Date | null;
};

export type DokaflexUserSurfaceSummary = {
  username: string;
  statusLabel: string;
  statusTone: "success" | "danger";
  roleLabel: string;
  machineLabel: string;
  lastLoginLabel: string;
};

export type LocalTestingStatusInput = {
  commandCount: number;
  tabCount: number;
  panelCount: number;
  itemCount: number;
  capabilityCatalogVersion: number;
  ribbonLayoutVersion: number;
  configVersion: number;
};

export type LocalTestingStatusModel = {
  isReady: boolean;
  readinessLabel: string;
  readinessTone: "success" | "warning";
  readinessMessage: string;
  bootstrapLabel: string;
  versionCards: Array<{ label: string; value: number }>;
  inventoryCards: Array<{ label: string; value: number }>;
};

export type LayoutMutationResult =
  | { ok: true; value: RibbonLayoutDocumentInput }
  | { ok: false; error: string };

export type RibbonCommandCatalogEntry = {
  id: string;
  commandKey: string;
  displayName: string;
  manifestTitle: string | null;
  description: string | null;
  stage: CommandStage;
  iconDataUri: string | null;
  totalUses: number;
  uniqueUsers: number;
  lastUsedAtUtc: string | null;
};

export type RibbonCommandCatalogRow = {
  id: string;
  commandKey: string;
  displayName: string;
  shortLabel: string | null;
  tooltip: string | null;
  title: string;
  stage: CommandStage;
  iconDataUri: string | null;
  totalUses: number;
  uniqueUsers: number;
  lastUsedAtUtc: string | null;
  placements: string[];
  placementCount: number;
};

const OVERRIDE_EFFECTS = new Set<UserCommandOverrideEffect>(["GRANT", "DENY"]);
const COMMAND_STAGES = new Set<CommandStage>([
  "RELEASED",
  "TESTING",
  "DEVELOPMENT",
  "DISABLED",
]);

export function validateOverrideForm(
  input: OverrideFormInput,
  availableCommandKeys: string[]
): OverrideValidationResult {
  const errors: string[] = [];
  const commandKey = input.commandKey.trim();
  const reason = input.reason.trim();
  const expiresAtLocal = input.expiresAtLocal.trim();
  const availableCommandKeySet = new Set(availableCommandKeys);

  if (!commandKey) {
    errors.push("Command key is required.");
  } else if (!availableCommandKeySet.has(commandKey)) {
    errors.push("Select a Dokaflex command from the current catalog.");
  }

  if (!OVERRIDE_EFFECTS.has(input.effect as UserCommandOverrideEffect)) {
    errors.push("Override effect must be GRANT or DENY.");
  }

  let expiresAt: string | null = null;
  if (expiresAtLocal) {
    const parsedExpiry = new Date(expiresAtLocal);
    if (Number.isNaN(parsedExpiry.getTime())) {
      errors.push("Expiry must be a valid date and time.");
    } else {
      expiresAt = parsedExpiry.toISOString();
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      commandKey,
      effect: input.effect as UserCommandOverrideEffect,
      expiresAt,
      reason: reason || null,
    },
  };
}

export function validateOverrideDeleteId(overrideId: string): string | null {
  return overrideId.trim() ? null : "Override id is required.";
}

export function buildCommandMetadataForm(entry: RibbonCommandCatalogEntry): CommandMetadataFormInput {
  return {
    displayName: entry.displayName,
    shortLabel: entry.manifestTitle ?? "",
    tooltip: entry.description ?? "",
    stage: entry.stage,
  };
}

export function validateCommandMetadataForm(
  input: CommandMetadataFormInput
): CommandMetadataValidationResult {
  const errors: string[] = [];
  const displayName = input.displayName.trim();
  const shortLabel = trimOptional(input.shortLabel);
  const tooltip = trimOptional(input.tooltip);

  if (!displayName) {
    errors.push("Display name is required.");
  }

  if (!COMMAND_STAGES.has(input.stage as CommandStage)) {
    errors.push("Stage must be RELEASED, TESTING, DEVELOPMENT, or DISABLED.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      displayName,
      manifestTitle: shortLabel,
      description: tooltip,
      stage: input.stage as CommandStage,
    },
  };
}

export function buildPreviewDisplayRows(input: {
  baseRole: BaseRole;
  commandAccess: ResolvedCommandAccess[];
}): PreviewDisplayRow[] {
  return input.commandAccess.map((command) => {
    const reasonBadges = command.reasons.map((reason) =>
      mapReasonToBadge(reason, input.baseRole)
    );

    return {
      commandKey: command.commandKey,
      stage: command.stage,
      statusLabel: command.allowed ? "Allowed" : "Blocked",
      reasonBadges,
      reasonSummary: reasonBadges.join(", ") || "No matching policy basis",
    };
  });
}

export function buildDokaflexUserSurfaceSummary(
  input: DokaflexUserSurfaceInput
): DokaflexUserSurfaceSummary {
  return {
    username: input.username,
    statusLabel: input.isActive ? "Active" : "Disabled",
    statusTone: input.isActive ? "success" : "danger",
    roleLabel: `${input.baseRole} base role`,
    machineLabel:
      trimOptional(input.lastMachineName) ??
      trimOptional(input.machineName) ??
      "No verified machine yet",
    lastLoginLabel:
      normalizeTimestamp(input.lastLoginAt ?? input.lastLogin) ??
      "No successful verification yet",
  };
}

export function buildLocalTestingStatusModel(
  input: LocalTestingStatusInput
): LocalTestingStatusModel {
  const hasCatalog = input.commandCount > 0 && input.capabilityCatalogVersion > 0;
  const hasLayout = input.tabCount > 0 && input.panelCount > 0 && input.ribbonLayoutVersion > 0;
  const isReady = hasCatalog && hasLayout;

  let readinessMessage = `Catalog has ${input.commandCount} command(s); layout has ${input.tabCount} tab(s), ${input.panelCount} panel(s), and ${input.itemCount} item(s).`;
  if (!hasCatalog && !hasLayout) {
    readinessMessage =
      "Dokaflex has not been bootstrapped yet. Seed the catalog and default layout before the next local plugin refresh.";
  } else if (!hasCatalog) {
    readinessMessage =
      "Ribbon layout exists, but the Dokaflex capability catalog is still missing. Run the Dokaflex bootstrap before testing.";
  } else if (!hasLayout) {
    readinessMessage =
      "Command catalog exists, but the server-owned Dokaflex ribbon layout is still missing. Seed the default layout before testing.";
  }

  return {
    isReady,
    readinessLabel: isReady ? "Ready for local Dokaflex testing" : "Bootstrap recommended",
    readinessTone: isReady ? "success" : "warning",
    readinessMessage,
    bootstrapLabel: isReady
      ? "Catalog and default server layout are present."
      : "Bootstrap Dokaflex to make local live testing stable.",
    versionCards: [
      { label: "Catalog Version", value: input.capabilityCatalogVersion },
      { label: "Layout Version", value: input.ribbonLayoutVersion },
      { label: "Config Version", value: input.configVersion },
    ],
    inventoryCards: [
      { label: "Commands", value: input.commandCount },
      { label: "Tabs", value: input.tabCount },
      { label: "Panels", value: input.panelCount },
      { label: "Items", value: input.itemCount },
    ],
  };
}

export function renameRibbonTab(
  layout: RibbonLayoutDocumentInput,
  tabKey: string,
  nextTitle: string
): LayoutMutationResult {
  const title = nextTitle.trim();
  if (!title) {
    return { ok: false, error: "Tab title is required." };
  }

  let foundTab = false;
  const updatedLayout = cloneRibbonLayout(layout);
  updatedLayout.tabs = updatedLayout.tabs.map((tab) => {
    if (tab.tabKey !== tabKey) {
      return tab;
    }

    foundTab = true;
    return {
      ...tab,
      title,
    };
  });

  if (!foundTab) {
    return { ok: false, error: `Ribbon tab ${tabKey} was not found.` };
  }

  return { ok: true, value: updatedLayout };
}

export function renameRibbonPanel(
  layout: RibbonLayoutDocumentInput,
  panelKey: string,
  nextTitle: string
): LayoutMutationResult {
  const title = nextTitle.trim();
  if (!title) {
    return { ok: false, error: "Panel title is required." };
  }

  const { tabIndex, panelIndex } = findPanelLocation(layout, panelKey);
  if (tabIndex < 0 || panelIndex < 0) {
    return { ok: false, error: `Ribbon panel ${panelKey} was not found.` };
  }

  const updatedLayout = cloneRibbonLayout(layout);
  updatedLayout.tabs[tabIndex].panels[panelIndex] = {
    ...updatedLayout.tabs[tabIndex].panels[panelIndex],
    title,
  };

  return { ok: true, value: updatedLayout };
}

export function addRibbonPanel(
  layout: RibbonLayoutDocumentInput,
  tabKey: string,
  panelTitle: string
): LayoutMutationResult {
  const title = panelTitle.trim();
  if (!title) {
    return { ok: false, error: "Panel title is required." };
  }

  const tabIndex = layout.tabs.findIndex((tab) => tab.tabKey === tabKey);
  if (tabIndex < 0) {
    return { ok: false, error: `Ribbon tab ${tabKey} was not found.` };
  }

  const updatedLayout = cloneRibbonLayout(layout);
  const targetTab = updatedLayout.tabs[tabIndex];
  const usedPanelKeys = new Set(
    updatedLayout.tabs.flatMap((tab) => tab.panels.map((panel) => panel.panelKey))
  );
  const panelKey = createUniqueKey("DF.PANEL", title, usedPanelKeys);

  targetTab.panels.push({
    panelKey,
    title,
    order: targetTab.panels.length + 1,
    items: [],
  });
  targetTab.panels = reindexPanels(targetTab.panels);

  return { ok: true, value: updatedLayout };
}

export function removeRibbonPanel(
  layout: RibbonLayoutDocumentInput,
  panelKey: string
): LayoutMutationResult {
  const { tabIndex, panelIndex } = findPanelLocation(layout, panelKey);
  if (tabIndex < 0 || panelIndex < 0) {
    return { ok: false, error: `Ribbon panel ${panelKey} was not found.` };
  }

  const panel = layout.tabs[tabIndex]?.panels[panelIndex];
  if (!panel) {
    return { ok: false, error: `Ribbon panel ${panelKey} was not found.` };
  }

  if (panel.items.length > 0) {
    return {
      ok: false,
      error: `Panel ${panel.title} still contains items. Move or remove them before deleting the panel.`,
    };
  }

  const updatedLayout = cloneRibbonLayout(layout);
  updatedLayout.tabs[tabIndex].panels.splice(panelIndex, 1);
  updatedLayout.tabs[tabIndex].panels = reindexPanels(updatedLayout.tabs[tabIndex].panels);

  return { ok: true, value: updatedLayout };
}

export function moveRibbonPanel(
  layout: RibbonLayoutDocumentInput,
  panelKey: string,
  direction: "up" | "down"
): LayoutMutationResult {
  const { tabIndex, panelIndex } = findPanelLocation(layout, panelKey);
  if (tabIndex < 0 || panelIndex < 0) {
    return { ok: false, error: `Ribbon panel ${panelKey} was not found.` };
  }

  const targetIndex = direction === "up" ? panelIndex - 1 : panelIndex + 1;
  const targetPanels = layout.tabs[tabIndex]?.panels ?? [];
  if (targetIndex < 0 || targetIndex >= targetPanels.length) {
    return { ok: false, error: `Panel ${panelKey} cannot move ${direction} any further.` };
  }

  const updatedLayout = cloneRibbonLayout(layout);
  const panels = [...updatedLayout.tabs[tabIndex].panels];
  [panels[panelIndex], panels[targetIndex]] = [panels[targetIndex], panels[panelIndex]];
  updatedLayout.tabs[tabIndex].panels = reindexPanels(panels);

  return { ok: true, value: updatedLayout };
}

export function addPushButtonToPanel(
  layout: RibbonLayoutDocumentInput,
  panelKey: string,
  commandKey: string,
  commandTitle: string
): LayoutMutationResult {
  const trimmedCommandKey = commandKey.trim();
  if (!trimmedCommandKey) {
    return { ok: false, error: "Command key is required." };
  }

  const { tabIndex, panelIndex } = findPanelLocation(layout, panelKey);
  if (tabIndex < 0 || panelIndex < 0) {
    return { ok: false, error: `Ribbon panel ${panelKey} was not found.` };
  }

  const updatedLayout = cloneRibbonLayout(layout);
  const panel = updatedLayout.tabs[tabIndex].panels[panelIndex];
  const usedItemKeys = new Set(
    updatedLayout.tabs.flatMap((tab) =>
      tab.panels.flatMap((candidatePanel) => collectItemKeys(candidatePanel.items))
    )
  );
  const itemKey = createUniqueKey("DF.ITEM", trimmedCommandKey, usedItemKeys);

  panel.items.push({
    itemKey,
    order: panel.items.length + 1,
    kind: "push_button",
    size: "LARGE",
    commandKey: trimmedCommandKey,
    iconCommandKey: trimmedCommandKey,
    title: commandTitle.trim() || trimmedCommandKey,
    children: [],
  });
  panel.items = reindexItems(panel.items);

  return { ok: true, value: updatedLayout };
}

export function removeRibbonItem(
  layout: RibbonLayoutDocumentInput,
  panelKey: string,
  itemKey: string
): LayoutMutationResult {
  const { tabIndex, panelIndex } = findPanelLocation(layout, panelKey);
  if (tabIndex < 0 || panelIndex < 0) {
    return { ok: false, error: `Ribbon panel ${panelKey} was not found.` };
  }

  const updatedLayout = cloneRibbonLayout(layout);
  const panel = updatedLayout.tabs[tabIndex].panels[panelIndex];
  const itemIndex = panel.items.findIndex((item) => item.itemKey === itemKey);
  if (itemIndex < 0) {
    return { ok: false, error: `Ribbon item ${itemKey} was not found in panel ${panelKey}.` };
  }

  panel.items.splice(itemIndex, 1);
  panel.items = reindexItems(panel.items);

  return { ok: true, value: updatedLayout };
}

export function moveRibbonItemWithinPanel(
  layout: RibbonLayoutDocumentInput,
  panelKey: string,
  itemKey: string,
  direction: "up" | "down"
): LayoutMutationResult {
  const { tabIndex, panelIndex } = findPanelLocation(layout, panelKey);
  if (tabIndex < 0 || panelIndex < 0) {
    return { ok: false, error: `Ribbon panel ${panelKey} was not found.` };
  }

  const items = layout.tabs[tabIndex]?.panels[panelIndex]?.items ?? [];
  const itemIndex = items.findIndex((item) => item.itemKey === itemKey);
  if (itemIndex < 0) {
    return { ok: false, error: `Ribbon item ${itemKey} was not found in panel ${panelKey}.` };
  }

  const targetIndex = direction === "up" ? itemIndex - 1 : itemIndex + 1;
  if (targetIndex < 0 || targetIndex >= items.length) {
    return {
      ok: false,
      error: `Ribbon item ${itemKey} cannot move ${direction} any further in panel ${panelKey}.`,
    };
  }

  const updatedLayout = cloneRibbonLayout(layout);
  const nextItems = [...updatedLayout.tabs[tabIndex].panels[panelIndex].items];
  [nextItems[itemIndex], nextItems[targetIndex]] = [nextItems[targetIndex], nextItems[itemIndex]];
  updatedLayout.tabs[tabIndex].panels[panelIndex].items = reindexItems(nextItems);

  return { ok: true, value: updatedLayout };
}

export function moveRibbonItemToPanel(
  layout: RibbonLayoutDocumentInput,
  fromPanelKey: string,
  itemKey: string,
  toPanelKey: string
): LayoutMutationResult {
  if (fromPanelKey === toPanelKey) {
    return { ok: false, error: "Choose a different destination panel." };
  }

  const sourceLocation = findPanelLocation(layout, fromPanelKey);
  const targetLocation = findPanelLocation(layout, toPanelKey);
  if (sourceLocation.tabIndex < 0 || sourceLocation.panelIndex < 0) {
    return { ok: false, error: `Ribbon panel ${fromPanelKey} was not found.` };
  }

  if (targetLocation.tabIndex < 0 || targetLocation.panelIndex < 0) {
    return { ok: false, error: `Ribbon panel ${toPanelKey} was not found.` };
  }

  const sourceItems =
    layout.tabs[sourceLocation.tabIndex]?.panels[sourceLocation.panelIndex]?.items ?? [];
  const itemIndex = sourceItems.findIndex((item) => item.itemKey === itemKey);
  if (itemIndex < 0) {
    return { ok: false, error: `Ribbon item ${itemKey} was not found in panel ${fromPanelKey}.` };
  }

  const updatedLayout = cloneRibbonLayout(layout);
  const sourcePanel = updatedLayout.tabs[sourceLocation.tabIndex].panels[sourceLocation.panelIndex];
  const [item] = sourcePanel.items.splice(itemIndex, 1);
  if (!item) {
    return { ok: false, error: `Ribbon item ${itemKey} was not found in panel ${fromPanelKey}.` };
  }

  sourcePanel.items = reindexItems(sourcePanel.items);
  const targetPanel = updatedLayout.tabs[targetLocation.tabIndex].panels[targetLocation.panelIndex];
  targetPanel.items.push({
    ...item,
    order: targetPanel.items.length + 1,
  });
  targetPanel.items = reindexItems(targetPanel.items);

  return { ok: true, value: updatedLayout };
}

export function buildRibbonCommandCatalogRows(input: {
  commands: RibbonCommandCatalogEntry[];
  layout: RibbonLayoutDocumentInput;
}): RibbonCommandCatalogRow[] {
  const placementsByCommandKey = buildCommandPlacementIndex(input.layout);

  return input.commands
    .map((command) => {
      const placements = placementsByCommandKey[command.commandKey] ?? [];
      const presentation = resolveCommandPresentation(command);
      return {
        id: command.id,
        commandKey: command.commandKey,
        displayName: presentation.displayName,
        shortLabel: presentation.shortLabel,
        tooltip: presentation.tooltip,
        title: presentation.title,
        stage: command.stage,
        iconDataUri: command.iconDataUri,
        totalUses: command.totalUses,
        uniqueUsers: command.uniqueUsers,
        lastUsedAtUtc: command.lastUsedAtUtc,
        placements,
        placementCount: placements.length,
      };
    })
    .sort((left, right) => {
      if (left.stage !== right.stage) {
        return stageRank(left.stage) - stageRank(right.stage);
      }

      if (left.displayName < right.displayName) {
        return -1;
      }

      if (left.displayName > right.displayName) {
        return 1;
      }

      return 0;
    });
}

export function buildRibbonItemCommandPresentation(input: {
  displayName: string;
  manifestTitle: string | null;
  description: string | null;
}): CommandPresentation {
  return resolveCommandPresentation(input);
}

export function countRibbonLayoutInventory(layout: RibbonLayoutDocumentInput): {
  tabCount: number;
  panelCount: number;
  itemCount: number;
} {
  return {
    tabCount: layout.tabs.length,
    panelCount: layout.tabs.reduce((count, tab) => count + tab.panels.length, 0),
    itemCount: layout.tabs.reduce(
      (count, tab) =>
        count + tab.panels.reduce((panelCount, panel) => panelCount + countItems(panel.items), 0),
      0
    ),
  };
}

function mapReasonToBadge(reason: CommandAccessReason, baseRole: BaseRole): string {
  switch (reason) {
    case "base_role_stage":
      return `${baseRole} base role`;
    case "explicit_grant":
      return "Explicit grant";
    case "explicit_deny":
      return "Explicit deny";
    case "disabled_command":
      return "Disabled command";
    case "inactive_user":
      return "Inactive user";
    default:
      return "Unknown reason";
  }
}

function findPanelLocation(
  layout: RibbonLayoutDocumentInput,
  panelKey: string
): { tabIndex: number; panelIndex: number } {
  for (let tabIndex = 0; tabIndex < layout.tabs.length; tabIndex += 1) {
    const panelIndex = layout.tabs[tabIndex]?.panels.findIndex(
      (panel) => panel.panelKey === panelKey
    );
    if (panelIndex !== undefined && panelIndex >= 0) {
      return { tabIndex, panelIndex };
    }
  }

  return { tabIndex: -1, panelIndex: -1 };
}

function cloneRibbonLayout(layout: RibbonLayoutDocumentInput): RibbonLayoutDocumentInput {
  return {
    pluginSlug: layout.pluginSlug,
    tabs: layout.tabs.map(cloneRibbonTab),
  };
}

function cloneRibbonTab(tab: RibbonLayoutTabInput): RibbonLayoutTabInput {
  return {
    tabKey: tab.tabKey,
    title: tab.title,
    order: tab.order,
    panels: tab.panels.map(cloneRibbonPanel),
  };
}

function cloneRibbonPanel(panel: RibbonLayoutPanelInput): RibbonLayoutPanelInput {
  return {
    panelKey: panel.panelKey,
    title: panel.title,
    order: panel.order,
    items: panel.items.map(cloneRibbonItem),
  };
}

function cloneRibbonItem(item: RibbonLayoutItemInput): RibbonLayoutItemInput {
  return {
    itemKey: item.itemKey,
    order: item.order,
    kind: item.kind,
    size: item.size ?? null,
    commandKey: item.commandKey ?? null,
    iconCommandKey: item.iconCommandKey ?? null,
    title: item.title ?? null,
    children: (item.children ?? []).map(cloneRibbonItem),
  };
}

function reindexPanels(panels: RibbonLayoutPanelInput[]): RibbonLayoutPanelInput[] {
  return panels.map((panel, index) => ({
    ...panel,
    order: index + 1,
  }));
}

function reindexItems(items: RibbonLayoutItemInput[]): RibbonLayoutItemInput[] {
  return items.map((item, index) => ({
    ...item,
    order: index + 1,
  }));
}

function buildCommandPlacementIndex(
  layout: RibbonLayoutDocumentInput
): Record<string, string[]> {
  const placementsByCommandKey: Record<string, string[]> = {};

  for (const tab of layout.tabs) {
    for (const panel of tab.panels) {
      appendItemPlacements(placementsByCommandKey, tab.title, panel.title, panel.items);
    }
  }

  return placementsByCommandKey;
}

function appendItemPlacements(
  placementsByCommandKey: Record<string, string[]>,
  tabTitle: string,
  panelTitle: string,
  items: RibbonLayoutItemInput[]
): void {
  for (const item of items) {
    if (item.commandKey) {
      const currentPlacements = placementsByCommandKey[item.commandKey] ?? [];
      currentPlacements.push(`${tabTitle} / ${panelTitle}`);
      placementsByCommandKey[item.commandKey] = currentPlacements;
    }

    appendItemPlacements(placementsByCommandKey, tabTitle, panelTitle, item.children ?? []);
  }
}

function collectItemKeys(items: RibbonLayoutItemInput[]): string[] {
  return items.flatMap((item) => [item.itemKey, ...collectItemKeys(item.children ?? [])]);
}

function createUniqueKey(prefix: string, rawValue: string, usedKeys: Set<string>): string {
  const normalizedSegment = rawValue
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const baseKey = `${prefix}.${normalizedSegment || "CUSTOM"}`;

  if (!usedKeys.has(baseKey)) {
    return baseKey;
  }

  let suffix = 2;
  while (usedKeys.has(`${baseKey}_${suffix}`)) {
    suffix += 1;
  }

  return `${baseKey}_${suffix}`;
}

function countItems(items: RibbonLayoutItemInput[]): number {
  return items.reduce((count, item) => count + 1 + countItems(item.children ?? []), 0);
}

function trimOptional(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
}

function normalizeTimestamp(value?: string | Date | null): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  const parsedValue = new Date(value);
  return Number.isNaN(parsedValue.getTime()) ? null : parsedValue.toISOString();
}

function stageRank(stage: CommandStage): number {
  switch (stage) {
    case "RELEASED":
      return 0;
    case "TESTING":
      return 1;
    case "DEVELOPMENT":
      return 2;
    case "DISABLED":
      return 3;
  }
}
