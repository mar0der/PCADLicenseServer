import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/adminAuth";
import prisma from "@/lib/prisma";
import {
  getRibbonLayoutDocument,
  replaceRibbonLayout,
  RibbonLayoutError,
  type RibbonLayoutDocumentInput,
} from "@/lib/ribbon-layout/service";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const pluginSlug = searchParams.get("pluginSlug");
  if (!pluginSlug) {
    return new NextResponse("pluginSlug is required", { status: 400 });
  }

  try {
    const layout = await getRibbonLayoutDocument(prisma, { pluginSlug });
    return NextResponse.json(layout, { status: 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const body = (await req.json()) as RibbonLayoutDocumentInput;
    const result = await replaceRibbonLayout(prisma, body);
    const layout = await getRibbonLayoutDocument(prisma, { pluginSlug: body.pluginSlug });

    return NextResponse.json(
      {
        ...result,
        layout,
      },
      { status: 200 }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof RibbonLayoutError) {
    return NextResponse.json(
      {
        code: error.code,
        message: error.message,
      },
      { status: error.status }
    );
  }

  console.error("Ribbon layout API error:", error);
  return new NextResponse("Internal server error", { status: 500 });
}
