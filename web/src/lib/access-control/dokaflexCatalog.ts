import { CommandStage, type PrismaClient } from "@prisma/client";

import { DEFAULT_PLUGIN_SLUG, accessLevelFromCommandStage } from "./compat";

export const DOKAFLEX_COMMAND_CATALOG = [
  { commandKey: "DF.UPDATE_PLUGIN", displayName: "Update Plugin", stage: CommandStage.RELEASED },
  { commandKey: "DF.COMMANDS_WINDOW", displayName: "Commands Window", stage: CommandStage.DEVELOPMENT },
  { commandKey: "DF.GENERATE_BEAM", displayName: "Generate Beam", stage: CommandStage.RELEASED },
  { commandKey: "DF.PLACE_PRIMARY_BEAMS", displayName: "Place Primary Beams", stage: CommandStage.RELEASED },
  { commandKey: "DF.PLACE_SECONDARY_BEAMS", displayName: "Place Secondary Beams", stage: CommandStage.RELEASED },
  { commandKey: "DF.PLACE_DOUBLER_BEAMS", displayName: "Place Doubler Beams", stage: CommandStage.RELEASED },
  { commandKey: "DF.ARRAY_PRIMARY", displayName: "Array Primary", stage: CommandStage.RELEASED },
  { commandKey: "DF.ARRAY_SECONDARY", displayName: "Array Secondary", stage: CommandStage.RELEASED },
  { commandKey: "DF.MOVE_FULL_BEAM", displayName: "Move Full Beam", stage: CommandStage.RELEASED },
  { commandKey: "DF.DELETE_RELATED_BEAMS", displayName: "Delete Related Beams", stage: CommandStage.RELEASED },
  { commandKey: "DF.DELETE_SELECTED_BEAMS", displayName: "Delete Selected Beams", stage: CommandStage.RELEASED },
  { commandKey: "DF.HIDE_UNHIDE_BEAMS", displayName: "Hide Unhide Beams", stage: CommandStage.RELEASED },
  { commandKey: "DF.USER_SETTINGS", displayName: "User Settings", stage: CommandStage.RELEASED },
  { commandKey: "DF.PARAMETER_EDITOR", displayName: "Parameter Editor", stage: CommandStage.RELEASED },
  { commandKey: "DF.SMART_ARRAY", displayName: "Smart Array", stage: CommandStage.TESTING },
] as const;

export async function seedDokaflexCommandCatalog(prisma: PrismaClient): Promise<{
  pluginSlug: string;
  createdCount: number;
  existingCount: number;
}> {
  let createdCount = 0;
  let existingCount = 0;

  for (const command of DOKAFLEX_COMMAND_CATALOG) {
    const existing = await prisma.command.findUnique({
      where: {
        pluginSlug_commandKey: {
          pluginSlug: DEFAULT_PLUGIN_SLUG,
          commandKey: command.commandKey,
        },
      },
    });

    if (existing) {
      existingCount += 1;
      continue;
    }

    await prisma.command.create({
      data: {
        pluginSlug: DEFAULT_PLUGIN_SLUG,
        commandKey: command.commandKey,
        displayName: command.displayName,
        stage: command.stage,
        uniqueName: command.commandKey,
        descriptiveName: command.displayName,
        requiredAccessLevel: accessLevelFromCommandStage(command.stage),
      },
    });
    createdCount += 1;
  }

  return {
    pluginSlug: DEFAULT_PLUGIN_SLUG,
    createdCount,
    existingCount,
  };
}
