import { NextResponse } from "next/server";
import { UserCommandOverrideEffect } from "@prisma/client";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/adminAuth";
import prisma from "@/lib/prisma";
import {
  AccessControlServiceError,
  createUserCommandOverride,
  deleteUserCommandOverride,
  listUserCommandOverrides,
} from "@/lib/access-control/service";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username");
  const pluginSlug = searchParams.get("pluginSlug");

  if (!username || !pluginSlug) {
    return new NextResponse("username and pluginSlug are required", { status: 400 });
  }

  try {
    const result = await listUserCommandOverrides(prisma, { username, pluginSlug });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      username?: string;
      pluginSlug?: string;
      commandKey?: string;
      effect?: UserCommandOverrideEffect;
      expiresAt?: string | null;
      reason?: string | null;
    };

    if (!body.username || !body.pluginSlug || !body.commandKey || !body.effect) {
      return new NextResponse("username, pluginSlug, commandKey, and effect are required", { status: 400 });
    }

    const result = await createUserCommandOverride(prisma, {
      username: body.username,
      pluginSlug: body.pluginSlug,
      commandKey: body.commandKey,
      effect: body.effect,
      expiresAt: body.expiresAt,
      reason: body.reason,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return new NextResponse("id is required", { status: 400 });
  }

  try {
    await deleteUserCommandOverride(prisma, { id });
    return new NextResponse("Deleted", { status: 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof AccessControlServiceError) {
    return NextResponse.json(
      {
        code: error.code,
        message: error.message,
      },
      { status: error.status }
    );
  }

  console.error("Override API error:", error);
  return new NextResponse("Internal server error", { status: 500 });
}
