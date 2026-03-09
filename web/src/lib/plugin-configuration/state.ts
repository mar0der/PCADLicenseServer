import { Prisma, PrismaClient } from "@prisma/client";

type PluginConfigurationDb = PrismaClient | Prisma.TransactionClient;

export type PluginConfigurationVersionState = {
  pluginSlug: string;
  capabilityCatalogVersion: number;
  ribbonLayoutVersion: number;
  configVersion: number;
};

export async function getPluginConfigurationState(
  prisma: PluginConfigurationDb,
  pluginSlug: string
): Promise<PluginConfigurationVersionState> {
  const state = await prisma.pluginConfigurationState.findUnique({
    where: { pluginSlug },
  });

  if (state) {
    return state;
  }

  return prisma.pluginConfigurationState.create({
    data: { pluginSlug },
  });
}

export async function bumpCapabilityCatalogVersion(
  prisma: PluginConfigurationDb,
  pluginSlug: string
): Promise<PluginConfigurationVersionState> {
  await getPluginConfigurationState(prisma, pluginSlug);

  return prisma.pluginConfigurationState.update({
    where: { pluginSlug },
    data: {
      capabilityCatalogVersion: { increment: 1 },
      configVersion: { increment: 1 },
    },
  });
}

export async function bumpRibbonLayoutVersion(
  prisma: PluginConfigurationDb,
  pluginSlug: string
): Promise<PluginConfigurationVersionState> {
  await getPluginConfigurationState(prisma, pluginSlug);

  return prisma.pluginConfigurationState.update({
    where: { pluginSlug },
    data: {
      ribbonLayoutVersion: { increment: 1 },
      configVersion: { increment: 1 },
    },
  });
}
