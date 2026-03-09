import { PrismaClient } from "@prisma/client";

import {
  buildRibbonItemHierarchy,
  getRibbonLayoutDocument,
  type RibbonFlatItemRecord,
  type RibbonItemNode,
} from "../ribbon-layout/service";

export type { RibbonItemNode };
export { buildRibbonItemHierarchy };

export type CommandUsageAggregate = {
  commandKey: string;
  displayName: string;
  manifestTitle: string;
  description: string | null;
  iconKey: string | null;
  iconDataUri: string | null;
  iconContentType: string | null;
  totalUses: number;
  uniqueUsers: number;
  lastUsedAtUtc: Date | null;
};

export type CommandDailyUsagePoint = {
  dateUtc: string;
  totalUses: number;
};

export type RibbonLayoutViewModel = {
  pluginSlug: string;
  versions: {
    capabilityCatalogVersion: number;
    ribbonLayoutVersion: number;
    configVersion: number;
  };
  tabs: Array<{
    tabKey: string;
    title: string;
    order: number;
    panels: Array<{
      panelKey: string;
      title: string;
      order: number;
      items: RibbonLayoutItemViewModel[];
    }>;
  }>;
  commandSummaries: CommandUsageAggregate[];
};

export type RibbonLayoutItemViewModel = Omit<RibbonItemNode, "children"> & {
  resolvedTitle: string;
  displayName: string | null;
  shortLabel: string | null;
  tooltip: string | null;
  iconDataUri: string | null;
  iconContentType: string | null;
  analytics: {
    totalUses: number;
    uniqueUsers: number;
    lastUsedAtUtc: Date | null;
  } | null;
  children: RibbonLayoutItemViewModel[];
};

export async function getCommandUsageAggregates(
  prisma: PrismaClient,
  input: { pluginSlug: string }
): Promise<CommandUsageAggregate[]> {
  const [commands, icons, rawEvents] = await Promise.all([
    prisma.command.findMany({
      where: { pluginSlug: input.pluginSlug },
      orderBy: { commandKey: "asc" },
    }),
    prisma.iconAsset.findMany({
      where: { pluginSlug: input.pluginSlug },
    }),
    prisma.rawUsageEvent.findMany({
      where: { pluginSlug: input.pluginSlug },
      orderBy: { occurredAtUtc: "asc" },
    }),
  ]);

  const iconByKey = new Map(
    icons.map((icon) => [
      icon.iconKey,
      {
        iconDataUri: icon.dataUri,
        iconContentType: icon.contentType,
      },
    ])
  );

  const aggregateByCommandKey = new Map<
    string,
    { totalUses: number; usernames: Set<string>; lastUsedAtUtc: Date | null }
  >();
  for (const event of rawEvents) {
    const currentAggregate =
      aggregateByCommandKey.get(event.commandKey) ?? {
        totalUses: 0,
        usernames: new Set<string>(),
        lastUsedAtUtc: null,
      };

    currentAggregate.totalUses += 1;
    currentAggregate.usernames.add(event.username);
    currentAggregate.lastUsedAtUtc = event.occurredAtUtc;
    aggregateByCommandKey.set(event.commandKey, currentAggregate);
  }

  const commandKeys = new Set<string>([
    ...commands.map((command) => command.commandKey),
    ...aggregateByCommandKey.keys(),
  ]);

  return Array.from(commandKeys)
    .map((commandKey) => {
      const command = commands.find((candidate) => candidate.commandKey === commandKey);
      const aggregate = aggregateByCommandKey.get(commandKey);
      const iconKey = command?.iconCommandKey ?? commandKey;
      const icon = iconByKey.get(iconKey);

      return {
        commandKey,
        displayName: command?.displayName ?? commandKey,
        manifestTitle: command?.manifestTitle ?? command?.displayName ?? commandKey,
        description: command?.description ?? null,
        iconKey,
        iconDataUri: icon?.iconDataUri ?? null,
        iconContentType: icon?.iconContentType ?? null,
        totalUses: aggregate?.totalUses ?? 0,
        uniqueUsers: aggregate?.usernames.size ?? 0,
        lastUsedAtUtc: aggregate?.lastUsedAtUtc ?? null,
      };
    })
    .sort((left, right) => {
      if (right.totalUses !== left.totalUses) {
        return right.totalUses - left.totalUses;
      }

      if (left.commandKey < right.commandKey) {
        return -1;
      }

      if (left.commandKey > right.commandKey) {
        return 1;
      }

      return 0;
    });
}

export async function getCommandDailyUsageSeries(
  prisma: PrismaClient,
  input: { pluginSlug: string; commandKey: string }
): Promise<CommandDailyUsagePoint[]> {
  const events = await prisma.rawUsageEvent.findMany({
    where: {
      pluginSlug: input.pluginSlug,
      commandKey: input.commandKey,
    },
    orderBy: { occurredOnDateUtc: "asc" },
  });

  const totalsByDate = new Map<string, number>();
  for (const event of events) {
    const dateUtc = event.occurredOnDateUtc.toISOString().slice(0, 10);
    totalsByDate.set(dateUtc, (totalsByDate.get(dateUtc) ?? 0) + 1);
  }

  return Array.from(totalsByDate.entries()).map(([dateUtc, totalUses]) => ({
    dateUtc,
    totalUses,
  }));
}

export async function getRibbonLayoutViewModel(
  prisma: PrismaClient,
  input: { pluginSlug: string }
): Promise<RibbonLayoutViewModel> {
  const [layout, commandSummaries] = await Promise.all([
    getRibbonLayoutDocument(prisma, { pluginSlug: input.pluginSlug }),
    getCommandUsageAggregates(prisma, input),
  ]);

  const commandSummaryByKey = new Map(
    commandSummaries.map((summary) => [summary.commandKey, summary])
  );

  return {
    pluginSlug: input.pluginSlug,
    versions: {
      capabilityCatalogVersion: layout.versions.capabilityCatalogVersion,
      ribbonLayoutVersion: layout.versions.ribbonLayoutVersion,
      configVersion: layout.versions.configVersion,
    },
    commandSummaries,
    tabs: layout.tabs.map((tab) => ({
      tabKey: tab.tabKey,
      title: tab.title,
      order: tab.order,
      panels: tab.panels.map((panel) => ({
        panelKey: panel.panelKey,
        title: panel.title,
        order: panel.order,
        items: buildRibbonItemHierarchy(toFlatItems(panel.panelKey, null, panel.items)).map((itemNode) =>
          mapRibbonItemNode(itemNode, commandSummaryByKey)
        ),
      })),
    })),
  };
}

function mapRibbonItemNode(
  itemNode: RibbonItemNode,
  commandSummaryByKey: Map<string, CommandUsageAggregate>
): RibbonLayoutItemViewModel {
  const summary = itemNode.commandKey
    ? commandSummaryByKey.get(itemNode.commandKey) ?? {
        commandKey: itemNode.commandKey,
        displayName: itemNode.commandKey,
        manifestTitle: itemNode.commandKey,
        description: null,
        iconKey: itemNode.iconCommandKey ?? itemNode.commandKey,
        iconDataUri: null,
        iconContentType: null,
        totalUses: 0,
        uniqueUsers: 0,
        lastUsedAtUtc: null,
      }
    : null;

  return {
    ...itemNode,
    resolvedTitle: itemNode.title ?? summary?.manifestTitle ?? itemNode.itemKey,
    displayName: summary?.displayName ?? null,
    shortLabel: summary?.manifestTitle ?? null,
    tooltip: summary?.description ?? null,
    iconDataUri: summary?.iconDataUri ?? null,
    iconContentType: summary?.iconContentType ?? null,
    analytics: summary
      ? {
          totalUses: summary.totalUses,
          uniqueUsers: summary.uniqueUsers,
          lastUsedAtUtc: summary.lastUsedAtUtc,
        }
      : null,
    children: itemNode.children.map((childNode) =>
      mapRibbonItemNode(childNode, commandSummaryByKey)
    ),
  };
}

function toFlatItems(
  panelKey: string,
  parentItemKey: string | null,
  items: Awaited<ReturnType<typeof getRibbonLayoutDocument>>["tabs"][number]["panels"][number]["items"]
): RibbonFlatItemRecord[] {
  const flatItems: RibbonFlatItemRecord[] = [];

  for (const item of items) {
    flatItems.push({
      itemKey: item.itemKey,
      panelKey,
      order: item.order,
      kind: item.kind,
      size: item.size ?? null,
      commandKey: item.commandKey ?? null,
      iconCommandKey: item.iconCommandKey ?? null,
      parentItemKey,
      title: item.title ?? null,
    });

    flatItems.push(...toFlatItems(panelKey, item.itemKey, item.children ?? []));
  }

  return flatItems;
}
