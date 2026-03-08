import { NextResponse } from "next/server";
import { BaseRole } from "@prisma/client";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import prisma from "@/lib/prisma";
import { accessLevelFromBaseRole, baseRoleFromAccessLevel } from "@/lib/access-control/compat";

type UserUpdatePayload = {
  isActive?: boolean;
  accessLevel?: number;
  baseRole?: BaseRole;
};

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const { username, isActive, accessLevel, baseRole } = (await req.json()) as {
      username?: string;
      isActive?: boolean;
      accessLevel?: number;
      baseRole?: BaseRole;
    };

    if (!username) {
      return new NextResponse("Username required", { status: 400 });
    }

    const resolvedBaseRole = baseRole ?? baseRoleFromAccessLevel(accessLevel);
    const user = await prisma.user.create({
      data: {
        username,
        isActive: isActive ?? true,
        baseRole: resolvedBaseRole,
        accessLevel: accessLevel ?? accessLevelFromBaseRole(resolvedBaseRole),
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error("Error creating user:", error);
    const message =
      process.env.NODE_ENV !== "production" && error instanceof Error
        ? `Internal server error: ${error.message}`
        : "Internal server error";
    return new NextResponse(message, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const { id, isActive, accessLevel, baseRole } = (await req.json()) as {
      id?: string;
      isActive?: boolean;
      accessLevel?: number;
      baseRole?: BaseRole;
    };

    if (!id) {
      return new NextResponse("Bad Request", { status: 400 });
    }

    const dataToUpdate: UserUpdatePayload = {};
    if (isActive !== undefined) {
      dataToUpdate.isActive = isActive;
    }

    const resolvedBaseRole = baseRole ?? (accessLevel !== undefined ? baseRoleFromAccessLevel(accessLevel) : undefined);
    if (resolvedBaseRole) {
      dataToUpdate.baseRole = resolvedBaseRole;
      dataToUpdate.accessLevel = accessLevel ?? accessLevelFromBaseRole(resolvedBaseRole);
    } else if (accessLevel !== undefined) {
      dataToUpdate.accessLevel = accessLevel;
    }

    const user = await prisma.user.update({
      where: { id },
      data: dataToUpdate,
    });

    return NextResponse.json(user, { status: 200 });
  } catch (error) {
    console.error("Error updating user:", error);
    const message =
      process.env.NODE_ENV !== "production" && error instanceof Error
        ? `Internal server error: ${error.message}`
        : "Internal server error";
    return new NextResponse(message, { status: 500 });
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

    await prisma.user.delete({
      where: { id },
    });

    return new NextResponse("Deleted", { status: 200 });
  } catch (error) {
    console.error("Error deleting user:", error);
    const message =
      process.env.NODE_ENV !== "production" && error instanceof Error
        ? `Internal server error: ${error.message}`
        : "Internal server error";
    return new NextResponse(message, { status: 500 });
  }
}
