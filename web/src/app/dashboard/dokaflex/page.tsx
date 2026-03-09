import prisma from "@/lib/prisma";
import { DEFAULT_PLUGIN_SLUG } from "@/lib/access-control/compat";
import { getCommandUsageAggregates } from "@/lib/plugin-data/analyticsService";
import { getRibbonLayoutDocument } from "@/lib/ribbon-layout/service";
import DokaflexControlClient from "./DokaflexControlClient";

export const dynamic = "force-dynamic";

export default async function DokaflexPage() {
  const [layout, commands, usageAggregates] = await Promise.all([
    getRibbonLayoutDocument(prisma, { pluginSlug: DEFAULT_PLUGIN_SLUG }),
    prisma.command.findMany({
      where: { pluginSlug: DEFAULT_PLUGIN_SLUG },
      orderBy: { commandKey: "asc" },
    }),
    getCommandUsageAggregates(prisma, { pluginSlug: DEFAULT_PLUGIN_SLUG }),
  ]);

  const usageByCommandKey = new Map(
    usageAggregates.map((summary) => [summary.commandKey, summary])
  );

  const catalogEntries = commands.map((command) => {
    const usage = usageByCommandKey.get(command.commandKey);
    return {
      id: command.id,
      commandKey: command.commandKey,
      displayName: command.displayName,
      manifestTitle: command.manifestTitle,
      description: command.description,
      stage: command.stage,
      iconDataUri: usage?.iconDataUri ?? null,
      totalUses: usage?.totalUses ?? 0,
      uniqueUsers: usage?.uniqueUsers ?? 0,
      lastUsedAtUtc: usage?.lastUsedAtUtc?.toISOString() ?? null,
    };
  });

  return (
    <div className="p-8">
      <h1 className="mb-2 text-3xl font-bold tracking-tight">Dokaflex Control</h1>
      <p className="mb-8 max-w-3xl text-sm text-neutral-400">
        Manage the server-owned Dokaflex ribbon layout, local live-test readiness, and the
        command catalog context the plugin consumes from signed config snapshots.
      </p>
      <DokaflexControlClient
        initialCatalogEntries={catalogEntries}
        initialLayout={layout}
      />
    </div>
  );
}
