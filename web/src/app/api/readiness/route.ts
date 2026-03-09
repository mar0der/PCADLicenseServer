import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { buildReadinessStatus, httpStatusFromReadiness } from "@/lib/runtime/status";

export async function GET() {
  const payload = await buildReadinessStatus({
    databaseCheck: async () => {
      await prisma.$queryRawUnsafe("SELECT 1");
    },
  });

  return NextResponse.json(payload, {
    status: httpStatusFromReadiness(payload),
  });
}
