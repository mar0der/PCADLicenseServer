import { NextResponse } from "next/server";
import { CommandStage } from "@prisma/client";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import prisma from "@/lib/prisma";
import {
  accessLevelFromCommandStage,
  commandStageFromAccessLevel,
  DEFAULT_PLUGIN_SLUG,
} from "@/lib/access-control/compat";

type CommandUpdatePayload = {
  descriptiveName?: string;
  displayName?: string;
  requiredAccessLevel?: number;
  stage?: CommandStage;
};

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
        stage: resolvedStage,
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
    const { id, descriptiveName, requiredAccessLevel, stage } = (await req.json()) as {
      id?: string;
      descriptiveName?: string;
      requiredAccessLevel?: number;
      stage?: CommandStage;
    };

    if (!id) {
      return new NextResponse("Bad Request", { status: 400 });
    }

    const dataToUpdate: CommandUpdatePayload = {};
    if (descriptiveName) {
      const trimmedName = descriptiveName.trim();
      dataToUpdate.descriptiveName = trimmedName;
      dataToUpdate.displayName = trimmedName;
    }

    const resolvedStage = stage ?? (requiredAccessLevel !== undefined ? commandStageFromAccessLevel(requiredAccessLevel) : undefined);
    if (resolvedStage) {
      dataToUpdate.stage = resolvedStage;
      dataToUpdate.requiredAccessLevel = requiredAccessLevel ?? accessLevelFromCommandStage(resolvedStage);
    } else if (requiredAccessLevel !== undefined) {
      dataToUpdate.requiredAccessLevel = requiredAccessLevel;
    }

    const command = await prisma.command.update({
      where: { id },
      data: dataToUpdate,
    });

    return NextResponse.json(command, { status: 200 });
  } catch (error) {
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
