import {
  CommandStage,
  Prisma,
  PrismaClient,
} from "@prisma/client";

import { DEFAULT_PLUGIN_SLUG, accessLevelFromCommandStage } from "../access-control/compat";
import {
  bumpCapabilityCatalogVersion,
  getPluginConfigurationState,
  type PluginConfigurationVersionState,
} from "../plugin-configuration/state";
import { PluginDataError } from "./error";

type PluginDataDb = PrismaClient | Prisma.TransactionClient;

export type PluginCatalogCommandInput = {
  commandKey: string;
  displayName: string;
  manifestTitle?: string | null;
  iconCommandKey?: string | null;
  stage?: CommandStage | null;
  category?: string | null;
  description?: string | null;
};

export type PluginCatalogIconAssetInput = {
  iconKey: string;
  dataUri: string;
  contentType?: string | null;
};

export type PluginCatalogSyncInput = {
  pluginSlug: string;
  commands: PluginCatalogCommandInput[];
  iconAssets: PluginCatalogIconAssetInput[];
};

export type PluginCatalogSyncResult = {
  pluginSlug: string;
  commandsProcessed: number;
  iconAssetsProcessed: number;
  changed: boolean;
  versions: PluginConfigurationVersionState;
};

export async function syncPluginCatalog(
  prisma: PrismaClient,
  input: PluginCatalogSyncInput
): Promise<PluginCatalogSyncResult> {
  validateCatalogSyncInput(input);

  let changed = false;
  let versions: PluginConfigurationVersionState | null = null;

  await prisma.$transaction(async (tx) => {
    for (const command of input.commands) {
      changed = (await upsertCommand(tx, input.pluginSlug, command)) || changed;
    }

    for (const iconAsset of input.iconAssets) {
      changed = (await upsertIconAsset(tx, input.pluginSlug, iconAsset)) || changed;
    }

    versions = changed
      ? await bumpCapabilityCatalogVersion(tx, input.pluginSlug)
      : await getPluginConfigurationState(tx, input.pluginSlug);
  });

  return {
    pluginSlug: input.pluginSlug,
    commandsProcessed: input.commands.length,
    iconAssetsProcessed: input.iconAssets.length,
    changed,
    versions: versions!,
  };
}

function validateCatalogSyncInput(input: PluginCatalogSyncInput): void {
  if (!input.pluginSlug.trim()) {
    throw new PluginDataError("INVALID_PLUGIN_SLUG", 400, "pluginSlug is required.");
  }

  for (const command of input.commands) {
    if (!command.commandKey.trim() || !command.displayName.trim()) {
      throw new PluginDataError(
        "INVALID_COMMAND",
        400,
        "Every command must include commandKey and displayName."
      );
    }
  }

  for (const iconAsset of input.iconAssets) {
    if (!iconAsset.iconKey.trim() || !iconAsset.dataUri.trim()) {
      throw new PluginDataError(
        "INVALID_ICON_ASSET",
        400,
        "Every icon asset must include iconKey and dataUri."
      );
    }
  }
}

async function upsertCommand(
  prisma: PluginDataDb,
  pluginSlug: string,
  command: PluginCatalogCommandInput
): Promise<boolean> {
  const commandKey = command.commandKey.trim();
  const displayName = command.displayName.trim();
  const manifestTitle = trimOptional(command.manifestTitle) ?? displayName;
  const iconCommandKey = trimOptional(command.iconCommandKey) ?? commandKey;
  const category = trimOptional(command.category);
  const description = trimOptional(command.description);
  const defaultStage = command.stage ?? CommandStage.RELEASED;

  const existingCommand = await prisma.command.findUnique({
    where: {
      pluginSlug_commandKey: {
        pluginSlug,
        commandKey,
      },
    },
  });

  if (!existingCommand) {
    await prisma.command.create({
      data: {
        pluginSlug,
        commandKey,
        displayName,
        manifestTitle,
        iconCommandKey,
        category,
        description,
        stage: defaultStage,
        uniqueName: buildLegacyCompatibleUniqueName(pluginSlug, commandKey),
        descriptiveName: displayName,
        requiredAccessLevel: accessLevelFromCommandStage(defaultStage),
      },
    });

    return true;
  }

  const updateData = {
    displayName,
    manifestTitle,
    iconCommandKey,
    category,
    description,
    uniqueName: buildLegacyCompatibleUniqueName(pluginSlug, commandKey),
    descriptiveName: displayName,
  };

  if (
    existingCommand.displayName === updateData.displayName &&
    existingCommand.manifestTitle === updateData.manifestTitle &&
    existingCommand.iconCommandKey === updateData.iconCommandKey &&
    existingCommand.category === updateData.category &&
    existingCommand.description === updateData.description &&
    existingCommand.uniqueName === updateData.uniqueName &&
    existingCommand.descriptiveName === updateData.descriptiveName
  ) {
    return false;
  }

  await prisma.command.update({
    where: { id: existingCommand.id },
    data: updateData,
  });

  return true;
}

async function upsertIconAsset(
  prisma: PluginDataDb,
  pluginSlug: string,
  iconAsset: PluginCatalogIconAssetInput
): Promise<boolean> {
  const iconKey = iconAsset.iconKey.trim();
  const contentType = trimOptional(iconAsset.contentType);
  const dataUri = iconAsset.dataUri.trim();

  const existingIconAsset = await prisma.iconAsset.findUnique({
    where: {
      pluginSlug_iconKey: {
        pluginSlug,
        iconKey,
      },
    },
  });

  if (!existingIconAsset) {
    await prisma.iconAsset.create({
      data: {
        pluginSlug,
        iconKey,
        contentType,
        dataUri,
      },
    });

    return true;
  }

  if (
    existingIconAsset.contentType === contentType &&
    existingIconAsset.dataUri === dataUri
  ) {
    return false;
  }

  await prisma.iconAsset.update({
    where: { id: existingIconAsset.id },
    data: {
      contentType,
      dataUri,
    },
  });

  return true;
}

function buildLegacyCompatibleUniqueName(pluginSlug: string, commandKey: string): string {
  if (pluginSlug === DEFAULT_PLUGIN_SLUG) {
    return commandKey;
  }

  return `${pluginSlug}:${commandKey}`;
}

function trimOptional(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
}
