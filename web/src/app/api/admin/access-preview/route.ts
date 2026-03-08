import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import prisma from "@/lib/prisma";
import { AccessControlServiceError, previewEffectiveAccess } from "@/lib/access-control/service";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      username?: string;
      pluginSlug?: string;
    };

    if (!body.username || !body.pluginSlug) {
      return new NextResponse("username and pluginSlug are required", { status: 400 });
    }

    const preview = await previewEffectiveAccess(prisma, {
      username: body.username,
      pluginSlug: body.pluginSlug,
    });

    return NextResponse.json(preview, { status: 200 });
  } catch (error) {
    if (error instanceof AccessControlServiceError) {
      return NextResponse.json(
        {
          code: error.code,
          message: error.message,
        },
        { status: error.status }
      );
    }

    console.error("Access preview API error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
