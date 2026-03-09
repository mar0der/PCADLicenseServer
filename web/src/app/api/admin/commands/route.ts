import { NextResponse } from "next/server";
import { CommandStage } from "@prisma/client";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/adminAuth";
import prisma from "@/lib/prisma";
import {
  accessLevelFromCommandStage,
  commandStageFromAccessLevel,
  DEFAULT_PLUGIN_SLUG,
} from "@/lib/access-control/compat";
import {
  buildAdminCommandMetadataUpdate,
  validateAdminCommandMetadataUpdate,
} from "@/lib/commands/metadata";
import {
  bumpCapabilityCatalogVersion,
  getPluginConfigurationState,
} from "@/lib/plugin-configuration/state";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const pluginSlug = searchParams.get("pluginSlug")?.trim();

  try {
    const commands = await prisma.command.findMany({
      where: pluginSlug ? { pluginSlug } : undefined,
      orderBy: [{ pluginSlug: "asc" }, { commandKey: "asc" }],
    });

    return NextResponse.json(commands, { status: 200 });
  } catch (error) {
    console.error("Error listing commands:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const { uniqueName, descriptiveName, requiredAccessLevel, stage, pluginSlug } = (await req.json()) as {
      uniqueName?: string;
      descriptiveName?: string;
      requiredAccessLevel?: number;
      stage?: CommandStage;
      pluginSlug?: string;
    };

    if (!uniqueName || !descriptiveName) {
      return new NextResponse("Unique Name and Descriptive Name required", { status: 400 });
    }

    const resolvedStage = stage ?? commandStageFromAccessLevel(requiredAccessLevel);
    const command = await prisma.command.create({
      data: {
        pluginSlug: pluginSlug ?? DEFAULT_PLUGIN_SLUG,
        commandKey: uniqueName.trim(),
        displayName: descriptiveName.trim(),
        displayNameLocked: true,
        manifestTitle: descriptiveName.trim(),
        manifestTitleLocked: true,
        stage: resolvedStage,
        descriptionLocked: false,
        uniqueName: uniqueName.trim(),
        descriptiveName: descriptiveName.trim(),
        requiredAccessLevel: requiredAccessLevel ?? accessLevelFromCommandStage(resolvedStage),
      },
    });

    return NextResponse.json(command, { status: 201 });
  } catch (error) {
    console.error("Error creating command:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const payload = (await req.json()) as {
      id?: string;
      displayName?: string;
      descriptiveName?: string;
      manifestTitle?: string | null;
      description?: string | null;
      requiredAccessLevel?: number;
      stage?: CommandStage;
      commandKey?: string | null;
      uniqueName?: string | null;
      pluginSlug?: string | null;
    };
    const { id, requiredAccessLevel } = payload;

    if (!id) {
      return new NextResponse("Bad Request", { status: 400 });
    }

    const validationResult = validateAdminCommandMetadataUpdate({
      displayName: payload.displayName ?? payload.descriptiveName,
      manifestTitle: payload.manifestTitle,
      description: payload.description,
      stage: payload.stage ?? (requiredAccessLevel !== undefined ? commandStageFromAccessLevel(requiredAccessLevel) : undefined),
      commandKey: payload.commandKey,
      uniqueName: payload.uniqueName,
      pluginSlug: payload.pluginSlug,
    });

    if (!validationResult.ok) {
      return NextResponse.json({ message: validationResult.errors.join(" ") }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const existingCommand = await tx.command.findUnique({
        where: { id },
      });

      if (!existingCommand) {
        throw new Error("COMMAND_NOT_FOUND");
      }

      const adminUpdate = buildAdminCommandMetadataUpdate(
        existingCommand,
        validationResult.value
      );

      if (!adminUpdate.changed) {
        const versions = await getPluginConfigurationState(tx, existingCommand.pluginSlug);
        return {
          command: existingCommand,
          changed: false,
          versions,
        };
      }

      const command = await tx.command.update({
        where: { id },
        data: adminUpdate.data,
      });
      const versions = await bumpCapabilityCatalogVersion(tx, existingCommand.pluginSlug);

      return {
        command,
        changed: true,
        versions,
      };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "COMMAND_NOT_FOUND") {
      return new NextResponse("Command not found", { status: 404 });
    }

    console.error("Error updating command:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return new NextResponse("Bad Request", { status: 400 });
    }

    await prisma.command.delete({
      where: { id },
    });

    return new NextResponse("Deleted", { status: 200 });
  } catch (error) {
    console.error("Error deleting command:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
