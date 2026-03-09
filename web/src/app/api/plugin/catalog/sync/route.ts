import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { handlePluginCatalogSyncRequest } from "@/lib/plugin-data/catalogEndpoint";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const result = await handlePluginCatalogSyncRequest(prisma, {
    rawBody,
    signature: req.headers.get("X-Plugin-Signature"),
  });

  return NextResponse.json(result.body, { status: result.status });
}
