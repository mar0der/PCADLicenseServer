import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/adminAuth";
import prisma from "@/lib/prisma";
import { seedDokaflexCommandCatalog } from "@/lib/access-control/dokaflexCatalog";
import { seedDokaflexRibbonLayout } from "@/lib/ribbon-layout/dokaflexLayout";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const commandResult = await seedDokaflexCommandCatalog(prisma);
    const layoutResult = await seedDokaflexRibbonLayout(prisma);

    return NextResponse.json(
      {
        ...commandResult,
        layout: layoutResult,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Dokaflex bootstrap API error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
