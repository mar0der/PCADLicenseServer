import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: "ready",
      database: "ok",
      time: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Readiness check failed", error);

    return NextResponse.json(
      {
        status: "not_ready",
        database: "error",
        time: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
