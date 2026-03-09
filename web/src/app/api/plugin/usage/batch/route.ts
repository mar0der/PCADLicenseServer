import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { handlePluginUsageBatchRequest } from "@/lib/plugin-data/usageBatchEndpoint";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const result = await handlePluginUsageBatchRequest(prisma, {
    rawBody,
    signature: req.headers.get("X-Plugin-Signature"),
  });

  return NextResponse.json(result.body, { status: result.status });
}
