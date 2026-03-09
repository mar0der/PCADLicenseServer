import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/adminAuth";
import prisma from "@/lib/prisma";
import { seedDokaflexRibbonLayout } from "@/lib/ribbon-layout/dokaflexLayout";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const result = await seedDokaflexRibbonLayout(prisma);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Dokaflex ribbon layout bootstrap API error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
