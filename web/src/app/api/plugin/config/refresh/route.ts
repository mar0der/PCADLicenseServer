import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { handlePluginConfigRefreshRequest } from "@/lib/plugin-configuration/refreshEndpoint";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const result = await handlePluginConfigRefreshRequest(prisma, {
    rawBody,
    signature: req.headers.get("X-Plugin-Signature"),
  });

  return NextResponse.json(result.body, { status: result.status });
}
