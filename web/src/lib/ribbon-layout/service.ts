import {
  Prisma,
  PrismaClient,
  RibbonItemKind,
  type RibbonItem,
  type RibbonPanel,
  type RibbonTab,
} from "@prisma/client";

import {
  bumpRibbonLayoutVersion,
  getPluginConfigurationState,
  type PluginConfigurationVersionState,
} from "../plugin-configuration/state";

type RibbonLayoutDb = PrismaClient | Prisma.TransactionClient;

export class RibbonLayoutError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export type RibbonLayoutItemInput = {
  itemKey: string;
  order: number;
  kind: RibbonItemKind;
  size?: string | null;
  commandKey?: string | null;
  iconCommandKey?: string | null;
  title?: string | null;
  children?: RibbonLayoutItemInput[];
};

export type RibbonLayoutPanelInput = {
  panelKey: string;
  title: string;
  order: number;
  items: RibbonLayoutItemInput[];
};

export type RibbonLayoutTabInput = {
  tabKey: string;
  title: string;
  order: number;
  panels: RibbonLayoutPanelInput[];
};

export type RibbonLayoutDocumentInput = {
  pluginSlug: string;
  tabs: RibbonLayoutTabInput[];
};

export type RibbonLayoutItemDocument = RibbonLayoutItemInput;
export type RibbonLayoutPanelDocument = RibbonLayoutPanelInput;
export type RibbonLayoutTabDocument = RibbonLayoutTabInput;

export type RibbonLayoutDocument = {
  pluginSlug: string;
  tabs: RibbonLayoutTabDocument[];
  versions: PluginConfigurationVersionState;
};

export type FlattenedRibbonLayout = {
  tabs: Array<{
    pluginSlug: string;
    tabKey: string;
    title: string;
    order: number;
  }>;
  panels: Array<{
    pluginSlug: string;
    panelKey: string;
    tabKey: string;
    title: string;
    order: number;
  }>;
  items: Array<{
    pluginSlug: string;
    itemKey: string;
    panelKey: string;
    order: number;
    kind: RibbonItemKind;
    size: string | null;
    commandKey: string | null;
    iconCommandKey: string | null;
    parentItemKey: string | null;
    title: string | null;
  }>;
};

export type RibbonFlatItemRecord = Pick<
  RibbonItem,
  | "itemKey"
  | "panelKey"
  | "order"
  | "kind"
  | "size"
  | "commandKey"
  | "iconCommandKey"
  | "parentItemKey"
  | "title"
>;

export type RibbonItemNode = RibbonFlatItemRecord & {
  children: RibbonItemNode[];
};

export async function replaceRibbonLayout(
  prisma: PrismaClient,
  input: RibbonLayoutDocumentInput
): Promise<{
  pluginSlug: string;
  tabsPersisted: number;
  panelsPersisted: number;
  itemsPersisted: number;
  changed: boolean;
  versions: PluginConfigurationVersionState;
}> {
  const normalizedLayout = normalizeRibbonLayoutDocument(input);
  validateRibbonLayoutDocument(normalizedLayout);

  const existingLayout = await getRibbonLayoutDocument(prisma, { pluginSlug: input.pluginSlug });
  if (
    serializeNormalizedRibbonLayout(normalizedLayout) ===
    serializeNormalizedRibbonLayout({
      pluginSlug: existingLayout.pluginSlug,
      tabs: existingLayout.tabs,
    })
  ) {
    return {
      pluginSlug: input.pluginSlug,
      tabsPersisted: normalizedLayout.tabs.length,
      panelsPersisted: normalizedLayout.tabs.reduce((count, tab) => count + tab.panels.length, 0),
      itemsPersisted: flattenRibbonLayoutDocument(normalizedLayout).items.length,
      changed: false,
      versions: existingLayout.versions,
    };
  }

  const flattenedLayout = flattenRibbonLayoutDocument(normalizedLayout);

  const versions = await prisma.$transaction(async (tx) => {
    await tx.ribbonItem.deleteMany({ where: { pluginSlug: input.pluginSlug } });
    await tx.ribbonPanel.deleteMany({ where: { pluginSlug: input.pluginSlug } });
    await tx.ribbonTab.deleteMany({ where: { pluginSlug: input.pluginSlug } });

    if (flattenedLayout.tabs.length > 0) {
      await tx.ribbonTab.createMany({ data: flattenedLayout.tabs });
    }

    if (flattenedLayout.panels.length > 0) {
      await tx.ribbonPanel.createMany({ data: flattenedLayout.panels });
    }

    if (flattenedLayout.items.length > 0) {
      await tx.ribbonItem.createMany({ data: flattenedLayout.items });
    }

    return bumpRibbonLayoutVersion(tx, input.pluginSlug);
  });

  return {
    pluginSlug: input.pluginSlug,
    tabsPersisted: flattenedLayout.tabs.length,
    panelsPersisted: flattenedLayout.panels.length,
    itemsPersisted: flattenedLayout.items.length,
    changed: true,
    versions,
  };
}

export async function getRibbonLayoutDocument(
  prisma: RibbonLayoutDb,
  input: { pluginSlug: string }
): Promise<RibbonLayoutDocument> {
  const [tabs, panels, items, versions] = await Promise.all([
    prisma.ribbonTab.findMany({
      where: { pluginSlug: input.pluginSlug },
      orderBy: [{ order: "asc" }, { tabKey: "asc" }],
    }),
    prisma.ribbonPanel.findMany({
      where: { pluginSlug: input.pluginSlug },
      orderBy: [{ tabKey: "asc" }, { order: "asc" }, { panelKey: "asc" }],
    }),
    prisma.ribbonItem.findMany({
      where: { pluginSlug: input.pluginSlug },
      orderBy: [{ panelKey: "asc" }, { order: "asc" }, { itemKey: "asc" }],
    }),
    getPluginConfigurationState(prisma, input.pluginSlug),
  ]);

  const tabsByKey = new Map(tabs.map((tab) => [tab.tabKey, tab]));
  const panelsByKey = new Map(panels.map((panel) => [panel.panelKey, panel]));
  const itemsByKey = new Map(items.map((item) => [item.itemKey, item]));

  for (const panel of panels) {
    if (!tabsByKey.has(panel.tabKey)) {
      throw new RibbonLayoutError(
        "ORPHAN_PANEL",
        500,
        `Ribbon panel ${panel.panelKey} references missing tab ${panel.tabKey}.`
      );
    }
  }

  for (const item of items) {
    if (!panelsByKey.has(item.panelKey)) {
      throw new RibbonLayoutError(
        "ORPHAN_ITEM_PANEL",
        500,
        `Ribbon item ${item.itemKey} references missing panel ${item.panelKey}.`
      );
    }

    if (item.parentItemKey) {
      const parentItem = itemsByKey.get(item.parentItemKey);
      if (!parentItem) {
        throw new RibbonLayoutError(
          "ORPHAN_ITEM_PARENT",
          500,
          `Ribbon item ${item.itemKey} references missing parent ${item.parentItemKey}.`
        );
      }

      if (parentItem.panelKey !== item.panelKey) {
        throw new RibbonLayoutError(
          "CROSS_PANEL_PARENT",
          500,
          `Ribbon item ${item.itemKey} references a parent in a different panel.`
        );
      }
    }
  }

  const document: RibbonLayoutDocumentInput = {
    pluginSlug: input.pluginSlug,
    tabs: tabs.map((tab) => ({
      tabKey: tab.tabKey,
      title: tab.title,
      order: tab.order,
      panels: panels
        .filter((panel) => panel.tabKey === tab.tabKey)
        .map((panel) => ({
          panelKey: panel.panelKey,
          title: panel.title,
          order: panel.order,
          items: buildRibbonItemHierarchy(
            items
              .filter((item) => item.panelKey === panel.panelKey)
              .map((item) => ({
                itemKey: item.itemKey,
                panelKey: item.panelKey,
                order: item.order,
                kind: item.kind,
                size: item.size,
                commandKey: item.commandKey,
                iconCommandKey: item.iconCommandKey,
                parentItemKey: item.parentItemKey,
                title: item.title,
              }))
          ).map(convertRibbonNodeToDocumentItem),
        })),
    })),
  };

  const normalizedDocument = normalizeRibbonLayoutDocument(document);
  validateRibbonLayoutDocument(normalizedDocument);

  return {
    pluginSlug: input.pluginSlug,
    tabs: normalizedDocument.tabs,
    versions,
  };
}

export function buildRibbonItemHierarchy(items: RibbonFlatItemRecord[]): RibbonItemNode[] {
  const nodesByItemKey = new Map<string, RibbonItemNode>();
  for (const item of items) {
    nodesByItemKey.set(item.itemKey, {
      ...item,
      children: [],
    });
  }

  const rootNodes: RibbonItemNode[] = [];
  for (const item of items) {
    const node = nodesByItemKey.get(item.itemKey);
    if (!node) {
      continue;
    }

    if (item.parentItemKey) {
      const parentNode = nodesByItemKey.get(item.parentItemKey);
      if (parentNode) {
        parentNode.children.push(node);
        continue;
      }
    }

    rootNodes.push(node);
  }

  return sortRibbonNodes(rootNodes);
}

export function validateRibbonLayoutDocument(input: RibbonLayoutDocumentInput): void {
  if (!input.pluginSlug.trim()) {
    throw new RibbonLayoutError("INVALID_PLUGIN_SLUG", 400, "pluginSlug is required.");
  }

  const tabKeys = new Set<string>();
  const tabOrders = new Set<number>();
  const panelKeys = new Set<string>();
  const itemKeys = new Set<string>();

  for (const tab of input.tabs) {
    if (!tab.tabKey.trim() || !tab.title.trim()) {
      throw new RibbonLayoutError("INVALID_TAB", 400, "Each ribbon tab requires tabKey and title.");
    }

    if (tabKeys.has(tab.tabKey)) {
      throw new RibbonLayoutError("DUPLICATE_TAB_KEY", 400, `Duplicate tabKey: ${tab.tabKey}`);
    }

    if (tabOrders.has(tab.order)) {
      throw new RibbonLayoutError(
        "DUPLICATE_TAB_ORDER",
        400,
        `Duplicate tab order ${tab.order} for plugin ${input.pluginSlug}.`
      );
    }

    tabKeys.add(tab.tabKey);
    tabOrders.add(tab.order);

    const panelOrders = new Set<number>();
    for (const panel of tab.panels) {
      if (!panel.panelKey.trim() || !panel.title.trim()) {
        throw new RibbonLayoutError(
          "INVALID_PANEL",
          400,
          `Each ribbon panel requires panelKey and title under tab ${tab.tabKey}.`
        );
      }

      if (panelKeys.has(panel.panelKey)) {
        throw new RibbonLayoutError("DUPLICATE_PANEL_KEY", 400, `Duplicate panelKey: ${panel.panelKey}`);
      }

      if (panelOrders.has(panel.order)) {
        throw new RibbonLayoutError(
          "DUPLICATE_PANEL_ORDER",
          400,
          `Duplicate panel order ${panel.order} under tab ${tab.tabKey}.`
        );
      }

      panelKeys.add(panel.panelKey);
      panelOrders.add(panel.order);
      validateRibbonItemSiblings(panel.items, panel.panelKey, itemKeys);
    }
  }
}

export function normalizeRibbonLayoutDocument(input: RibbonLayoutDocumentInput): RibbonLayoutDocumentInput {
  return {
    pluginSlug: input.pluginSlug.trim(),
    tabs: [...input.tabs]
      .map((tab) => ({
        tabKey: tab.tabKey.trim(),
        title: tab.title.trim(),
        order: tab.order,
        panels: [...tab.panels]
          .map((panel) => ({
            panelKey: panel.panelKey.trim(),
            title: panel.title.trim(),
            order: panel.order,
            items: normalizeRibbonItems(panel.items),
          }))
          .sort(compareByOrderThenKey("panelKey")),
      }))
      .sort(compareByOrderThenKey("tabKey")),
  };
}

function normalizeRibbonItems(items: RibbonLayoutItemInput[]): RibbonLayoutItemInput[] {
  return [...items]
    .map((item) => ({
      itemKey: item.itemKey.trim(),
      order: item.order,
      kind: item.kind,
      size: trimOptional(item.size),
      commandKey: trimOptional(item.commandKey),
      iconCommandKey: trimOptional(item.iconCommandKey),
      title: trimOptional(item.title),
      children: normalizeRibbonItems(item.children ?? []),
    }))
    .sort(compareByOrderThenKey("itemKey"));
}

export function flattenRibbonLayoutDocument(input: RibbonLayoutDocumentInput): FlattenedRibbonLayout {
  const tabs: FlattenedRibbonLayout["tabs"] = [];
  const panels: FlattenedRibbonLayout["panels"] = [];
  const items: FlattenedRibbonLayout["items"] = [];

  for (const tab of input.tabs) {
    tabs.push({
      pluginSlug: input.pluginSlug,
      tabKey: tab.tabKey,
      title: tab.title,
      order: tab.order,
    });

    for (const panel of tab.panels) {
      panels.push({
        pluginSlug: input.pluginSlug,
        panelKey: panel.panelKey,
        tabKey: tab.tabKey,
        title: panel.title,
        order: panel.order,
      });

      flattenRibbonItems(items, input.pluginSlug, panel.panelKey, null, panel.items);
    }
  }

  return { tabs, panels, items };
}

function flattenRibbonItems(
  items: FlattenedRibbonLayout["items"],
  pluginSlug: string,
  panelKey: string,
  parentItemKey: string | null,
  children: RibbonLayoutItemInput[]
): void {
  for (const child of children) {
    items.push({
      pluginSlug,
      itemKey: child.itemKey,
      panelKey,
      order: child.order,
      kind: child.kind,
      size: trimOptional(child.size),
      commandKey: trimOptional(child.commandKey),
      iconCommandKey: trimOptional(child.iconCommandKey),
      parentItemKey,
      title: trimOptional(child.title),
    });

    flattenRibbonItems(items, pluginSlug, panelKey, child.itemKey, child.children ?? []);
  }
}

function validateRibbonItemSiblings(
  items: RibbonLayoutItemInput[],
  parentScopeKey: string,
  allItemKeys: Set<string>
): void {
  const itemOrders = new Set<number>();

  for (const item of items) {
    if (!item.itemKey.trim()) {
      throw new RibbonLayoutError(
        "INVALID_ITEM",
        400,
        `Each ribbon item requires itemKey under scope ${parentScopeKey}.`
      );
    }

    if (allItemKeys.has(item.itemKey)) {
      throw new RibbonLayoutError("DUPLICATE_ITEM_KEY", 400, `Duplicate itemKey: ${item.itemKey}`);
    }

    if (itemOrders.has(item.order)) {
      throw new RibbonLayoutError(
        "DUPLICATE_ITEM_ORDER",
        400,
        `Duplicate item order ${item.order} under scope ${parentScopeKey}.`
      );
    }

    allItemKeys.add(item.itemKey);
    itemOrders.add(item.order);

    validateRibbonItemKind(item);
    validateRibbonItemSiblings(item.children ?? [], item.itemKey, allItemKeys);
  }
}

function validateRibbonItemKind(item: RibbonLayoutItemInput): void {
  const children = item.children ?? [];
  const commandKey = trimOptional(item.commandKey);

  switch (item.kind) {
    case RibbonItemKind.push_button:
      if (!commandKey) {
        throw new RibbonLayoutError(
          "INVALID_PUSH_BUTTON",
          400,
          `push_button ${item.itemKey} must bind exactly one command.`
        );
      }

      if (children.length !== 0) {
        throw new RibbonLayoutError(
          "INVALID_PUSH_BUTTON_CHILDREN",
          400,
          `push_button ${item.itemKey} cannot contain child items.`
        );
      }
      return;

    case RibbonItemKind.stack_2:
      validateContainerItem(item, children.length === 2, "stack_2 must contain exactly 2 child items.");
      return;

    case RibbonItemKind.stack_3:
      validateContainerItem(item, children.length === 3, "stack_3 must contain exactly 3 child items.");
      return;

    case RibbonItemKind.pulldown:
      validateContainerItem(item, children.length >= 1, "pulldown must contain at least 1 child item.");
      return;

    case RibbonItemKind.split_button:
      validateContainerItem(item, children.length >= 1, "split_button must contain at least 1 child item.");
      return;

    case RibbonItemKind.separator:
      if (commandKey) {
        throw new RibbonLayoutError(
          "INVALID_SEPARATOR_COMMAND",
          400,
          `separator ${item.itemKey} cannot bind a command.`
        );
      }

      if (children.length !== 0) {
        throw new RibbonLayoutError(
          "INVALID_SEPARATOR_CHILDREN",
          400,
          `separator ${item.itemKey} cannot contain child items.`
        );
      }
      return;

    case RibbonItemKind.slideout:
      if (commandKey) {
        throw new RibbonLayoutError(
          "INVALID_SLIDEOUT_COMMAND",
          400,
          `slideout ${item.itemKey} cannot bind a command.`
        );
      }

      if (children.length !== 0) {
        throw new RibbonLayoutError(
          "INVALID_SLIDEOUT_CHILDREN",
          400,
          `slideout ${item.itemKey} cannot contain child items.`
        );
      }
      return;
  }
}

function validateContainerItem(
  item: RibbonLayoutItemInput,
  cardinalityIsValid: boolean,
  invalidCardinalityMessage: string
): void {
  if (trimOptional(item.commandKey)) {
    throw new RibbonLayoutError(
      "INVALID_CONTAINER_COMMAND",
      400,
      `${item.kind} ${item.itemKey} cannot bind a direct command.`
    );
  }

  if (!cardinalityIsValid) {
    throw new RibbonLayoutError("INVALID_CONTAINER_CARDINALITY", 400, `${item.itemKey} ${invalidCardinalityMessage}`);
  }
}

function compareByOrderThenKey<T extends { order: number }>(key: keyof T) {
  return (left: T, right: T): number => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }

    const leftKey = String(left[key]);
    const rightKey = String(right[key]);
    if (leftKey < rightKey) {
      return -1;
    }

    if (leftKey > rightKey) {
      return 1;
    }

    return 0;
  };
}

function sortRibbonNodes(nodes: RibbonItemNode[]): RibbonItemNode[] {
  return [...nodes]
    .sort(compareByOrderThenKey("itemKey"))
    .map((node) => ({
      ...node,
      children: sortRibbonNodes(node.children),
    }));
}

function convertRibbonNodeToDocumentItem(node: RibbonItemNode): RibbonLayoutItemDocument {
  return {
    itemKey: node.itemKey,
    order: node.order,
    kind: node.kind,
    size: node.size,
    commandKey: node.commandKey,
    iconCommandKey: node.iconCommandKey,
    title: node.title,
    children: node.children.map(convertRibbonNodeToDocumentItem),
  };
}

function serializeNormalizedRibbonLayout(input: RibbonLayoutDocumentInput): string {
  return JSON.stringify(input);
}

function trimOptional(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
}
