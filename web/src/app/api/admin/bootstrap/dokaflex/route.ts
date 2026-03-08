import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import prisma from "@/lib/prisma";
import { seedDokaflexCommandCatalog } from "@/lib/access-control/dokaflexCatalog";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const result = await seedDokaflexCommandCatalog(prisma);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Dokaflex bootstrap API error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
