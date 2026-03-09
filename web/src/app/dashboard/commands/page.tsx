import prisma from "@/lib/prisma";
import { DEFAULT_PLUGIN_SLUG } from "@/lib/access-control/compat";
import {
  getCommandUsageAggregates,
  getRibbonLayoutViewModel,
} from "@/lib/plugin-data/analyticsService";
import { buildRibbonCommandCatalogRows } from "@/lib/dashboard/dokaflexAdmin";
import { getRibbonLayoutDocument } from "@/lib/ribbon-layout/service";
import CommandsClient from "./CommandsClient";
import DokaflexRibbonAnalyticsSection from "./DokaflexRibbonAnalyticsSection";

export const dynamic = 'force-dynamic';

export default async function CommandsPage() {
    const [commands, dokaflexRibbonView, layoutDocument, usageAggregates] = await Promise.all([
        prisma.command.findMany({
            where: { pluginSlug: DEFAULT_PLUGIN_SLUG },
            orderBy: { commandKey: "asc" },
        }),
        getRibbonLayoutViewModel(prisma, { pluginSlug: DEFAULT_PLUGIN_SLUG }),
        getRibbonLayoutDocument(prisma, { pluginSlug: DEFAULT_PLUGIN_SLUG }),
        getCommandUsageAggregates(prisma, { pluginSlug: DEFAULT_PLUGIN_SLUG }),
    ]);

    const usageByCommandKey = new Map(
        usageAggregates.map((summary) => [summary.commandKey, summary])
    );
    const rows = buildRibbonCommandCatalogRows({
        layout: {
            pluginSlug: layoutDocument.pluginSlug,
            tabs: layoutDocument.tabs,
        },
        commands: commands.map((command) => {
            const usage = usageByCommandKey.get(command.commandKey);
            return {
                commandKey: command.commandKey,
                displayName: command.displayName,
                manifestTitle: command.manifestTitle,
                stage: command.stage,
                iconDataUri: usage?.iconDataUri ?? null,
                totalUses: usage?.totalUses ?? 0,
                uniqueUsers: usage?.uniqueUsers ?? 0,
                lastUsedAtUtc: usage?.lastUsedAtUtc?.toISOString() ?? null,
            };
        }),
    });

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold tracking-tight mb-8">Dokaflex Catalog And Usage</h1>
            <DokaflexRibbonAnalyticsSection viewModel={dokaflexRibbonView} />
            <CommandsClient
                rows={rows}
                versions={dokaflexRibbonView.versions}
            />
        </div>
    );
}
